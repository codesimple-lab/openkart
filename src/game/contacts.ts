import { clamp, wrap, type Course } from './course';
import type { Racer } from './race';
import { routeVelocity, setRouteVelocity } from './vehicle-physics';

function mass(r:Racer){return r.pilot.id==='peach'?1.16:r.pilot.id==='yoshi'?.91:1;}
/** Oriented kart footprints match the 4.2 m chassis and outer wheel width.
 * A separating-axis test resolves corners and side impacts without interpenetration. */
export function kartOverlap(a:Racer,b:Racer,course:Course):{penetration:number;nx:number;ny:number;ds:number;dl:number}|null {
  if(a.finished!==null||b.finished!==null||Math.abs(a.height-b.height)>1.8)return null;
  const ds=wrap(a.distance-b.distance+course.length/2,course.length)-course.length/2;
  const dl=a.lane-b.lane;
  if(Math.abs(ds)>5.2||Math.abs(dl)>5.2)return null;
  const axesA=[[Math.cos(a.yaw),Math.sin(a.yaw)],[-Math.sin(a.yaw),Math.cos(a.yaw)]];
  const axesB=[[Math.cos(b.yaw),Math.sin(b.yaw)],[-Math.sin(b.yaw),Math.cos(b.yaw)]];
  let penetration=Infinity,nx=0,ny=1;
  for(const axis of [...axesA,...axesB]){
    const [x,y]=axis;
    const support=(axes:number[][])=>2.1*Math.abs(x*axes[0][0]+y*axes[0][1])+1.46*Math.abs(x*axes[1][0]+y*axes[1][1]);
    const projection=ds*x+dl*y,overlap=support(axesA)+support(axesB)-Math.abs(projection);
    if(overlap<=0)return null;
    if(overlap<penetration){penetration=overlap;const sign=projection<0?-1:1;nx=x*sign;ny=y*sign;}
  }
  return {penetration,nx,ny,ds,dl};
}
export function kartContact(a:Racer,b:Racer,course:Course):number {
  const overlap=kartOverlap(a,b,course);if(!overlap)return 0;
  const {penetration,nx,ny,ds,dl}=overlap;
  const invA=1/mass(a),invB=1/mass(b),total=invA+invB;
  a.distance+=nx*(penetration+.002)*invA/total;a.lane+=ny*(penetration+.002)*invA/total;
  b.distance-=nx*(penetration+.002)*invB/total;b.lane-=ny*(penetration+.002)*invB/total;
  const va=routeVelocity(a),vb=routeVelocity(b);
  const closing=(va.forward-vb.forward)*nx+(va.side-vb.side)*ny;
  if(closing<0){
    const impulse=-(1.08)*closing/total;
    va.forward+=impulse*nx*invA;va.side+=impulse*ny*invA;
    vb.forward-=impulse*nx*invB;vb.side-=impulse*ny*invB;
    setRouteVelocity(a,va.forward,va.side);setRouteVelocity(b,vb.forward,vb.side);
  }
  const impact=Math.max(0,-closing);
  if(impact>1.5||Math.hypot(ds,dl)<.1){a.hit=Math.max(a.hit,.12);b.hit=Math.max(b.hit,.12);if(a.hit<=.35)a.hitKind='bump';if(b.hit<=.35)b.hitKind='bump';}
  a.impact=Math.max(a.impact,clamp(impact/15,0,1));b.impact=Math.max(b.impact,clamp(impact/15,0,1));
  return impact;
}
/** The wall removes outward velocity, retaining tangential momentum on a graze. */
export function railContact(r:Racer,course:Course):number {
  const bounds=course.laneBounds(r.distance,r.lane);
  const footprint=1.46*Math.abs(Math.cos(r.yaw))+2.1*Math.abs(Math.sin(r.yaw));
  const lower=bounds[0]+footprint,upper=bounds[1]-footprint;
  if(r.lane>=lower&&r.lane<=upper)return 0;
  const sign=r.lane<lower?-1:1,edge=sign<0?lower:upper,index=sign<0?0:1;
  // Branch walls have their own tangent. Retain motion along the wall instead of
  // treating every shortcut separator as a wall parallel to the main road.
  const before=course.laneBounds(r.distance-.3,r.lane)[index],after=course.laneBounds(r.distance+.3,r.lane)[index];
  const metric=Math.max(.35,1-course.at(r.distance).curvature*r.lane);
  const slope=clamp((after-before)/.6,-1,1)/metric,normalLength=Math.hypot(slope,1),nx=-sign*slope/normalLength,ny=sign/normalLength;
  const velocity=routeVelocity(r),impact=Math.max(0,velocity.forward*nx+velocity.side*ny);
  r.lane=lower>upper?(bounds[0]+bounds[1])/2:edge;
  if(impact>0){
    velocity.forward-=nx*impact*1.045;velocity.side-=ny*impact*1.045;
    const friction=1-Math.min(.12,impact*.0025);velocity.forward*=friction;velocity.side*=friction;
    setRouteVelocity(r,velocity.forward,velocity.side);
    r.headingRate-=sign*Math.min(.85,impact*.055);
    r.impact=Math.max(r.impact,clamp(impact/18,0,1));
    if(impact>4){r.hit=Math.max(r.hit,.18);if(r.hit<=.35)r.hitKind='bump';}
  }
  return impact;
}
