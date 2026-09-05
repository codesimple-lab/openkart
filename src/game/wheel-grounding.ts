import * as T from 'three';
import {Course,clamp} from './course';

/** Find the banked surface underneath a wheel, including compressed inner bends. */
function clearance(course:Course,distance:number,point:T.Vector3){
  let s=distance,lane=0;
  for(let i=0;i<5;i++){
    const sample=course.at(s),dx=point.x-sample.p.x,dz=point.z-sample.p.z;
    lane=dx*sample.right.x+dz*sample.right.z;
    const horizontal=Math.hypot(sample.tangent.x,sample.tangent.z);
    const along=(dx*sample.tangent.x+dz*sample.tangent.z)/horizontal;
    const metric=Math.max(.18,1-sample.curvature*lane);
    s+=clamp(along/(horizontal*metric),-6,6);
    if(Math.abs(along)<.001)break;
  }
  const sample=course.at(s);lane=(point.x-sample.p.x)*sample.right.x+(point.z-sample.p.z)*sample.right.z;
  return point.y-course.position(s,lane,.04).y;
}

/** The body remains on its physics frame; only each rendered hub takes up the travel. */
export function wheelTravel(course:Course,distance:number,contact:T.Vector3,up:T.Vector3){
  let travel=0;
  for(let i=0;i<3;i++){
    const point=contact.clone().addScaledVector(up,travel);
    travel=clamp(travel+(.018-clearance(course,distance,point))/Math.max(.7,up.y),-.5,.5);
  }
  return travel;
}
