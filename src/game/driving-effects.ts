import * as T from 'three';
import type { Racer } from './race';
import { Course } from './course';
import { roadFrame } from './road-geometry';

const PARTICLES=216;
const AXIS_Y=new T.Vector3(0,1,0);
const DRIFT_COLOURS=[new T.Color('#a5b3bb'),new T.Color('#26bdff'),new T.Color('#ff941f'),new T.Color('#dd45ff')];
const GOLD=new T.Color('#ffe58e');
const SMOKE=new T.Color('#a7b3bb');
const DUST=new T.Color('#bdb475');
/** Two fixed render pools keep tyre traces and arcade feedback bounded throughout a race. */
export class DrivingEffects {
  private readonly marks:T.InstancedMesh;
  private readonly sparks:T.InstancedMesh;
  private readonly matrix=new T.Object3D();
  private readonly lastTyres:(T.Vector3[]|null)[]=[];
  private readonly lastImpact:number[]=[];
  private readonly lastStage:number[]=[];
  private readonly lastBoost:number[]=[];
  private readonly particles=Array.from({length:PARTICLES},()=>({position:new T.Vector3(),velocity:new T.Vector3(),life:0,duration:1,size:1,gravity:12,smoke:false}));
  private markIndex=0;
  private sparkIndex=0;
  private timer=0;
  constructor(scene:T.Scene,private readonly course:Course){
    this.marks=new T.InstancedMesh(new T.PlaneGeometry(1,1),new T.MeshBasicMaterial({color:'#14222a',transparent:true,opacity:.3,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-4,polygonOffsetUnits:-4}),240);
    this.marks.frustumCulled=false;this.marks.renderOrder=3;
    this.sparks=new T.InstancedMesh(new T.OctahedronGeometry(.085),new T.MeshBasicMaterial({color:'white',toneMapped:false}),PARTICLES);this.sparks.frustumCulled=false;
    this.matrix.scale.setScalar(0);this.matrix.updateMatrix();
    for(let i=0;i<240;i++)this.marks.setMatrixAt(i,this.matrix.matrix);
    for(let i=0;i<PARTICLES;i++){this.sparks.setMatrixAt(i,this.matrix.matrix);this.sparks.setColorAt(i,GOLD);}
    scene.add(this.marks,this.sparks);
  }
  reset(){
    this.markIndex=0;this.sparkIndex=0;this.timer=0;
    this.lastTyres.length=0;this.lastImpact.length=0;this.lastStage.length=0;this.lastBoost.length=0;
    this.particles.forEach(p=>p.life=0);this.matrix.scale.setScalar(0);this.matrix.updateMatrix();
    for(let i=0;i<240;i++)this.marks.setMatrixAt(i,this.matrix.matrix);
    for(let i=0;i<PARTICLES;i++)this.sparks.setMatrixAt(i,this.matrix.matrix);
    this.marks.instanceMatrix.needsUpdate=true;this.sparks.instanceMatrix.needsUpdate=true;
  }
  private emit(origin:T.Vector3,velocity:T.Vector3,colour:T.Color,life:number,size:number,smoke=false){
    const index=this.sparkIndex++%PARTICLES,p=this.particles[index];
    p.position.copy(origin);p.velocity.copy(velocity);p.life=life;p.duration=life;p.size=size;p.smoke=smoke;p.gravity=smoke?-1.1:9;
    this.sparks.setColorAt(index,colour);
  }
  update(racers:Racer[],dt:number,time:number){
    this.timer+=dt;const paint=this.timer>=.045;if(paint)this.timer%=.045;
    racers.forEach((r,i)=>{
      const impact=r.impact??0,stage=r.driftStage??0;
      if(impact>(this.lastImpact[i]??0)+.1){
        const origin=this.course.position(r.distance,r.lane,r.height+.3);
        for(let n=0;n<9;n++){
          const a=n*2.399+time;
          this.emit(origin,new T.Vector3(Math.sin(a)*(2+impact*3),1.4+(n%3)*.8,Math.cos(a)*(2+impact*3)),GOLD,.3+impact*.2,1.5);
        }
      }
      this.lastImpact[i]=impact;
      const stageBurst=r.drifting&&stage>(this.lastStage[i]??0);
      const boostBurst=r.boost>(this.lastBoost[i]??0)+.1;
      this.lastStage[i]=stage;this.lastBoost[i]=r.boost;
      const grounded=!r.flying&&r.height<.1&&(r.hop??0)<.08;
      if(!paint&&!stageBurst&&!boostBurst)return;
      const frame=roadFrame(this.course,r.distance,r.lane),rotation=frame.quaternion.clone().multiply(new T.Quaternion().setFromAxisAngle(AXIS_Y,-r.yaw));
      const origin=this.course.position(r.distance,r.lane,r.height+(r.hop??0)+.06);
      const tyres=[-1.22,1.22].map(x=>new T.Vector3(x,0,-1.22).applyQuaternion(rotation).add(origin));
      if(grounded&&r.drifting&&r.speed>7){
        const colour=DRIFT_COLOURS[stage],count=stageBurst?7:stage?2:1;
        tyres.forEach((point,side)=>{
          for(let n=0;n<count;n++){
            const a=time*57+n*2.4+i*1.3+side*3.1;
            const smoke=stage===0;
            const velocity=new T.Vector3((side?1:-1)*(.8+Math.abs(Math.sin(a))*2),smoke?.35:1.2+Math.abs(Math.cos(a))*1.8,-1.4-Math.abs(Math.sin(a))*3).applyQuaternion(rotation);
            this.emit(point,velocity,smoke?SMOKE:colour,smoke?.26:stageBurst?.43:.26,smoke?1.9:stageBurst?2.2:1.3,smoke);
          }
        });
      }
      if(grounded&&paint&&r.speed>7&&this.course.surface(r.distance,r.lane)==='grass'){
        tyres.forEach((point,side)=>this.emit(point,new T.Vector3((side?1:-1)*.6,.7,-2.2).applyQuaternion(rotation),DUST,.4,2.3,true));
      }
      if(r.boost>0&&(paint||boostBurst)){
        const colour=r.boostKind==='ultra'?DRIFT_COLOURS[3]:r.boostKind==='super'?DRIFT_COLOURS[2]:r.boostKind==='mini'?DRIFT_COLOURS[1]:GOLD;
        const exhaust=new T.Vector3(0,.4,-2).applyQuaternion(rotation).add(origin);
        for(let n=0;n<(boostBurst?14:2);n++){
          const a=n*2.399+time*23;
          this.emit(exhaust,new T.Vector3(Math.sin(a)*(boostBurst?3:1),Math.cos(a)*1.7,-5-(n%3)*1.5).applyQuaternion(rotation),colour,boostBurst?.4:.22,boostBurst?2:1.3);
        }
      }
      if(!paint)return;
      if(!grounded||this.course.surface(r.distance,r.lane)==='grass'||r.speed<10||(!r.drifting&&Math.abs(r.lateralSpeed??0)<2.2)){this.lastTyres[i]=null;return;}
      tyres.forEach((point,j)=>{
        const previous=this.lastTyres[i]?.[j];if(!previous)return;
        const length=previous.distanceTo(point);if(length<.03||length>2.5)return;
        const forward=point.clone().sub(previous).normalize(),right=new T.Vector3().crossVectors(frame.up,forward).normalize();
        const q=new T.Quaternion().setFromRotationMatrix(new T.Matrix4().makeBasis(right,forward,frame.up));
        this.matrix.position.copy(previous).lerp(point,.5).addScaledVector(frame.up,.015);this.matrix.quaternion.copy(q);this.matrix.scale.set(.2,length+.035,1);this.matrix.updateMatrix();
        this.marks.setMatrixAt(this.markIndex++%240,this.matrix.matrix);
      });
      this.lastTyres[i]=tyres;
    });
    if(paint)this.marks.instanceMatrix.needsUpdate=true;
    this.particles.forEach((p,i)=>{
      p.life=Math.max(0,p.life-dt);
      if(p.life>0){p.velocity.y-=p.gravity*dt;p.position.addScaledVector(p.velocity,dt);}
      const remaining=p.life/p.duration;
      this.matrix.position.copy(p.position);this.matrix.rotation.set(time*7+i,time*4,0);
      this.matrix.scale.setScalar(p.size*(p.smoke?Math.sin(Math.PI*remaining):Math.min(1,remaining*3)));this.matrix.updateMatrix();this.sparks.setMatrixAt(i,this.matrix.matrix);
    });
    this.sparks.instanceMatrix.needsUpdate=true;if(this.sparks.instanceColor)this.sparks.instanceColor.needsUpdate=true;
  }
}
