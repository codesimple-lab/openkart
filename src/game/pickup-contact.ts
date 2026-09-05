import { Quaternion, Vector3 } from 'three';

export const ITEM_BOX_SIZE=1.5;
const axes=[new Vector3(1,0,0),new Vector3(0,1,0),new Vector3(0,0,1)];

/** Continuous SAT: interval of translation during which two oriented boxes overlap.
 * Testing all face normals and edge cross-products keeps cube corners out of a spherical halo.
 */
export function sweptBoxContact(from:Vector3,to:Vector3,rotation:Quaternion,half:Vector3,
  center:Vector3,boxRotation:Quaternion,boxHalf:Vector3):number|null {
  const a=axes.map(v=>v.clone().applyQuaternion(rotation));
  const b=axes.map(v=>v.clone().applyQuaternion(boxRotation));
  const normals=[...a,...b,...a.flatMap(x=>b.map(y=>new Vector3().crossVectors(x,y)))];
  const delta=from.clone().sub(center),travel=to.clone().sub(from);
  let enter=0,leave=1;
  for(const n of normals){
    if(n.lengthSq()<1e-12)continue;
    const radius=a.reduce((r,v,i)=>r+Math.abs(v.dot(n))*half.getComponent(i),0)
      +b.reduce((r,v,i)=>r+Math.abs(v.dot(n))*boxHalf.getComponent(i),0);
    const start=delta.dot(n),speed=travel.dot(n);
    if(Math.abs(speed)<1e-10){if(Math.abs(start)>radius+1e-8)return null;continue;}
    const t0=(-radius-start)/speed,t1=(radius-start)/speed;
    enter=Math.max(enter,Math.min(t0,t1));leave=Math.min(leave,Math.max(t0,t1));
    if(enter>leave+1e-8)return null;
  }
  return enter;
}

// Separate chassis and driver volumes avoid filling empty space above the wheels.
const parts=[
  {offset:new Vector3(0,-.3,0),half:new Vector3(1.25,.55,2.05)},
  {offset:new Vector3(0,.7,-.2),half:new Vector3(.48,.78,.55)},
];
const cubeHalf=new Vector3().setScalar(ITEM_BOX_SIZE/2);
export function kartBoxContact(from:Vector3,to:Vector3,rotation:Quaternion,center:Vector3,boxRotation:Quaternion){
  let first:number|null=null;
  for(const part of parts){
    const offset=part.offset.clone().applyQuaternion(rotation);
    const contact=sweptBoxContact(from.clone().add(offset),to.clone().add(offset),rotation,part.half,center,boxRotation,cubeHalf);
    if(contact!==null&&(first===null||contact<first))first=contact;
  }
  return first;
}
