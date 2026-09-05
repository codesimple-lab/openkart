import { angle, clamp, type Course, type RoadSample } from './course';
import type { Racer } from './race';
import type { Controls } from '../network/protocol';

/** Every driver uses these same limits; AI has no separate speed cap or catch-up force. */
export function topSpeed(r:Racer) { return r.pilot.speed + r.coins*.25 + (r.boost>0?11:0) + (r.star>0?7:0); }
export function steeringGain(r:Racer,drifting=r.drifting) {
  const speed=Math.abs(r.speed);
  return (drifting?2.15:1.5)*r.pilot.grip*clamp(speed/15,0,1)/(1+Math.max(0,speed-24)*.013);
}
export function gripLimit(r:Racer,drifting=r.drifting) {return (drifting?53:33)*r.pilot.grip;}
export function routeVelocity(r:Racer) {
  return {forward:r.speed*Math.cos(r.yaw)-r.lateralSpeed*Math.sin(r.yaw),side:r.speed*Math.sin(r.yaw)+r.lateralSpeed*Math.cos(r.yaw)};
}
export function setRouteVelocity(r:Racer,forward:number,side:number) {
  r.speed=forward*Math.cos(r.yaw)+side*Math.sin(r.yaw);
  r.lateralSpeed=-forward*Math.sin(r.yaw)+side*Math.cos(r.yaw);
}
/** Bicycle-style steering with finite yaw response and sideslip. Road curvature rotates
 * the coordinate frame only: releasing steering never rotates the kart towards the road. */
export function driveVehicle(r:Racer,input:Controls,road:RoadSample,course:Course,dt:number) {
  const grass=course.surface(r.distance,r.lane)==='grass';
  const slowed=grass&&r.boost<=0&&r.star<=0;
  const max=slowed?17:topSpeed(r),speed=Math.abs(r.speed);
  const engine=(r.pilot.acceleration+(r.boost>0?20:0)+(r.star>0?9:0))*(1-(speed/max)**2);
  const rolling=.8+speed*.027;
  const grade=9.81*road.tangent.y;
  const motor=r.startStall>0?0:input.throttle*(engine+rolling);
  const drag=rolling+(speed>max?(speed-max)*(slowed?3:2):0);
  let acceleration=motor-Math.sign(r.speed)*drag-grade;
  // Brake slows first, then gives a deliberately slow reverse gear.
  if(input.brake>0)acceleration-=input.brake*(r.speed>0?29:7);
  if(r.hit>.35)acceleration-=input.throttle*5;
  // Grass decelerates progressively; crossing its edge never snaps the velocity.
  r.speed=clamp(r.speed+acceleration*dt,-6,topSpeed(r)+3);
  if(!input.throttle&&!input.brake&&Math.abs(r.speed)<.08)r.speed=0;
  r.steer+=(input.steer-r.steer)*(1-Math.exp(-dt*11));
  let targetRate=r.steer*steeringGain(r)*(r.speed<0?-1:1);
  if(r.drifting)targetRate=(r.driftDirection*.55+r.steer*.45)*steeringGain(r);
  const limit=gripLimit(r)/Math.max(12,Math.abs(r.speed));
  targetRate=clamp(targetRate,-limit,limit);
  r.headingRate+=(targetRate-r.headingRate)*(1-Math.exp(-dt*9));
  const targetSlip=r.drifting?-r.driftDirection*Math.abs(r.speed)*.17:0;
  r.lateralSpeed+=(targetSlip-r.lateralSpeed)*(1-Math.exp(-dt*(r.drifting?3.2:7)));
  const velocity=routeVelocity(r);
  // Offset curves have a different length from the centerline.
  const metric=clamp(1-road.curvature*r.lane,.35,1.35);
  const progress=velocity.forward/metric*dt;
  r.distance+=progress;r.lane+=velocity.side*dt;
  r.yaw=angle(r.yaw+r.headingRate*dt-road.curvature*progress);
}
