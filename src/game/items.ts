import { Euler, Quaternion, Vector3 } from 'three';
import { kartBoxContact } from './pickup-contact';
import { roadFrame } from './road-geometry';
import type { Course } from './course';

export interface ItemBox { id:number; distance:number; lane:number; position:Vector3; cooldown:number; tangent:Vector3; right:Vector3; visualPosition:Vector3; rotation:Quaternion; roadRotation:Quaternion; }
export class ItemBoxes {
  readonly boxes:ItemBox[];
  private time=0;
  constructor(course:Course) {
    this.boxes=course.boxes.flatMap(distance=>[-4,0,4].map(lane=>({id:0,distance,lane,position:course.position(distance,lane,1.8),cooldown:0,tangent:course.at(distance).tangent,right:course.at(distance).right,visualPosition:new Vector3(),rotation:new Quaternion(),roadRotation:roadFrame(course,distance,lane).quaternion})));
    this.boxes.forEach((box,id)=>box.id=id);this.animate();
  }
  private animate(){
    for(const box of this.boxes){
      box.visualPosition.copy(box.position);box.visualPosition.y+=Math.sin(this.time*2+box.id)*.18;
      box.rotation.setFromEuler(new Euler(.18,this.time*.7+box.id,.14));
    }
  }
  reset(){this.time=0;this.boxes.forEach(box=>box.cooldown=0);this.animate();}
  update(dt:number){this.time+=dt;this.boxes.forEach(box=>box.cooldown=Math.max(0,box.cooldown-dt));this.animate();}
  collect(from:Vector3,to:Vector3,rotation?:Quaternion):ItemBox|null {
    let first:ItemBox|null=null,firstTime=Infinity;
    for(const box of this.boxes) {
      if(box.cooldown>0)continue;
      // Cheap broad phase before the oriented chassis/driver contact test.
      if(!segmentTouches(from,to,box.visualPosition,4.5))continue;
      const time=kartBoxContact(from,to,rotation??box.roadRotation,box.visualPosition,box.rotation);
      if(time!==null&&time<firstTime){first=box;firstTime=time;}
    }
    if(first)first.cooldown=2.5;
    return first;
  }
}

