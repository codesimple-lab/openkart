import type { Race } from './race';
import type { Course } from './course';
import { driveAI } from './ai-driver';

/** Development-only reproducible camera checkpoints and a visibly labelled AI road trial. */
export class Inspection {
  readonly mode:string;
  readonly frozen:boolean;
  readonly enabled:boolean;
  private readonly panel:HTMLElement|null;
  private frames=0;
  private seconds=0;
  constructor(root:HTMLElement){
    const query=new URLSearchParams(location.search);
    const requested=query.get('inspect')??(query.has('demo')?'demo':'');
    this.mode=import.meta.env.DEV?(requested==='flight'?'orchard':requested):'';
    this.frozen=!!this.mode&&this.mode!=='demo';this.enabled=!!this.mode;
    this.panel=this.enabled?document.createElement('div'):null;
    if(this.panel){this.panel.className='inspection-label';this.panel.textContent=`${this.frozen?'INSPECTION FIGÉE':'ESSAI AUTOMATIQUE'} · ${this.mode.toUpperCase()}`;root.append(this.panel);}
  }
  stage(race:Race,course:Course){
    const r=race.player;
    const tight=course.samples.reduce((best,s,i)=>Math.abs(s.curvature)>Math.abs(course.samples[best].curvature)?i:best,0)/course.resolution*course.length;
    const route=course.routes.find(route=>route.id===this.mode||`${route.id}-entry`===this.mode);
    const distance=route?(this.mode.endsWith('-entry')?route.start+20:(route.start+route.end)/2):(this.mode==='curve'||this.mode==='drift'||this.mode==='occlusion')?tight:this.mode==='tunnel'?course.tunnel[0]+45:this.mode==='bridge'?course.length*.48:this.mode==='items'?course.boxes[0]-9:this.mode==='shortcut'?course.shortcut.start+45:12;
    if(this.mode==='demo')return;
    r.distance=distance;r.lane=route?course.routeLane(route,distance):0;r.speed=26;r.yaw=0;r.height=0;r.flying=false;race.elapsed=2;
    race.racers.slice(1).forEach((other,i)=>{other.distance=distance+10+i*6;other.lane=(i%3-1)*3;other.speed=26;other.height=0;other.flying=false;});
    if(this.mode==='shortcut'){r.lane=-11;r.boost=2;r.boostKind='item';}
    if(this.mode==='drift'){r.drifting=true;r.driftDirection=Math.sign(course.at(distance).curvature);r.driftStage=3;r.charge=1.8;r.steer=r.driftDirection*.45;r.yaw=r.driftDirection*.3;r.lateralSpeed=-r.driftDirection*4;}
    if(this.mode==='occlusion'){const rival=race.racers[1];rival.distance=distance-8;rival.lane=0;rival.height=0;rival.flying=false;}
  }
  controls(race:Race){return driveAI(race,race.player,0);}
  update(dt:number,calls:number,triangles:number,race:Race){
    if(!this.panel)return;this.frames++;this.seconds+=dt;
    if(this.seconds<.75)return;
    const gaps=race.racers.slice(1).map(r=>r.distance-race.player.distance);
    this.panel.textContent=`${this.frozen?'INSPECTION FIGÉE':'ESSAI AUTOMATIQUE'} · ${this.mode.toUpperCase()} · ${Math.round(this.frames/this.seconds)} FPS · ${calls} APPELS · ${Math.round(triangles/1000)}K TRIANGLES · ADVERSAIRES ${Math.round(Math.min(...gaps))}…${Math.round(Math.max(...gaps))} M`;
    this.frames=0;this.seconds=0;
  }
}
