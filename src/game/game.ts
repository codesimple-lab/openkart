import * as T from 'three';
import { ChaseCameraRig,constrainChaseCamera,cameraKartOpacity } from './chase-camera';
import { Course, clamp } from './course';
import { Race } from './race';
import { grantBoost } from './arcade-handling';
import { RocketStart } from './rocket-start';
import { CollectibleVisuals } from './collectible-visuals';
import { World } from './world';
import { Inspection } from './inspection';
import { DrivingEffects } from './driving-effects';
import { Kart } from './kart';
import { UI } from './ui';
import { Keyboard } from './input';
import { AudioEngine, type AudioChannel } from './audio';
import { neutral } from '../network/protocol';
import { HostLink, type Phase } from '../network/link';

export class Game {
  private readonly renderer:T.WebGLRenderer;
  private readonly camera=new T.PerspectiveCamera(48,1,.1,1800);
  private readonly course=new Course();
  private readonly race=new Race(this.course);
  private readonly world:World;
  private readonly ui:UI;
  private readonly collectibles:CollectibleVisuals;
  private readonly drivingEffects:DrivingEffects;
  private audioImpact=0;
  private readonly rocketStart=new RocketStart();
  private readonly rivalStarts=Array.from({length:5},()=>new RocketStart());
  private rivalLaunchTimes:number[]=[];
  private lastControls=neutral();
  private finishDelay=0;
  private finishShown=false;
  private readonly reducedMotion=matchMedia('(prefers-reduced-motion: reduce)').matches;
  private readonly inspection:Inspection;
  private readonly keyboard:Keyboard;
  private readonly audio=new AudioEngine();
  private readonly phone=new HostLink();
  private karts:Kart[]=[];
  private phase:Phase='garage';
  private priorPhase:'race'|'countdown'='race';
  private pilot=0;
  private phoneMode=false;
  private countdown=3;
  private last=0;
  private accumulator=0;
  private uiTimer=0;
  private networkTimer=0;
  private overview=false;
  private lastCount=3;
  private readonly look=new T.Vector3();
  private readonly chaseRig=new ChaseCameraRig();
  constructor(private readonly root:HTMLElement) {
    this.inspection=new Inspection(root);
    this.renderer=new T.WebGLRenderer({antialias:true,powerPreference:'high-performance'});
    this.renderer.setPixelRatio(Math.min(devicePixelRatio,1.7));this.renderer.shadowMap.enabled=true;this.renderer.shadowMap.type=T.PCFSoftShadowMap;this.renderer.toneMapping=T.ACESFilmicToneMapping;this.renderer.toneMappingExposure=1;
    this.renderer.domElement.id='scene';root.append(this.renderer.domElement);
    this.world=new World(this.course,this.renderer,this.race.itemBoxes);this.collectibles=new CollectibleVisuals(this.world.scene,this.race);this.drivingEffects=new DrivingEffects(this.world.scene,this.course);this.ui=new UI(root,this.course);this.keyboard=new Keyboard(()=>this.togglePause());
    this.buildKarts();
    this.ui.on('#start',()=>this.start());this.ui.on('#pair-start',()=>this.start());this.ui.on('#replay',()=>this.start());
    this.ui.on('#pause-button',()=>this.togglePause());this.ui.on('#resume',()=>this.togglePause());
    this.ui.on('#back-garage',()=>this.garage());this.ui.on('#finish-garage',()=>this.garage());
    this.ui.on('#fallback',()=>{this.phoneMode=false;this.ui.mode(false);this.togglePause();});
    this.ui.on('#keyboard-mode',()=>{this.phoneMode=false;this.ui.mode(false);});
    this.ui.on('#phone-mode',()=>{this.phoneMode=true;this.ui.mode(true);this.ui.visible('#pairing',true);});
    this.ui.on('#close-pair',()=>this.ui.visible('#pairing',false));
    this.ui.on('#sound',()=>{if(!this.audio.unlocked){this.audio.start();this.audio.muted=false;}else this.audio.muted=!this.audio.muted;});
    root.querySelectorAll<HTMLInputElement>('[data-volume]').forEach(slider=>slider.addEventListener('input',()=>{this.audio.start();this.audio.setVolume(slider.dataset.volume as AudioChannel,Number(slider.value)/100);}));
    this.ui.on('#view-course',()=>{this.overview=!this.overview;this.ui.get('#view-course').innerHTML=this.overview?'REVOIR MON KART <span>↙</span>':'VOIR LE CIRCUIT <span>↗</span>';});
    root.querySelectorAll<HTMLButtonElement>('[data-pilot]').forEach(b=>b.addEventListener('click',()=>{this.pilot=Number(b.dataset.pilot);this.ui.selectPilot(this.pilot);this.race.reset(this.pilot);this.buildKarts();}));
    void this.ui.pairing(this.phone.room).catch(()=>{this.ui.get('#connection').textContent='Le relais local est indisponible. Lance le projet avec npm run dev.';});
    this.phone.onAction=action=>{if(action==='suspend'){this.pause('La manette a été interrompue. Reprends quand elle est prête.');return;}if(action==='start'&&(this.phase==='garage'||this.phase==='finish')){this.phoneMode=true;this.ui.mode(true);this.start();}else if(action==='pause'||action==='start')this.togglePause();};
    this.phone.onChange=()=>this.ui.connection(this.phone.connected,this.phone.active);
    window.addEventListener('resize',()=>{this.resize();this.renderer.render(this.world.scene,this.camera);});
    window.addEventListener('blur',()=>{if(!this.phoneMode&&!this.inspection.frozen)this.pause('La fenêtre du jeu a perdu le focus.');});
    document.addEventListener('visibilitychange',()=>{if(document.hidden&&!this.inspection.frozen)this.pause('Le jeu était en arrière-plan.');this.last=performance.now();});
    this.renderer.domElement.addEventListener('webglcontextlost',e=>{e.preventDefault();this.pause('Le rendu 3D a été interrompu. Recharge la page pour reprendre.');});
    this.resize();this.renderCamera(1,0);
    if(this.inspection.enabled){if(this.inspection.frozen)this.audio.muted=true;this.start();this.phase='race';this.inspection.stage(this.race,this.course);this.updateKarts(1,0);this.renderCamera(1,0);}
    if(import.meta.env.DEV&&new URLSearchParams(location.search).has('boxes')) {
      this.start();this.phase='race';this.race.elapsed=2;this.race.player.distance=this.course.boxes[0]-12;this.race.player.lane=0;this.race.player.speed=16;this.renderCamera(1,0);
    }
    // Paint once immediately: a background browser can defer its first animation frame.
    this.ui.get('#sound').textContent=this.audio.muted?'SON OFF':this.audio.unlocked?'SON ON':'ACTIVER LE SON';
    if(this.phase!=='garage')this.ui.update(this.race,this.phase,this.countdown,this.phoneMode);
    this.frame(performance.now());
  }
  private buildKarts() {
    this.karts.forEach(k=>{this.world.scene.remove(k.root);k.dispose();});
    this.karts=this.race.racers.map(r=>{const k=new Kart(r.pilot);this.world.scene.add(k.root);return k;});
    this.updateKarts(1,0);
  }
  private start() {
    if(this.phoneMode&&!this.phone.active){this.ui.visible('#pairing',true);return;}
    this.chaseRig.reset();this.race.reset(this.pilot);this.drivingEffects.reset();this.audio.resetFeedback();this.rocketStart.reset();this.rivalStarts.forEach(r=>r.reset());this.rivalLaunchTimes=this.rivalStarts.map(()=>.7+Math.random()*1.65);this.lastControls=neutral();this.finishDelay=0;this.finishShown=false;this.phase='countdown';this.countdown=3;this.lastCount=3;this.overview=false;this.keyboard.clear();this.audio.start();this.audio.beep(420);
    ['#garage','#finish','#pairing','#pause'].forEach(s=>this.ui.visible(s,false));this.ui.visible('#hud',true);this.root.classList.add('playing');
    this.renderCamera(1,0);this.resize();
  }
  private garage() {
    this.phase='garage';this.chaseRig.reset();this.keyboard.clear();this.race.reset(this.pilot);this.drivingEffects.reset();this.overview=false;
    ['#finish','#pause','#hud','#pairing'].forEach(s=>this.ui.visible(s,false));this.ui.visible('#garage',true);this.root.classList.remove('playing');this.resize();
  }
  private pause(reason='La course t’attend.') {
    if(this.phase!=='race'&&this.phase!=='countdown')return;
    this.priorPhase=this.phase;this.phase='paused';this.keyboard.clear();this.phone.clearControls();this.race.cancelItemGesture();this.ui.visible('#pause',true);this.ui.get('#pause-reason').textContent=reason;
    this.ui.visible('#fallback',this.phoneMode&&!this.phone.active);
  }
  private togglePause() {
    if(this.phase==='paused') {
      if(this.phoneMode&&!this.phone.active){this.ui.get('#pause-reason').textContent='Reconnecte la manette, ou continue au clavier.';this.ui.visible('#fallback',true);return;}
      this.phone.clearControls();this.phase=this.priorPhase;this.ui.visible('#pause',false);this.audio.start();this.last=performance.now();
    }else this.pause();
  }
  private frame(time:number) {
    const elapsed=(time-(this.last||time))/1000,dt=Math.min(.06,elapsed);this.last=time;
    if(this.phoneMode&&(!this.phone.active)&&(this.phase==='race'||this.phase==='countdown'))this.pause('Connexion à la manette perdue. La course est en pause.');
    this.accumulator+=dt;
    while(this.accumulator>=1/120) {
      this.accumulator-=1/120;
      if(this.phase==='countdown') {
        this.lastControls=this.phoneMode?this.phone.controls:this.keyboard.read();this.rocketStart.update(this.lastControls.throttle,this.countdown);this.rivalStarts.forEach((start,i)=>start.update(this.countdown<=this.rivalLaunchTimes[i]?1:0,this.countdown));this.countdown-=1/120;const count=Math.ceil(this.countdown);if(count!==this.lastCount){this.audio.beep(count===0?850:420,count===0?.3:.12);this.lastCount=count;}
        if(this.countdown<=0){
          this.phase='race';const launch=this.rocketStart.result();
          this.race.player.startStall=launch.stall;if(launch.boost)grantBoost(this.race.player,'mini',launch.boost);
          this.race.racers.slice(1).forEach((r,i)=>{const rival=this.rivalStarts[i].result();r.startStall=rival.stall;if(rival.boost)grantBoost(r,'mini',rival.boost);});
          this.race.announce(launch.stall?'TROP TÔT !':launch.boost?'DÉPART TURBO !':'C’EST PARTI !',1.3);
        }
      }else if(this.phase==='race'&&!this.inspection.frozen) {
        this.lastControls=this.inspection.mode==='demo'?this.inspection.controls(this.race):this.phoneMode?this.phone.controls:this.keyboard.read();
        this.race.update(this.lastControls,1/120);
        if(this.race.player.finished!==null){this.phase='finish';this.finishDelay=2.4;this.race.announce(this.race.position===1?'VICTOIRE !':'ARRIVÉE !',3);this.audio.finish(this.race.position);}
      }
    }
    for(const event of this.race.events.splice(0))this.audio.event(event,this.race);
    if(this.phase==='finish'&&!this.finishShown){this.finishDelay-=dt;if(this.finishDelay<=0){this.ui.finish(this.race);this.finishShown=true;}}
    if(this.phase!=='paused'){this.updateKarts(dt,time/1000);this.renderCamera(dt,time/1000);}
    this.world.update(time/1000,this.karts[0].root.position,this.phase==='countdown'?this.countdown:this.phase==='garage'?-1:0);this.collectibles.update(time/1000);if(this.phase!=='paused')this.drivingEffects.update(this.race.racers,dt,time/1000);this.renderer.render(this.world.scene,this.camera);this.inspection.update(elapsed,this.renderer.info.render.calls,this.renderer.info.render.triangles,this.race);
    const player=this.race.player;
    if(player.impact>this.audioImpact+.1)this.audio.impact(player.impact);this.audioImpact=player.impact;
    if(this.phase==='race')this.audio.scene(this.race,dt,this.lastControls);else this.audio.update(player.speed,false,false);
    this.audio.feedback(player,this.phase==='race');
    this.uiTimer+=dt;this.networkTimer+=dt;
    if(this.uiTimer>.07){this.uiTimer=0;this.ui.get('#sound').textContent=this.audio.muted?'SON OFF':this.audio.unlocked?'SON ON':'ACTIVER LE SON';this.ui.get('#audio-state').textContent=!this.audio.unlocked?'Clique sur SON sur cet ordinateur.':this.audio.failedAssets.length?'Certains sons n’ont pas pu charger. Recharge la page.':this.audio.ready?'Banque sonore chargée · stéréo':'Chargement des bruitages…';if(this.phase!=='garage')this.ui.update(this.race,this.phase,this.countdown,this.phoneMode);}
    if(this.networkTimer>.15){this.networkTimer=0;this.phone.status(this.race.player.speed*3.6,this.race.lap,false,this.phase,this.race.player.item,this.race.player.roulette>0,this.race.player.reserveItem,this.race.player.coins);this.ui.connection(this.phone.connected,this.phone.active);}
    requestAnimationFrame(t=>this.frame(t));
  }
  private updateKarts(dt:number,time:number) {
    this.karts.forEach((k,i)=>{k.root.visible=this.phase!=='garage'||i===0;k.update(this.race.racers[i],this.course,dt,time);});
  }
  private renderCamera(dt:number,time:number) {
    const r=this.race.player,kart=this.karts[0].root,road=this.course.at(r.distance),desired=new T.Vector3(),target=new T.Vector3();
    if(this.phase==='garage') {
      if(this.overview) {
        desired.set(Math.sin(time*.035)*370,400,Math.cos(time*.035)*340-60);target.set(0,15,-50);
      } else {
        desired.copy(kart.position).addScaledVector(road.tangent,7.6).addScaledVector(road.right,5.8).add(new T.Vector3(0,3.2,0));
        target.copy(kart.position).add(new T.Vector3(0,1.05,0));
      }
      this.camera.fov=T.MathUtils.damp(this.camera.fov,this.overview?49:43,4,dt);
    } else {
      const pose=this.chaseRig.update(this.course,r,dt);desired.copy(pose.position);target.copy(pose.target);
      this.camera.fov=T.MathUtils.damp(this.camera.fov,this.reducedMotion?60:54+clamp(r.speed/38,0,1)*9+(r.boost>0?4:0)+pose.fovOffset,5,dt);
    }
    this.camera.position.lerp(desired,1-Math.exp(-dt*(this.phase==='garage'?3:9)));
    if(this.phase!=='garage')constrainChaseCamera(this.course,r,this.camera.position);this.look.lerp(target,1-Math.exp(-dt*8));this.camera.up.set(0,1,0);this.camera.lookAt(this.look);
    if(this.phase!=='garage'&&!this.reducedMotion)this.camera.rotateZ(clamp(road.bank*.16+(r.drifting?r.driftDirection*.016:0),-.04,.04));
    this.camera.updateProjectionMatrix();
    this.karts.forEach((k,i)=>{if(i>0)k.cameraOpacity(this.phase==='garage'?1:cameraKartOpacity(k.root.position,this.camera.position,this.look,false),dt);});
  }
  private resize() {
    const width=this.root.clientWidth,height=this.root.clientHeight;this.renderer.setSize(width,height);this.camera.aspect=width/height;
    if(this.phase==='garage'&&width>850)this.camera.setViewOffset(width,height,-width*.17,0,width,height);else this.camera.clearViewOffset();
    this.camera.updateProjectionMatrix();
  }
}
