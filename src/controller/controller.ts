import { ITEM_LABELS, ITEM_ICONS, type Item } from '../game/item-types';
import { neutral,validRoom } from '../network/protocol';
import { TouchState,type TouchAction } from './touch';
import { GyroSteering } from './gyro';
import { controllerId } from './session';

type PermissionOrientation=typeof DeviceOrientationEvent & {requestPermission?:()=>Promise<'granted'|'denied'>};
export class Controller {
  private socket:WebSocket|null=null;
  private readonly touch=new TouchState();
  private readonly listeners=new AbortController();
  private readonly timers:number[]=[];
  private readonly clientId=controllerId();
  private room='';
  private sequence=0;
  private activated=false;
  private joined=false;
  private host=false;
  private retry=0;
  private disposed=false;
  private readonly tilt=new GyroSteering();
  private suspended=false;
  private lastPacket=0;
  private gyroPending=false;
  private gyroLost=false;
  private gyro=false;
  private gyroSeen=false;
  private phase='garage';
  private latency=0;
  private wakeLock:WakeLockSentinel|null=null;
  constructor(private readonly root:HTMLElement) {
    document.title='OpenKart — Manette';root.className='controller';
    const room=new URLSearchParams(location.search).get('room')?.toUpperCase()??'';
    if(!validRoom(room)){this.pair();return;}
    this.room=room;this.render();this.connect();this.bind();
    this.timers.push(window.setInterval(()=>{if(!this.disposed)this.sendControls();},40));
    this.timers.push(window.setInterval(()=>{if(this.joined&&!this.suspended)this.send({type:'ping',time:performance.now()});},1800));
    window.addEventListener('pagehide',()=>{this.suspend();clearTimeout(this.retry);this.socket?.close();},{signal:this.listeners.signal});
    window.addEventListener('pageshow',()=>{if(!this.disposed)this.resume();},{signal:this.listeners.signal});
    window.addEventListener('blur',()=>this.suspend(),{signal:this.listeners.signal});
    window.addEventListener('focus',()=>this.resume(),{signal:this.listeners.signal});
    window.addEventListener('online',()=>this.resume(),{signal:this.listeners.signal});
    window.addEventListener('offline',()=>this.suspend(),{signal:this.listeners.signal});
    document.addEventListener('visibilitychange',()=>{if(document.hidden)this.suspend();else this.resume();},{signal:this.listeners.signal});
    const orientation=()=>this.release();window.addEventListener('orientationchange',orientation,{signal:this.listeners.signal});screen.orientation?.addEventListener('change',orientation,{signal:this.listeners.signal});
    window.addEventListener('deviceorientation',e=>{
      if(!this.gyro||this.suspended||this.disposed||document.hidden)return;
      const angle=screen.orientation?.angle??(window as Window & {orientation?:number}).orientation??0;
      const valid=this.tilt.update(e.beta,e.gamma,angle,performance.now());this.gyroSeen ||= valid;
      this.get('#sensor-status').textContent=!valid?'Redresse un peu le téléphone pour piloter.':this.tilt.ready?'Incline comme un volant · RECENTRER règle le neutre':'Garde le téléphone immobile un instant…';
      if(this.tilt.ready)this.gyroLost=false;
      this.get('#steer-dot').style.transform=`translateX(${this.tilt.read(performance.now())*55}px)`;
    },{signal:this.listeners.signal});
  }
  dispose(){this.suspend();this.disposed=true;this.listeners.abort();this.timers.forEach(clearInterval);clearTimeout(this.retry);this.socket?.close();}
  private get<E extends HTMLElement=HTMLElement>(selector:string):E {return this.root.querySelector<E>(selector)!;}
  private pair(message='Recopie les 6 caractères affichés dans le jeu.') {
    this.root.innerHTML=`<section class="phone-pair"><div class="wordmark">OPEN<span>KART</span></div><h1>À toi le volant.</h1><p id="pair-message"></p><form id="pair-form"><label for="code">CODE DE COURSE</label><input id="code" maxlength="6" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="ABC234" required><button class="start-button">CONNECTER →</button></form><small>Ouvre le jeu sur ton ordinateur et choisis « Mon téléphone ».</small></section>`;
    this.get('#pair-message').textContent=message;
    this.get('#pair-form').addEventListener('submit',e=>{e.preventDefault();const code=this.get<HTMLInputElement>('#code').value.toUpperCase().trim();if(!validRoom(code)){this.get('#pair-message').textContent='Le code contient 6 lettres ou chiffres. Vérifie-le sur le jeu.';return;}const url=new URL(location.href);url.searchParams.set('room',code);location.assign(url);});
  }
  private render() {
    this.root.innerHTML=`
      <header class="controller-head"><div class="wordmark">OPEN<span>KART</span></div><span class="phone-session">${this.room}</span><span id="link-state" role="status">CONNEXION…</span></header>
      <div id="activate-overlay" class="activate-overlay"><div><span class="eyebrow">PRÊT À PRENDRE LE VOLANT ?</span><h1>À toi de jouer.</h1><p>Tiens le téléphone en paysage, comme un volant.<br>Incline pour tourner et maintiens GAZ pour accélérer.</p><button id="activate-gyro" class="start-button">PILOTER EN INCLINANT ↗</button><button id="activate" class="secondary-activate">UTILISER LES BOUTONS</button><p id="activation-help" role="status"></p></div></div>
      <main class="controller-grid"><section class="steering"><div class="controller-label">DIRECTION <span id="steering-mode">TACTILE</span></div><div class="steering-gauge"><i id="steer-dot"></i></div><div class="direction-buttons"><button data-action="left" aria-label="Tourner à gauche">←<small>GAUCHE</small></button><button data-action="right" aria-label="Tourner à droite">→<small>DROITE</small></button></div><div class="sensor-tools"><button id="gyro">GYROSCOPE</button><button id="center" hidden>RECENTRER</button></div><div id="gyro-settings" class="gyro-settings" hidden><label>Sensibilité <select id="sensitivity"><option value="34">Douce</option><option value="24" selected>Normale</option><option value="16">Vive</option></select></label><label><input id="invert" type="checkbox"> Inverser</label></div><p id="sensor-status" role="status">Maintiens une flèche pour tourner.</p></section>
      <section class="pedal-area"><div class="controller-readout"><div><b id="phone-speed">000</b><span>KM/H</span></div><div class="phone-race-meta"><small id="phone-race">EN ATTENTE DU DÉPART</small><small id="phone-inventory">PIÈCES 0/10</small></div></div><div class="utility-buttons"><button data-action="item">◎ OBJET</button><button data-action="backthrow" aria-label="Maintenir pour protéger, relâcher pour lancer vers l’arrière">↓ ARRIÈRE</button><button data-action="reset">↺ PISTE</button><button id="phone-pause">Ⅱ PAUSE</button></div><div class="pedal-buttons"><button data-action="brake" class="brake">FREIN<small>RALENTIR / RECULER</small></button><button data-action="drift" class="drift">DRIFT<small>RELÂCHER = TURBO</small></button><button data-action="gas" class="gas">GAZ<small>ACCÉLÉRER</small></button></div></section></main>
      <footer class="controller-footer"><span id="phone-hint">OBJET : MAINTENIR = PROTÉGER · RELÂCHER = LANCER</span><button id="phone-start">LANCER LA COURSE →</button></footer>
    `;
  }
  private connect() {
    if(this.disposed||this.suspended||this.socket?.readyState===WebSocket.OPEN||this.socket?.readyState===WebSocket.CONNECTING)return;
    clearTimeout(this.retry);this.joined=false;this.lastPacket=performance.now();
    const socket=this.socket=new WebSocket(`${location.protocol==='https:'?'wss':'ws'}://${location.host}/relay`);
    socket.onopen=()=>this.send({type:'join',role:'phone',room:this.room,clientId:this.clientId});
    socket.onmessage=e=>{
      if(this.socket!==socket||this.disposed)return;this.lastPacket=performance.now();
      let m;try{m=JSON.parse(e.data);}catch{return;}
      if(m.type==='error'){this.activated=false;this.disposed=true;this.socket?.close();this.pair(m.message);return;}
      if(m.type==='ready'){this.joined=true;this.status();this.sendControls();}
      if(m.type==='peer'){this.host=!!m.connected;if(!this.host)this.release();this.status();}
      if(m.type==='pong'){this.latency=Math.round(performance.now()-m.time);this.status();}
      if(m.type==='status') {
        const itemButton=this.get('[data-action="item"]');
        const item=m.item&&Object.hasOwn(ITEM_LABELS,m.item)?m.item as Item:null;
        itemButton.innerHTML=item?ITEM_ICONS[item]+'<span>'+ITEM_LABELS[item]+'</span>':m.roulette?'⟳ ROULETTE':'? OBJET';
        this.get('#phone-inventory').textContent=(m.reserveItem&&Object.hasOwn(ITEM_LABELS,m.reserveItem)?'RÉSERVE : '+ITEM_LABELS[m.reserveItem as Item]+' · ':'')+'PIÈCES '+(m.coins??0)+'/10';
        itemButton.classList.toggle('item-ready',!!m.item);
        this.get('[data-action="backthrow"]').classList.toggle('item-ready',item==='banana'||item==='green-shell'||item==='red-shell');

        if(this.phase!==m.phase&&['paused','finish','garage'].includes(m.phase))this.release();
        this.phase=m.phase;this.get('#phone-speed').textContent=String(Math.round(m.speed)).padStart(3,'0');
        this.get('#phone-race').textContent=m.phase==='garage'?'PRÊT AU DÉPART':m.phase==='paused'?'COURSE EN PAUSE':`TOUR ${m.lap} / 3`;
        this.get('#phone-start').textContent=m.phase==='paused'?'REPRENDRE →':m.phase==='finish'?'REJOUER ↻':m.phase==='garage'?'LANCER LA COURSE →':m.phase==='countdown'?'PRÉPARE-TOI…':'Ⅱ PAUSE';
      }
    };
    socket.onclose=()=>{if(this.socket!==socket)return;this.socket=null;this.joined=false;this.host=false;this.release();if(this.disposed)return;this.status();if(!this.suspended)this.retry=window.setTimeout(()=>this.connect(),900);};
    socket.onerror=()=>socket.close();
  }
  private status(){if(this.disposed)return;const label=this.get('#link-state');label.textContent=!this.joined?'RECONNEXION…':!this.host?'ORDINATEUR ABSENT':`CONNECTÉ · ${this.latency} MS`;label.classList.toggle('online',this.host&&this.joined);}
  private send(data:object){if(this.socket?.readyState===WebSocket.OPEN)this.socket.send(JSON.stringify(data));}
  private sendControls() {
    if(this.disposed||this.suspended||document.hidden)return;
    const now=performance.now();
    // A socket can stay OPEN after Wi-Fi has vanished. Reconnect instead of queuing old controls.
    if(this.socket&&(now-this.lastPacket>5000||this.socket.bufferedAmount>8192)){this.reconnect();return;}
    if(!this.activated||!this.joined||!this.host)return;
    const controls=this.touch.read();
    if(this.gyro){
      if(Math.abs(controls.steer)<.01)controls.steer=this.tilt.read(now);
      if(!this.tilt.active(now)&&!controls.steer){
        controls.throttle=0;controls.drift=false;
        if(this.tilt.ready&&!this.gyroLost){this.gyroLost=true;this.get('#sensor-status').textContent='Capteur interrompu. RECENTRER ou utilise les boutons.';if(['race','countdown'].includes(this.phase))this.send({type:'action',action:'suspend'});}
      }
    }
    this.send({type:'input',controls,sequence:++this.sequence});
  }
  private activate(){this.activated=true;this.suspended=false;this.get('#activate-overlay').hidden=true;this.sendControls();void this.keepAwake();}
  private bind() {
    this.get('#activate').addEventListener('click',()=>{this.disableGyro();this.activate();});
    this.get('#activate-gyro').addEventListener('click',()=>{void this.enableGyro().then(ok=>{if(ok)this.activate();});});
    this.get('#activation-help').textContent=window.isSecureContext?'Autorise le mouvement, puis garde le téléphone immobile un instant.':'Pour incliner le téléphone, ouvre la version HTTPS du jeu sur l’ordinateur et scanne son QR code.';
    this.get<HTMLButtonElement>('#activate-gyro').disabled=!window.isSecureContext;
    this.root.querySelectorAll<HTMLButtonElement>('[data-action]').forEach(button=>{
      button.addEventListener('pointerdown',e=>{if(!this.activated||this.suspended)return;e.preventDefault();try{button.setPointerCapture(e.pointerId);}catch{/* Window-level release remains available. */}this.touch.press(e.pointerId,button.dataset.action as TouchAction);button.classList.add('pressed');this.sendControls();});
      const release=(e:PointerEvent)=>{this.touch.release(e.pointerId);button.classList.toggle('pressed',this.touch.held(button.dataset.action as TouchAction));this.sendControls();};
      ['pointerup','pointercancel','lostpointercapture'].forEach(type=>button.addEventListener(type,release as EventListener));
      button.addEventListener('contextmenu',e=>e.preventDefault());
    });
    const end=(e:PointerEvent)=>{this.touch.release(e.pointerId);this.root.querySelectorAll<HTMLButtonElement>('[data-action]').forEach(b=>b.classList.toggle('pressed',this.touch.held(b.dataset.action as TouchAction)));this.sendControls();};
    window.addEventListener('pointerup',end,{signal:this.listeners.signal});window.addEventListener('pointercancel',end,{signal:this.listeners.signal});
    this.get('#sensitivity').addEventListener('change',()=>{this.tilt.sensitivity=Number(this.get<HTMLSelectElement>('#sensitivity').value);});
    this.get('#invert').addEventListener('change',()=>{this.tilt.inverted=this.get<HTMLInputElement>('#invert').checked;});
    this.get('#phone-start').addEventListener('click',()=>{if(this.activated)this.send({type:'action',action:['garage','finish'].includes(this.phase)?'start':'pause'});});
    this.get('#phone-pause').addEventListener('click',()=>this.send({type:'action',action:'pause'}));
    this.get('#gyro').addEventListener('click',()=>void this.enableGyro());
    this.get('#center').addEventListener('click',()=>{this.release();this.get('#sensor-status').textContent='Garde le téléphone immobile un instant…';});
  }
  private disableGyro(){this.gyro=false;this.tilt.reset();this.get('#steering-mode').textContent='TACTILE';this.get('#gyro').textContent='GYROSCOPE';this.get('#center').hidden=true;this.get('#gyro-settings').hidden=true;this.get('#sensor-status').textContent='Maintiens une flèche pour tourner.';}
  private async enableGyro():Promise<boolean> {
    const status=this.get('#sensor-status'),help=this.get('#activation-help');
    const fail=(message:string)=>{status.textContent=message;help.textContent=message;return false;};
    if(this.gyroPending)return false;
    if(this.gyro){this.disableGyro();return false;}
    if(!window.isSecureContext)return fail('Le gyroscope demande la version HTTPS du jeu. Scanne son QR code depuis l’ordinateur.');
    if(!('DeviceOrientationEvent' in window))return fail('Pas de capteur détecté. Les boutons restent disponibles.');
    this.gyroPending=true;
    try {
      // Called directly from the click: iOS requires transient user activation.
      const permission=(DeviceOrientationEvent as PermissionOrientation).requestPermission;
      if(permission&&await permission.call(DeviceOrientationEvent)!=='granted')return fail('Mouvement refusé. Autorise-le dans les réglages du site ou utilise les boutons.');
      if(this.disposed)return false;
      this.gyro=true;this.gyroSeen=false;this.gyroLost=false;this.tilt.reset();this.get('#steering-mode').textContent='GYROSCOPE';this.get('#gyro').textContent='TACTILE';this.get('#center').hidden=false;this.get('#gyro-settings').hidden=false;status.textContent='Garde le téléphone immobile un instant…';
      setTimeout(()=>{if(this.gyro&&!this.gyroSeen&&!this.disposed){status.textContent='Aucune mesure. Redresse le téléphone, réessaie ou passe en TACTILE.';}},2500);
      return true;
    }catch{return fail('Capteur indisponible. Les boutons restent disponibles.');}
    finally{this.gyroPending=false;}
  }
  private release() {
    this.touch.clear();this.tilt.reset();
    this.root.querySelectorAll('.pressed').forEach(b=>b.classList.remove('pressed'));
    if(this.joined)this.send({type:'input',controls:neutral(),sequence:++this.sequence});
  }
  private suspend(){
    this.release();if(!this.suspended&&this.activated&&['race','countdown'].includes(this.phase))this.send({type:'action',action:'suspend'});
    this.suspended=true;void this.wakeLock?.release();this.wakeLock=null;
  }
  private resume(){
    if(this.disposed||document.hidden)return;
    this.suspended=false;this.release();
    if(!this.socket||this.socket.readyState>WebSocket.OPEN||performance.now()-this.lastPacket>5000)this.reconnect();
    if(this.activated)void this.keepAwake();
  }
  private reconnect(){
    const old=this.socket;this.socket=null;this.joined=false;this.host=false;this.release();old?.close();this.status();this.connect();
  }
  private async keepAwake(){try{if('wakeLock' in navigator&&(!this.wakeLock||this.wakeLock.released)&&!document.hidden)this.wakeLock=await navigator.wakeLock.request('screen');}catch{/* Optional: the controller remains usable without wake lock. */}}
}