export interface Coin {id:number;distance:number;lane:number;height:number;position:Vector3;cooldown:number;tangent:Vector3;right:Vector3;}
export interface TrackObject {id:number;owner:number;distance:number;lane:number;height:number;life:number;position:Vector3;age:number;}
export interface Shell extends TrackObject {kind:'green-shell'|'red-shell';yaw:number;speed:number;target:number|null;heading:number;vertical:number;bounces:number;backward:boolean;}
export interface Banana extends TrackObject {kind:'banana';velocity:Vector3;grounded:boolean;}
export interface Impact {id:number;position:Vector3;life:number;kind:'shell'|'banana'|'protected';}
/** Shared simulation data. Rendering never determines whether a pickup/hit happened. */
export class PickupField {
  readonly coins:Coin[]=[];
  shells:Shell[]=[];
  bananas:Banana[]=[];
  horns:{id:number;position:Vector3;life:number}[]=[];
  impacts:Impact[]=[];
  private serial=0;
  constructor(readonly course:Course){
    for(let group=0;group<18;group++)for(let n=0;n<4;n++){
      const distance=(group+.42)/18*course.length+n*5;
      const lane=group%3===0?-3:group%3===1?3:0;
      const height=1.25;
      this.coins.push({id:this.coins.length,distance,lane,height,position:course.position(distance,lane,height),cooldown:0,tangent:course.at(distance).tangent,right:course.at(distance).right});
    }
    // A few rewards are tucked into the grass cut, without an entrance trail.
    for(const distance of [480,488,496]){
      const lane=-(course.at(distance).width*.5+Math.min(3.8,Math.max(0,course.shoulder(distance,-1)-1.3))),height=1.25;
      this.coins.push({id:this.coins.length,distance,lane,height,position:course.position(distance,lane,height),cooldown:0,tangent:course.at(distance).tangent,right:course.at(distance).right});
    }
      // Rewards sit inside the hidden passages, rather than spelling out their entrances.
    for(const route of course.routes)for(const fraction of [.42,.48,.54,.60,.66]){
      const distance=route.start+(route.end-route.start)*fraction,lane=course.routeLane(route,distance),height=1.25;
      const position=course.position(distance,lane,height);
      if(this.coins.some(coin=>coin.position.distanceToSquared(position)<9))continue;
      const before=course.position(distance-.5,course.routeLane(route,distance-.5)),after=course.position(distance+.5,course.routeLane(route,distance+.5));
      const tangent=after.sub(before).normalize(),right=new Vector3(-tangent.z,0,tangent.x).normalize();
      this.coins.push({id:this.coins.length,distance,lane,height,position,cooldown:0,tangent,right});
    }
  }
  reset(){this.coins.forEach(c=>c.cooldown=0);this.shells=[];this.bananas=[];this.horns=[];this.impacts=[];this.serial=0;}
  update(dt:number){this.coins.forEach(c=>c.cooldown=Math.max(0,c.cooldown-dt));this.horns.forEach(h=>h.life-=dt);this.horns=this.horns.filter(h=>h.life>0);this.impacts.forEach(h=>h.life-=dt);this.impacts=this.impacts.filter(h=>h.life>0);}
  horn(position:Vector3){this.horns.push({id:this.serial++,position:position.clone(),life:.55});}
  impact(position:Vector3,kind:Impact['kind']='shell'){this.impacts.push({id:this.serial++,position:position.clone(),life:.5,kind});if(this.impacts.length>48)this.impacts.shift();}
  collectCoins(from:Vector3,to:Vector3):number {
    let count=0;
    for(const coin of this.coins)if(!coin.cooldown&&segmentBodyTouches(from,to,coin.position,coin.right,coin.tangent,1.13,1.8,1.02)){coin.cooldown=6;count++;}
    return count;
  }
  drop(owner:number,distance:number,lane:number,height=0,speed=0,yaw=0){
    const road=this.course.at(distance),position=this.course.position(distance-3.5,lane,height+.45);
    const velocity=road.tangent.clone().multiplyScalar(Math.cos(yaw)*speed*.3).addScaledVector(road.right,Math.sin(yaw)*speed*.3);
    velocity.y=height>.1?1.8:0;
    const banana:Banana={id:this.serial++,kind:'banana',owner,distance:distance-3.5,lane,height,life:35,position,velocity,grounded:height<=.1&&!this.course.inVoid(distance-3.5),age:0};
    this.bananas.push(banana);if(this.bananas.length>36)this.bananas.shift();return banana;
  }
  shoot(kind:Shell['kind'],owner:number,distance:number,lane:number,yaw:number,height:number,target:number|null,backward=false){
    const shell:Shell={backward,id:this.serial++,kind,owner,distance:distance+(backward?-3.5:3.5),lane,yaw,height,speed:kind==='red-shell'?52:48,target,life:8,position:this.course.position(distance+(backward?-3.5:3.5),lane,height+.6),heading:this.course.at(distance).heading-yaw+(backward?Math.PI:0),vertical:0,bounces:0,age:0};
    this.shells.push(shell);if(this.shells.length>24)this.shells.shift();return shell;
  }
}
export function segmentTouches(from:Vector3,to:Vector3,center:Vector3,radius:number){
  const dx=to.x-from.x,dy=to.y-from.y,dz=to.z-from.z,length2=dx*dx+dy*dy+dz*dz;
  const t=length2<1e-12?0:Math.max(0,Math.min(1,((center.x-from.x)*dx+(center.y-from.y)*dy+(center.z-from.z)*dz)/length2));
  const x=from.x+t*dx-center.x,y=from.y+t*dy-center.y,z=from.z+t*dz-center.z;
  return x*x+y*y+z*z<=radius*radius;
}
/** Swept contact in a road-aligned ellipsoid, including the actual altitude. */
export function segmentBodyTouches(from:Vector3,to:Vector3,center:Vector3,right:Vector3,tangent:Vector3,halfWidth:number,halfLength:number,halfHeight:number){
  const ax=from.x-center.x,ay=(from.y-center.y)/halfHeight,az=from.z-center.z;
  const bx=to.x-center.x,by=(to.y-center.y)/halfHeight,bz=to.z-center.z;
  const forwardScale=1/(Math.hypot(tangent.x,tangent.z)*halfLength);
  return scalarSweep((ax*right.x+az*right.z)/halfWidth,ay,(ax*tangent.x+az*tangent.z)*forwardScale,(bx*right.x+bz*right.z)/halfWidth,by,(bx*tangent.x+bz*tangent.z)*forwardScale,1);
}
/** Transform both moving bodies into relative motion before testing the swept volume. */
export function movingBodiesTouch(a0:Vector3,a1:Vector3,b0:Vector3,b1:Vector3,radius=1.45,verticalRadius=.95){
  const verticalScale=radius/verticalRadius;
  return scalarSweep(a0.x-b0.x,(a0.y-b0.y)*verticalScale,a0.z-b0.z,a1.x-b1.x,(a1.y-b1.y)*verticalScale,a1.z-b1.z,radius);
}
function scalarSweep(ax:number,ay:number,az:number,bx:number,by:number,bz:number,radius:number){
  const dx=bx-ax,dy=by-ay,dz=bz-az,length2=dx*dx+dy*dy+dz*dz;
  const t=length2<1e-12?0:Math.max(0,Math.min(1,-(ax*dx+ay*dy+az*dz)/length2));
  const x=ax+t*dx,y=ay+t*dy,z=az+t*dz;
  return x*x+y*y+z*z<=radius*radius;
}
