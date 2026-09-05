import { driverPortrait } from './driver-portraits';
import { ITEM_LABELS, ITEM_ICONS, ITEM_POOL } from './item-types';
import QRCode from 'qrcode';
import { PILOTS,type Race } from './race';
import { type Course,wrap } from './course';
import type { Phase } from '../network/link';
export const formatTime=(s:number)=>`${Math.floor(s/60).toString().padStart(2,'0')}:${(s%60).toFixed(2).padStart(5,'0')}`;
export class UI {
  readonly root:HTMLElement;
  readonly map:HTMLCanvasElement;
  private shownItem='';
  private shownReserve='';
  constructor(root:HTMLElement,readonly course:Course) {
    this.root=root;
    root.insertAdjacentHTML('beforeend',`
      <div class="vignette" aria-hidden="true"></div>
      <header class="topbar"><a class="wordmark" href="/" aria-label="OpenKart Astra accueil"><span class="logo-main">OPENKART</span><span class="logo-sub">ASTRA · ÎLE DES AIGUILLES</span></a><div class="top-actions"><span class="build-label">FAN GAME · GRAND PRIX</span><button id="sound" class="icon-button" aria-label="Activer ou couper le son">SON ON</button><details class="sound-settings"><summary class="icon-button" aria-label="Réglages audio">MIXAGE</summary><div class="sound-mixer"><label>Général<input type="range" data-volume="master" min="0" max="100" value="80" aria-label="Volume Général"></label><label>Moteurs<input type="range" data-volume="engine" min="0" max="100" value="90" aria-label="Volume Moteurs"></label><label>Bruitages<input type="range" data-volume="effects" min="0" max="100" value="82" aria-label="Volume Bruitages"></label><label>Ambiance<input type="range" data-volume="ambience" min="0" max="100" value="52" aria-label="Volume Ambiance"></label><label>Musique<input type="range" data-volume="music" min="0" max="100" value="32" aria-label="Volume Musique"></label><small id="audio-state" role="status">Clique sur SON pour activer.</small></div></details><button id="pause-button" class="icon-button race-only">Ⅱ PAUSE</button></div></header>
      <section id="garage" class="garage">
        <div class="garage-content"><div class="eyebrow"><span class="cup-icon">🏆</span> GRAND PRIX <b>150 cc</b></div><h1>CHOISIS TON<br><em>CHAMPION !</em></h1><p class="intro">Un circuit, trois tours. À toi la première place !</p>
          <div class="pilot-heading"><h2>Personnage</h2><span id="pilot-specialty">ÉQUILIBRE</span></div>
          <div class="pilots" role="group" aria-label="Choix du personnage">${PILOTS.map((p,i)=>`<button class="pilot ${i===0?'selected':''}" data-pilot="${i}" aria-pressed="${i===0}" style="--paint:${p.color};--trim:${p.trim}"><i class="portrait" aria-hidden="true">${driverPortrait(i)}</i><b class="player-badge">J1</b><span>${p.name}</span></button>`).join('')}</div>
          <div class="stats"><span>VITESSE<i><b id="stat-speed"></b></i></span><span>RELANCE<i><b id="stat-accel"></b></i></span><span>TENUE<i><b id="stat-grip"></b></i></span></div>
          <div class="control-choice" role="group" aria-label="Choix des commandes"><button id="keyboard-mode" class="selected" aria-pressed="true"><span>⌨</span> Clavier</button><button id="phone-mode" aria-pressed="false"><span>▯</span> Mon téléphone <small>QR CODE</small></button></div>
          <button id="start" class="start-button">C’EST PARTI ! <span>➜</span></button>
          <p class="keyboard-help">ZQSD / WASD / flèches · Espace drift · E objet · B tir arrière · R retour</p>
        </div>
        <aside class="course-card"><div class="course-card-head"><span>🏁 CIRCUIT SÉLECTIONNÉ</span><span>★</span></div><h2>Île des<br>Aiguilles</h2><p>VIRAGES SERRÉS · 3 TOURS</p><canvas id="course-map" width="400" height="240" aria-label="Plan du circuit"></canvas><div class="course-specs"><span><b>${(course.length/1000).toFixed(2)}</b> KM</span><span><b>3</b> TOURS</span><span><b>6</b> PILOTES</span></div><button id="view-course">VOIR LE CIRCUIT <span>↗</span></button></aside>
        <div class="hero-caption"><span id="hero-number">01</span><div><small>PRÊT À COURIR</small><strong id="hero-name">MARIO</strong></div><i>150<span>cc</span></i></div>
      </section>
      <section class="pair-backdrop" id="pairing" hidden><div class="pair-card"><button class="close-button" id="close-pair" aria-label="Fermer la connexion téléphone">×</button><div class="eyebrow">TON TÉLÉPHONE, TA MANETTE</div><h2>Scanne. Pilote.</h2><p>Connecte les deux appareils au <strong>même Wi-Fi</strong>, puis scanne ce QR code.</p><canvas id="qr" aria-label="QR code de la manette"></canvas><div class="session-label">CODE DE COURSE <b id="room">—</b></div><a id="phone-url" target="_blank" rel="noopener"></a><div class="connection" id="connection" role="status">En attente du téléphone…</div><p class="pair-help">Sur le téléphone : <b>Activer la manette</b>.<br>Puis lance la course depuis l’un des deux écrans.</p><button class="start-button" id="pair-start">C’EST PARTI <span>↗</span></button></div></section>
      <section class="hud" id="hud" hidden><div class="race-position"><b id="position">6</b><span><b id="position-suffix">e</b><small>/ 6</small></span></div><div class="coin-panel"><i aria-hidden="true">Ⅰ</i><b id="coins">00</b><span>/ 10</span></div><div class="lap-panel"><span>🏁 <b id="lap">1 / 3</b></span><strong id="time">00:00.00</strong></div><div class="mini-map"><canvas id="minimap" width="240" height="260" aria-label="Position des pilotes sur le circuit"></canvas></div><div class="race-center"><b id="countdown"></b><span id="message" role="status"></span></div><div class="item-panel"><div class="item-slots"><div id="item" class="item-orb" aria-label="Objet actif">?</div><div id="item-reserve" class="item-orb reserve" aria-label="Objet en réserve">?</div></div><b id="item-name">OBJETS</b><small id="item-help">TRAVERSE UNE BOÎTE ?</small></div><div class="speed-panel"><div><b id="speed">000</b><span>KM/H</span></div><div class="drift-track"><i id="drift-charge"></i></div><small id="drift-label">MAINTIENS ESPACE EN VIRAGE</small></div><div class="sector"><span id="section">PROMENADE DU PORT</span><small id="control-status">CLAVIER CONNECTÉ</small></div></section>
      <section class="modal-backdrop" id="pause" hidden><div class="pause-card"><div class="eyebrow">LA COURSE T’ATTEND</div><h2>PAUSE</h2><p id="pause-reason">La course t’attend.</p><button id="resume" class="start-button">REPRENDRE <span>→</span></button><button id="fallback" class="text-button" hidden>Continuer au clavier</button><button id="back-garage" class="text-button">Retour au garage</button></div></section>
      <section class="modal-backdrop" id="finish" hidden><div class="finish-card"><div class="eyebrow">DRAPEAU À DAMIER</div><h2 id="finish-title">Bien joué.</h2><div class="finish-summary"><strong id="finish-place">1<span>/ 6</span></strong><div><small>TEMPS TOTAL</small><b id="finish-time">00:00.00</b></div></div><div class="splits" id="splits"></div><h3>Classement à ton arrivée</h3><div id="standings"></div><button id="replay" class="start-button">REJOUER <span>↻</span></button><button id="finish-garage" class="text-button">Changer de pilote</button></div></section>
    `);
    this.map=this.get<HTMLCanvasElement>('#minimap');this.drawMap(this.get('#course-map'));this.selectPilot(0);
  }
  get<E extends HTMLElement=HTMLElement>(selector:string):E {const el=this.root.querySelector<E>(selector);if(!el)throw new Error(`Élément manquant : ${selector}`);return el;}
  on(selector:string,fn:()=>void) {this.get(selector).addEventListener('click',fn);}
  visible(selector:string,show:boolean) {this.get(selector).hidden=!show;}
  selectPilot(index:number) {
    const p=PILOTS[index];this.root.querySelectorAll<HTMLButtonElement>('[data-pilot]').forEach(b=>{const active=Number(b.dataset.pilot)===index;b.classList.toggle('selected',active);b.setAttribute('aria-pressed',String(active));});
    this.get('#hero-name').textContent=p.name.toUpperCase();this.get('#hero-number').textContent=String(index+1).padStart(2,'0');this.get('#pilot-specialty').textContent=p.role.toUpperCase();
    this.get('#stat-speed').style.width=`${p.speed/40*100}%`;this.get('#stat-accel').style.width=`${p.acceleration/23*100}%`;this.get('#stat-grip').style.width=`${p.grip/1.3*100}%`;
  }
  mode(phone:boolean) {
    ['#keyboard-mode','#phone-mode'].forEach((id,i)=>{this.get(id).classList.toggle('selected',phone===Boolean(i));this.get(id).setAttribute('aria-pressed',String(phone===Boolean(i)));});
  }
  async pairing(room:string) {
    const response=await fetch('/api/network');if(!response.ok)throw new Error('Adresse réseau indisponible.');
    const {origin}=await response.json();const url=new URL('/controller',origin);url.searchParams.set('room',room);
    await QRCode.toCanvas(this.get<HTMLCanvasElement>('#qr'),url.href,{width:232,margin:2,color:{dark:'#153e49',light:'#f4f5ef'}});
    this.get('#room').textContent=room;const link=this.get<HTMLAnchorElement>('#phone-url');link.href=url.href;link.textContent=url.href;
  }
  connection(ready:boolean,active:boolean) {const el=this.get('#connection');el.textContent=active?'Manette connectée · prête à jouer':ready?'Téléphone connecté · active la manette':'En attente du téléphone…';el.classList.toggle('connected',active);}
  update(race:Race,phase:Phase,countdown:number,phone:boolean) {
    const p=race.player;
    this.get('#position').textContent=String(race.position);this.get('#position-suffix').textContent=race.position===1?'er':'e';this.get('#lap').textContent=`${race.lap} / 3`;this.get('#time').textContent=formatTime(race.elapsed);
    this.get('#speed').textContent=String(Math.round(Math.abs(p.speed)*3.6)).padStart(3,'0');
    this.get('#countdown').textContent=phase==='countdown'?String(Math.ceil(countdown)):race.elapsed<.7?'GO!':'';
    this.get('#message').textContent=race.message;
    const rolling=p.pendingItem?ITEM_POOL[Math.floor(race.elapsed*14)%ITEM_POOL.length]:null;
    const primary=p.item??rolling, reserve=p.item?rolling??p.reserveItem:p.reserveItem;
    const primaryKey=primary??'',reserveKey=reserve??'';
    if(this.shownItem!==primaryKey){this.get('#item').innerHTML=primary?ITEM_ICONS[primary]:'?';this.shownItem=primaryKey;}
    if(this.shownReserve!==reserveKey){this.get('#item-reserve').innerHTML=reserve?ITEM_ICONS[reserve]:'?';this.shownReserve=reserveKey;}
    this.get('#item').setAttribute('aria-label',p.item?ITEM_LABELS[p.item]:'Emplacement objet vide');
    this.get('#item-reserve').setAttribute('aria-label',reserve?ITEM_LABELS[reserve]:'Réserve vide');
    this.get('#item-name').textContent=p.item?ITEM_LABELS[p.item]:p.pendingItem?'ROULETTE…':'OBJETS';
    this.get('.item-panel').classList.toggle('rolling',!!p.pendingItem&&!p.item);
    this.get('.item-panel').classList.toggle('ready',!!p.item);this.get('.item-panel').classList.toggle('defending',!!p.heldItem);
    this.get('#item-help').textContent=p.heldItem?(phone?'PROTECTION · RELÂCHE POUR LANCER':'PROTECTION · RELÂCHE E / B'):p.item?(['banana','green-shell','red-shell'].includes(p.item)?(phone?'MAINTIENS OBJET = PROTÉGER':'MAINTIENS E · B = TIR ARRIÈRE'):(phone?'BOUTON OBJET POUR UTILISER':'E POUR UTILISER')):p.pendingItem?'QUEL OBJET VAS-TU AVOIR ?':'TRAVERSE UNE BOÎTE ?';
    this.get('#coins').textContent=String(p.coins).padStart(2,'0');
    this.get('#drift-charge').style.width=`${p.boost>0?100:Math.min(100,p.charge/1.7*100)}%`;this.get('#drift-charge').classList.toggle('boosting',p.boost>0);
    this.root.dataset.driftStage=String(p.driftStage);this.root.dataset.turbo=String(p.boost>0);
    this.get('#drift-label').textContent=phase==='countdown'?'GAZ À 2 = DÉPART TURBO':p.boost>0?({'mini':'MINI-TURBO','super':'SUPER MINI-TURBO','ultra':'ULTRA MINI-TURBO','trick':'TURBO','item':'CHAMPIGNON','pad':'ACCÉLÉRATEUR','none':'TURBO'}[p.boostKind]):p.drifting?(p.driftStage===3?'ULTRA PRÊT · RELÂCHE !':p.driftStage===2?'SUPER PRÊT · RELÂCHE !':p.driftStage===1?'TURBO PRÊT · RELÂCHE !':'GARDE LE DRIFT…'):'ESPACE + DIRECTION = DRIFT';
    this.get('#section').textContent=this.course.section(p.distance);this.get('#control-status').textContent=phone?'MANETTE TÉLÉPHONE':'CLAVIER · ESPACE DRIFT · E OBJET';
    this.drawMap(this.map,race);
  }
  finish(race:Race) {
    this.get('#finish-title').textContent=race.position===1?'Victoire.':race.position<=3?'Sur le podium.':'Belle traversée.';
    this.get('#finish-place').innerHTML=`${race.position}<span>/ 6</span>`;this.get('#finish-time').textContent=formatTime(race.player.finished??race.elapsed);
    this.get('#splits').innerHTML=race.lapTimes.map((t,i)=>`<div><span>TOUR ${i+1}</span><b>${formatTime(t)}</b></div>`).join('');
    this.get('#standings').innerHTML=race.standings.map((r,i)=>`<div class="standing ${r===race.player?'you':''}"><span>${i+1}</span><b>${r.pilot.name}${r===race.player?' · TOI':''}</b><small>${r.finished===null?'En piste':formatTime(r.finished)}</small></div>`).join('');
    this.visible('#finish',true);
  }
  drawMap(canvas:HTMLCanvasElement,race?:Race) {
    const ctx=canvas.getContext('2d')!;ctx.clearRect(0,0,canvas.width,canvas.height);
    const positions=this.course.samples.map(s=>s.p),xs=positions.map(p=>p.x),zs=positions.map(p=>p.z),minX=Math.min(...xs),maxX=Math.max(...xs),minZ=Math.min(...zs),maxZ=Math.max(...zs);
    const scale=Math.min((canvas.width-36)/(maxX-minX),(canvas.height-28)/(maxZ-minZ));
    const project=(p:{x:number;z:number})=>[(p.x-(minX+maxX)/2)*scale+canvas.width/2,(p.z-(minZ+maxZ)/2)*scale+canvas.height/2];
    const point=(s:number,lane=0)=>project(this.course.position(s,lane));
    ctx.lineCap='round';ctx.lineJoin='round';ctx.beginPath();
    for(let i=0;i<=240;i++){const [x,y]=point(i/240*this.course.length);i?ctx.lineTo(x,y):ctx.moveTo(x,y);}
    ctx.strokeStyle=race?'#ffffff':'#1674e7';ctx.lineWidth=race?7:8;ctx.stroke();
    const [sx,sy]=point(0);ctx.fillStyle='#fc3e4e';ctx.fillRect(sx-3,sy-3,6,6);
    race?.racers.slice().reverse().forEach(r=>{const [x,y]=point(wrap(r.distance,this.course.length),r.lane);ctx.beginPath();ctx.arc(x,y,r===race.player?5:3,0,Math.PI*2);ctx.fillStyle=r.pilot.color;ctx.fill();if(r===race.player){ctx.strokeStyle='#fff';ctx.lineWidth=2.5;ctx.stroke();}});
  }
}
