import * as T from 'three';
import { Course,clamp,wrap } from './course';
import type { Racer } from './race';

/** Fade a close rival crossing the view; distant racers and the player stay opaque. */
export function cameraKartOpacity(position:T.Vector3,camera:T.Vector3,target:T.Vector3,_legacyFlying?:boolean) {
  const sight=target.clone().sub(camera),length=sight.length();sight.divideScalar(Math.max(.01,length));
  const relative=position.clone().add(new T.Vector3(0,1.3,0)).sub(camera);
  const along=relative.dot(sight);
  if(along< -2||along>length-2)return 1;
  const perpendicular=relative.clone().addScaledVector(sight,-along).length();
  const radius=2.8;
  const obstruction=(1-T.MathUtils.smoothstep(perpendicular,radius*.55,radius))*(1-T.MathUtils.smoothstep(relative.length(),5,11));
  return 1-obstruction*.9;
}

export type ChaseMode='drive'|'drift'|'finish';
export interface ChasePose {position:T.Vector3;target:T.Vector3;distance:number;mode:ChaseMode;fovOffset:number}
interface CameraBlend {drift:number;finish:number;driftDirection:number}

function blendedPose(course:Course,r:Racer,blend:CameraBlend):ChasePose {
  const {drift,finish}=blend;
  // A centre-line metre gets shorter on the inside of a bend. Compensating that
  // metric keeps the kart the same screen size when it takes the grass shortcut.
  const metric=clamp(1-course.at(r.distance-6).curvature*r.lane,.55,1.4);
  const cornerRoom=Math.max(0,1-metric)*4;
  const worldTrailing=10.8+cornerRoom+drift*.15+(r.boost>0?.25:0);
  const trailing=worldTrailing/metric;
  const distance=r.distance-trailing;
  const lane=clamp(r.lane-Math.sin(r.yaw)*.65-blend.driftDirection*drift*.35,course.railLane(distance,-1)+3.3,course.railLane(distance,1)-3.3);
  const position=course.position(distance,lane,4.5);
  // On a climb the rear road surface is lower; do not let the chase view sink to
  // bumper height just when the player needs to read a tighter uphill corner.
  const playerGround=course.position(r.distance,r.lane).y;
  position.y=Math.max(position.y,playerGround+3.6);
  const lead=(8+drift*2)/clamp(1-course.at(r.distance+4).curvature*r.lane,.6,1.4);
  const targetLane=r.lane*.94+Math.sin(r.yaw)*(1.1-drift*.3)+blend.driftDirection*drift*.2;
  const target=course.position(r.distance+lead,targetLane,1.25);
  if(finish>0){
    // The finish view reveals the driver's face instead of leaving a frozen chase shot.
    position.lerp(course.position(r.distance+4.7,r.lane-4.2,2.5),finish);
    target.lerp(course.position(r.distance,r.lane,1.65),finish);
  }
  const mode:ChaseMode=finish>.05?'finish':drift>.4?'drift':'drive';
  return {position,target,distance,mode,fovOffset:drift*.35-finish*12};
}

/** Instant pose remains useful to inspection tools and geometry checks. */
export function chasePose(course:Course,r:Racer):ChasePose {
  return blendedPose(course,r,{drift:r.drifting?1:0,finish:r.finished!==null?1:0,driftDirection:r.driftDirection||Math.sign(r.steer)});
}

/** Event transitions use time, never frame count, and do not follow the visual hit spin. */
export class ChaseCameraRig {
  private drift=0;
  private finish=0;
  private driftDirection=0;
  private initialized=false;
  reset(){this.drift=0;this.finish=0;this.driftDirection=0;this.initialized=false;}
  update(course:Course,r:Racer,dt:number):ChasePose {
    const step=clamp(dt,0,.1);
    if(!this.initialized){this.drift=r.drifting?1:0;this.initialized=true;}
    if(r.drifting)this.driftDirection=r.driftDirection||Math.sign(r.steer);
    this.drift=T.MathUtils.damp(this.drift,r.drifting?1:0,5.5,step);
    this.finish=T.MathUtils.damp(this.finish,r.finished!==null?1:0,2.1,step);
    return blendedPose(course,r,{drift:this.drift,finish:this.finish,driftDirection:this.driftDirection});
  }
}

/** A smoothed boom must still stay above the deck and below the tunnel ceiling. */
export function constrainChaseCamera(course:Course,r:Racer,position:T.Vector3) {
  let nearest=Infinity,bestDistance=r.distance-11,bestLane=0;
  for(let offset=-32;offset<=6;offset+=1){
    const s=r.distance+offset,road=course.at(s),dx=position.x-road.p.x,dz=position.z-road.p.z;
    const lane=dx*road.right.x+dz*road.right.z;
    const projected=course.position(s,lane),d=(position.x-projected.x)**2+(position.z-projected.z)**2;
    if(d<nearest){nearest=d;bestDistance=s;bestLane=lane;}
  }
  const safeLane=clamp(bestLane,course.railLane(bestDistance,-1)+1.2,course.railLane(bestDistance,1)-1.2);
  if(safeLane!==bestLane){position.addScaledVector(course.at(bestDistance).right,safeLane-bestLane);bestLane=safeLane;}
  const ground=course.position(bestDistance,bestLane);
  position.y=Math.max(position.y,ground.y+2.5);
  const local=wrap(bestDistance,course.length);
  if(local>course.tunnel[0]-2&&local<course.tunnel[1]+2&&Math.abs(bestLane)<10.8){
    const ceiling=ground.y+Math.sqrt(Math.max(0,1-(bestLane/10.8)**2))*10;
    // If an unusual lateral pose leaves no camera-sized clearance, preserve the deck floor.
    position.y=Math.max(ground.y+2.5,Math.min(position.y,ceiling-1.6));
  }
}
