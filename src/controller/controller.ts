import { ITEM_LABELS, ITEM_ICONS, type Item } from '../game/item-types';
import { neutral,validRoom } from '../network/protocol';
import { TouchState,type TouchAction } from './touch';

type PermissionOrientation=typeof DeviceOrientationEvent & {requestPermission?:()=>Promise<'granted'|'denied'>};
export class Controller {
  private socket:WebSocket|null=null;
  private readonly touch=new TouchState();
  private room='';
  private sequence=0;
  private activated=false;
  private joined=false;
  private host=false;
  private retry=0;
  private disposed=false;
  private steer=0;
  private gyro=false;
  private gyroCenter:number|null=null;
  private gyroSeen=false;
  private lastGyro=0;
  private phase='garage';
  private latency=0;
  private wakeLock:WakeLockSentinel|null=null;
  constructor(private readonly root:HTMLElement) {
    document.title='OpenKart Astra — Manette';root.className='controller';
    const room=new URLSearchParams(location.search).get('room')?.toUpperCase()??'';
    if(!validRoom(room)){this.pair();return;}
    this.room=room;this.render();this.connect();this.bind();
    setInterval(()=>{if(!this.disposed)this.sendControls();},40);
    setInterval(()=>{if(this.joined)this.send({type:'ping',time:performance.now()});},1800);
    window.addEventListener('pagehide',()=>{this.release();this.disposed=true;clearTimeout(this.retry);this.socket?.close();});
    window.addEventListener('blur',()=>this.release());
    document.addEventListener('visibilitychange',()=>{if(document.hidden){this.release();void this.wakeLock?.release();}else if(this.activated)void this.keepAwake();});
    const orientation=()=>{this.release();this.gyroCenter=null;};window.addEventListener('orientationchange',orientation);screen.orientation?.addEventListener('change',orientation);
    window.addEventListener('deviceorientation',e=>{
      if(!this.gyro||document.hidden)return;
      const angle=screen.orientation?.angle??(window as Window & {orientation?:number}).orientation??0;
      const value=Math.abs(angle)===90||angle===270?e.beta:e.gamma;
      if(value===null||!Number.isFinite(value))return;
      const raw=value*((angle===90)?-1:1);this.gyroCenter??=raw;
      this.steer=Math.max(-1,Math.min(1,(raw-this.gyroCenter)/28));this.lastGyro=performance.now();this.gyroSeen=true;
      this.get('#sensor-status').textContent='Incline pour tourner · Recentrer pour régler le neutre';
      this.get('#steer-dot').style.transform=`translateX(${this.steer*55}px)`;
    });
  }
  private get<E extends HTMLElement=HTMLElement>(selector:string):E {return this.root.querySelector<E>(selector)!;}
  private pair(message='Recopie les 6 caractères affichés dans le jeu.') {
    this.root.innerHTML=`<section class="phone-pair"><div class="wordmark">OPENKART<span> ASTRA</span></div><h1>À toi le volant.</h1><p id="pair-message"></p><form id="pair-form"><label for="code">CODE DE COURSE</label><input id="code" maxlength="6" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="ABC234" required><button class="start-button">CONNECTER →</button></form><small>Ouvre le jeu sur ton ordinateur et choisis « Mon téléphone ».</small></section>`;
    this.get('#pair-message').textContent=message;
    this.get('#pair-form').addEventListener('submit',e=>{e.preventDefault();const code=this.get<HTMLInputElement>('#code').value.toUpperCase().trim();if(!validRoom(code)){this.get('#pair-message').textContent='Le code contient 6 lettres ou chiffres. Vérifie-le sur le jeu.';return;}const url=new URL(location.href);url.searchParams.set('room',code);location.assign(url);});
  }
  private render() {
    this.root.innerHTML=`
      <header class="controller-head"><div class="wordmark">OPENKART<span> ASTRA</span></div><span class="phone-session">${this.room}</span><span id="link-state" role="status">CONNEXION…</span></header>
      <div id="activate-overlay" class="activate-overlay"><div><span class="eyebrow">PRÊT À PRENDRE LE VOLANT ?</span><h1>À toi de jouer.</h1><p>Garde le jeu ouvert sur l’ordinateur.<br>Deux doigts suffisent : une direction et les gaz.</p><button id="activate" class="start-button">ACTIVER LA MANETTE ↗</button><small>Plus confortable avec le téléphone en paysage.</small></div></div>
      <main class="controller-grid"><section class="steering"><div class="controller-label">DIRECTION <span id="steering-mode">TACTILE</span></div><div class="steering-gauge"><i id="steer-dot"></i></div><div class="direction-buttons"><button data-action="left" aria-label="Tourner à gauche">←<small>GAUCHE</small></button><button data-action="right" aria-label="Tourner à droite">→<small>DROITE</small></button></div><div class="sensor-tools"><button id="gyro">GYROSCOPE</button><button id="center" hidden>RECENTRER</button></div><p id="sensor-status" role="status">Maintiens une flèche pour tourner.</p></section>
      <section class="pedal-area"><div class="controller-readout"><div><b id="phone-speed">000</b><span>KM/H</span></div><div class="phone-race-meta"><small id="phone-race">EN ATTENTE DU DÉPART</small><small id="phone-inventory">PIÈCES 0/10</small></div></div><div class="utility-buttons"><button data-action="item">◎ OBJET</button><button data-action="backthrow" aria-label="Maintenir pour protéger, relâcher pour lancer vers l’arrière">↓ ARRIÈRE</button><button data-action="reset">↺ PISTE</button><button id="phone-pause">Ⅱ PAUSE</button></div><div class="pedal-buttons"><button data-action="brake" class="brake">FREIN<small>RALENTIR / RECULER</small></button><button data-action="drift" class="drift">DRIFT<small>RELÂCHER = TURBO</small></button><button data-action="gas" class="gas">GAZ<small>ACCÉLÉRER</small></button></div></section></main>
      <footer class="controller-footer"><span id="phone-hint">OBJET : MAINTENIR = PROTÉGER · RELÂCHER = LANCER</span><button id="phone-start">LANCER LA COURSE →</button></footer>
    `;
  }
  private connect() {
    if(this.disposed)return;
    this.socket=new WebSocket(`${location.protocol==='https:'?'wss':'ws'}://${location.host}/relay`);
    this.socket.onopen=()=>this.send({type:'join',role:'phone',room:this.room});
    this.socket.onmessage=e=>{
      let m;try{m=JSON.parse(e.data);}catch{return;}
      if(m.type==='error'){this.activated=false;this.disposed=true;this.socket?.close();this.pair(m.message);return;}
      if(m.type==='ready')this.joined=true;
      if(m.type==='peer'){this.host=!!m.connected;if(!this.host)this.release();this.status();}
      if(m.type==='pong'){this.latency=Math.round(performance.now()-m.time);this.status();}
      if(m.type==='status') {
        const itemButton=this.get('[data-action="item"]');
        const item=m.item&&Object.hasOwn(ITEM_LABELS,m.item)?m.item as Item:null;
        itemButton.innerHTML=item?ITEM_ICONS[item]+'<span>'+ITEM_LABELS[item]+'</span>':m.roulette?'⟳ ROULETTE':'? OBJET';
        this.get('#phone-inventory').textContent=(m.reserveItem&&Object.hasOwn(ITEM_LABELS,m.reserveItem)?'RÉSERVE : '+ITEM_LABELS[m.reserveItem as Item]+' · ':'')+'PIÈCES '+(m.coins??0)+'/10';
        itemButton.classList.toggle('item-ready',!!m.item);
        this.get('[data-action="backthrow"]').classList.toggle('item-ready',item==='banana'||item==='green-shell'||item==='red-shell');

        this.phase=m.phase;this.get('#phone-speed').textContent=String(Math.round(m.speed)).padStart(3,'0');
        this.get('#phone-race').textContent=m.phase==='garage'?'PRÊT AU DÉPART':m.phase==='paused'?'COURSE EN PAUSE':`TOUR ${m.lap} / 3`;
        this.get('#phone-start').textContent=m.phase==='paused'?'REPRENDRE →':m.phase==='finish'?'REJOUER ↻':m.phase==='garage'?'LANCER LA COURSE →':m.phase==='countdown'?'PRÉPARE-TOI…':'Ⅱ PAUSE';
      }
    };
    this.socket.onclose=()=>{this.joined=false;this.host=false;this.release();if(this.disposed)return;this.status();this.retry=window.setTimeout(()=>this.connect(),900);};
    this.socket.onerror=()=>this.socket?.close();
  }
  private status(){if(this.disposed)return;const label=this.get('#link-state');label.textContent=!this.joined?'RECONNEXION…':!this.host?'ORDINATEUR ABSENT':`CONNECTÉ · ${this.latency} MS`;label.classList.toggle('online',this.host&&this.joined);}
  private send(data:object){if(this.socket?.readyState===WebSocket.OPEN)this.socket.send(JSON.stringify(data));}
  private sendControls() {
    if(!this.activated||!this.joined||document.hidden)return;
    const controls=this.touch.read();if(this.gyro&&Math.abs(controls.steer)<.01)controls.steer=performance.now()-this.lastGyro<600?this.steer:0;
    this.send({type:'input',controls,sequence:++this.sequence});
  }
  private bind() {
    this.get('#activate').addEventListener('click',()=>{this.activated=true;this.get('#activate-overlay').hidden=true;this.sendControls();void this.keepAwake();});
    this.root.querySelectorAll<HTMLButtonElement>('[data-action]').forEach(button=>{
      button.addEventListener('pointerdown',e=>{if(!this.activated)return;e.preventDefault();button.setPointerCapture(e.pointerId);this.touch.press(e.pointerId,button.dataset.action as TouchAction);button.classList.add('pressed');this.sendControls();});
      const release=(e:PointerEvent)=>{this.touch.release(e.pointerId);button.classList.remove('pressed');this.sendControls();};
      ['pointerup','pointercancel','lostpointercapture'].forEach(type=>button.addEventListener(type,release as EventListener));
      button.addEventListener('contextmenu',e=>e.preventDefault());
    });
    this.get('#phone-start').addEventListener('click',()=>{if(this.activated)this.send({type:'action',action:['garage','finish'].includes(this.phase)?'start':'pause'});});
    this.get('#phone-pause').addEventListener('click',()=>this.send({type:'action',action:'pause'}));
    this.get('#gyro').addEventListener('click',()=>void this.enableGyro());
    this.get('#center').addEventListener('click',()=>{this.gyroCenter=null;this.steer=0;});
  }
  private async enableGyro() {
    const status=this.get('#sensor-status');
    if(this.gyro){this.gyro=false;this.steer=0;this.get('#steering-mode').textContent='TACTILE';this.get('#gyro').textContent='GYROSCOPE';this.get('#center').hidden=true;status.textContent='Maintiens une flèche pour tourner.';return;}
    if(!window.isSecureContext){status.textContent='Le gyroscope demande HTTPS. Les flèches tactiles fonctionnent ici.';return;}
    if(!('DeviceOrientationEvent' in window)){status.textContent='Pas de capteur détecté. Utilise les flèches tactiles.';return;}
    try {
      const permission=(DeviceOrientationEvent as PermissionOrientation).requestPermission;
      if(permission&&await permission.call(DeviceOrientationEvent)!=='granted'){status.textContent='Permission refusée. Les flèches restent disponibles.';return;}
      this.gyro=true;this.gyroSeen=false;this.gyroCenter=null;this.get('#steering-mode').textContent='GYROSCOPE';this.get('#gyro').textContent='TACTILE';this.get('#center').hidden=false;status.textContent='Tiens le téléphone droit pour régler le neutre.';
      setTimeout(()=>{if(this.gyro&&!this.gyroSeen)status.textContent='Aucune donnée du capteur. Utilise les flèches ou réessaie.';},2000);
    }catch{status.textContent='Capteur indisponible. Utilise les flèches tactiles.';}
  }
  private release() {
    this.touch.clear();this.steer=0;this.gyroCenter=null;this.lastGyro=0;
    this.root.querySelectorAll('.pressed').forEach(b=>b.classList.remove('pressed'));
    if(this.joined)this.send({type:'input',controls:neutral(),sequence:++this.sequence});
  }
  private async keepAwake(){try{if('wakeLock' in navigator)this.wakeLock=await navigator.wakeLock.request('screen');}catch{/* Optional: the controller remains usable without wake lock. */}}
}
