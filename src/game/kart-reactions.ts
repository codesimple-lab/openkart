import {clamp} from './course';

export interface ReactionState {hit:number;hitKind?:'spin'|'tumble'|'bump'|null}

/** Visual-only reaction: the route position remains owned by the collision simulation. */
export function kartReaction(r:ReactionState){
  if(r.hit<=0)return {pitch:0,yaw:0,roll:0,lift:0,duck:0};
  const tumble=r.hitKind==='tumble',spin=r.hitKind==='spin';
  const duration=tumble?1.55:spin?1.25:.45,progress=clamp(1-r.hit/duration,0,1);
  const t=clamp(progress/.88,0,1),turn=t*t*(3-2*t),envelope=Math.sin(Math.PI*progress);
  const yaw=spin?Math.PI*2*turn:0;
  const pitch=tumble?Math.PI*2*turn:0;
  const roll=tumble?envelope*.09:spin?envelope*.055:Math.sin(progress*Math.PI*4)*envelope*.05;
  // Rotate a conservative kart/driver envelope about the 0.78 m pivot. Lift exactly
  // enough to keep a ground tumble clear of the road, including the driver's head.
  const yx=Math.cos(pitch)*Math.sin(roll)+Math.sin(pitch)*Math.sin(yaw)*Math.cos(roll);
  const yy=Math.cos(pitch)*Math.cos(roll)-Math.sin(pitch)*Math.sin(yaw)*Math.sin(roll),yz=-Math.sin(pitch)*Math.cos(yaw);
  const bottom=-Math.abs(yx)*1.49+Math.min(yy*-.78,yy*2.55)-Math.abs(yz)*2.4;
  const lift=Math.max(0,-.78-bottom)+(tumble?envelope*.045:0);
  return {pitch,yaw,roll,lift,duck:envelope*(tumble?.17:spin?.1:.04)};
}
