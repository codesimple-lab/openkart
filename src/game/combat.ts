import { Vector3 } from 'three';
import { angle, clamp, wrap } from './course';
import { movingBodiesTouch, type Shell, type TrackObject } from './items';
import type { Item } from './item-types';
import type { Race } from './race';

export const captureCombatFrame=(race:Race)=>race.racers.map(r=>race.course.position(r.distance,r.lane,r.height+.85));
type Hit=(index:number,item?:Item)=>void;
export const isDefensiveItem=(item:Item)=>item==='banana'||item==='green-shell'||item==='red-shell';
export function heldItemPosition(race:Race,index:number){const r=race.racers[index],heading=race.course.at(r.distance).heading-r.yaw;return race.course.position(r.distance,r.lane,r.height+.65).add(new Vector3(-Math.sin(heading)*3.2,0,-Math.cos(heading)*3.2));}
function breakObject(race:Race,object:TrackObject&{kind:string}){if(object.life<=0)return;object.life=0;race.pickups.impact(object.position,object.kind==='banana'?'banana':'shell');race.events.push({type:'shell-break',racer:object.owner,item:object.kind as Item,position:object.position.clone(),strength:.8});}
function consumeDefense(race:Race,index:number,position:Vector3){const r=race.racers[index],item=r.heldItem;r.heldItem=null;r.throwTime=0;r.item=r.reserveItem;r.reserveItem=null;race.pickups.impact(position,'protected');race.events.push({type:'protected',racer:index,item:item??undefined,position:position.clone(),strength:1});}

/** Effects only: Race retains inventory, edge-triggered controls, sound and announcements. */
export function activateItem(race:Race,index:number,item:Item,hit:Hit,backward?:boolean){
  const r=race.racers[index],field=race.pickups,backwards=backward??item==='banana';
  if(item==='turbo')r.boost=Math.max(r.boost,2.5);
  if(item==='shield')r.shield=6;
  if(item==='star'){r.star=7;r.shield=7;}
  if(item==='banana'){
    const banana=field.drop(index,r.distance,r.lane,r.height,r.speed,r.yaw);
    if(backwards){banana.position.copy(heldItemPosition(race,index));project(race,banana);if(banana.grounded){banana.position.y=race.course.position(banana.distance,banana.lane,.45).y;banana.height=.45;}}
    else{
      const heading=race.course.at(r.distance).heading-r.yaw;
      banana.position.copy(race.course.position(r.distance,r.lane,r.height+1)).add(new Vector3(Math.sin(heading)*3.2,0,Math.cos(heading)*3.2));
      banana.velocity.set(Math.sin(heading)*(13+r.speed*.3),8,Math.cos(heading)*(13+r.speed*.3));banana.grounded=false;project(race,banana);
    }
    race.events.push({type:'banana-drop',racer:index,item,position:banana.position.clone(),strength:.6});
  }
  if(item==='green-shell'||item==='red-shell'){
    const targets=race.racers.map((other,i)=>({i,other,gap:wrap(other.distance-r.distance,race.course.length)}))
      .filter(t=>t.i!==index&&t.other.finished===null&&t.gap>.5&&t.gap<160).sort((a,b)=>a.gap-b.gap);
    const shell=field.shoot(item,index,r.distance,r.lane,r.yaw,r.height,item==='red-shell'&&!backwards?(targets[0]?.i??null):null,backwards);
    shell.position.copy(race.course.position(r.distance,r.lane,r.height+.6)).add(new Vector3(Math.sin(shell.heading)*3.3,0,Math.cos(shell.heading)*3.3));project(race,shell);
    race.events.push({type:'shell-launch',racer:index,item,position:shell.position.clone(),strength:1});
  }
  if(item==='pulse'){
    const center=race.course.position(r.distance,r.lane,r.height+1);field.horn(center);
    race.racers.forEach((other,i)=>{if(i!==index&&center.distanceTo(race.course.position(other.distance,other.lane,other.height+1))<18){hit(i,'pulse');field.impact(race.course.position(other.distance,other.lane,other.height+1),other.shield||other.star?'protected':'shell');}});
    for(const object of [...field.shells,...field.bananas])if(object.position.distanceTo(center)<18){breakObject(race,object);}
    field.shells=field.shells.filter(o=>o.life>0);field.bananas=field.bananas.filter(o=>o.life>0);
  }
}

/** Project a world-moving object back onto the nearby course frame, preserving its world altitude. */
function project(race:Race,object:TrackObject){
  for(let i=0;i<3;i++){
    const road=race.course.at(object.distance),dx=object.position.x-road.p.x,dz=object.position.z-road.p.z;
    const lane=dx*road.right.x+dz*road.right.z;
    const tangentLength=Math.hypot(road.tangent.x,road.tangent.z);
    const along=(dx*road.tangent.x+dz*road.tangent.z)/tangentLength;
    object.distance+=clamp(along/(Math.max(.35,1-road.curvature*lane)*tangentLength),-8,8);
  }
  const road=race.course.at(object.distance);object.lane=(object.position.x-road.p.x)*road.right.x+(object.position.z-road.p.z)*road.right.z;
  object.height=object.position.y-race.course.position(object.distance,object.lane).y;
}
function stepShell(race:Race,shell:Shell,dt:number){
  const previousLane=shell.lane,previousDistance=shell.distance,road=race.course.at(shell.distance);
  if(shell.kind==='red-shell'&&!shell.backward){
    const target=shell.target===null?null:race.racers[shell.target];
    let desired=road.heading;
    if(target&&target.finished===null){
      const gap=wrap(target.distance-shell.distance+race.course.length/2,race.course.length)-race.course.length/2;
      // Signed gap keeps homing active after overshooting instead of suddenly aiming a lap ahead.
      if(Math.abs(gap)<24){const p=race.course.position(target.distance,target.lane,target.height+.75);desired=Math.atan2(p.x-shell.position.x,p.z-shell.position.z);}
      else desired=road.heading-Math.atan2(clamp(target.lane-shell.lane,-7,7),16);
      const desiredHeight=target.height;
      if(desiredHeight>1||race.course.inVoid(shell.distance))shell.position.y+=(race.course.position(shell.distance,shell.lane,desiredHeight+.6).y-shell.position.y)*(1-Math.exp(-dt*5));
    }
    shell.heading+=clamp(angle(desired-shell.heading),-dt*5.5,dt*5.5);
  }
  shell.position.x+=Math.sin(shell.heading)*shell.speed*dt;shell.position.z+=Math.cos(shell.heading)*shell.speed*dt;
  project(race,shell);
  const next=race.course.at(shell.distance),floor=race.course.position(shell.distance,shell.lane,.6).y;
  const redFlying=shell.kind==='red-shell'&&shell.target!==null&&(race.racers[shell.target]?.height??0)>1;
  if(!redFlying){
    if(race.course.inVoid(shell.distance)||shell.height>1){shell.vertical-=18*dt;shell.position.y+=shell.vertical*dt;}
    else{shell.position.y=floor;shell.vertical=0;}
    if(!race.course.inVoid(shell.distance)&&shell.position.y<floor){if(shell.position.y<floor-1.2)shell.life=0;else{shell.position.y=floor;shell.vertical=0;}}
  }
  shell.height=shell.position.y-race.course.position(shell.distance,shell.lane).y;
  // Reflect only at a real low roadside rail. An airborne shell cannot hit a fictitious wall.
  const bounds=race.course.laneBounds(shell.distance,previousLane),lower=bounds[0]+.65,upper=bounds[1]-.65;
  if(shell.height<2&&(shell.lane<lower||shell.lane>upper)){
    const side=shell.lane<lower?-1:1,index=side<0?0:1;
    const previousBounds=race.course.laneBounds(previousDistance,previousLane);
    if(previousLane>=previousBounds[0]+.5&&previousLane<=previousBounds[1]-.5){
      shell.lane=side<0?lower:upper;const corrected=race.course.position(shell.distance,shell.lane);shell.position.x=corrected.x;shell.position.z=corrected.z;
      const a=race.course.laneBounds(shell.distance-.3,shell.lane)[index],b=race.course.laneBounds(shell.distance+.3,shell.lane)[index];
      const slope=clamp((b-a)/.6,-1,1),metric=Math.max(.35,1-next.curvature*shell.lane);
      const wall=next.tangent.clone().multiplyScalar(metric).addScaledVector(next.right,slope),normal=new Vector3(-wall.z,0,wall.x).normalize();
      const direction=new Vector3(Math.sin(shell.heading),0,Math.cos(shell.heading));direction.addScaledVector(normal,-2*direction.dot(normal));
      shell.heading=Math.atan2(direction.x,direction.z);shell.speed*=.94;shell.bounces++;race.pickups.impact(shell.position);race.events.push({type:'shell-bounce',racer:shell.owner,item:shell.kind,position:shell.position.clone(),strength:shell.speed/52});
    }
  }
  shell.yaw=angle(next.heading-shell.heading);
  if(shell.bounces>=5||shell.height< -24||Math.abs(shell.lane)>28)shell.life=0;
}

/** Substeps and relative sweeps make item hits independent of the render frame rate. */
export function updateCombat(race:Race,dt:number,hit:Hit,previousPositions:readonly Vector3[]=captureCombatFrame(race)){
  const field=race.pickups,current=captureCombatFrame(race),steps=Math.max(1,Math.ceil(dt*120)),step=dt/steps;
  const before=new Vector3(),after=new Vector3();
  for(let tick=0;tick<steps;tick++){
    const starts=new Map<number,Vector3>();
    for(const banana of field.bananas){
      starts.set(banana.id,banana.position.clone());banana.life-=step;banana.age+=step;
      if(!banana.grounded){
        banana.velocity.y-=18*step;banana.position.addScaledVector(banana.velocity,step);project(race,banana);
        const ground=race.course.position(banana.distance,banana.lane,.45).y;
        const bounds=race.course.laneBounds(banana.distance,banana.lane);
        if(!race.course.inVoid(banana.distance)&&banana.lane>=bounds[0]&&banana.lane<=bounds[1]&&banana.position.y<=ground){banana.position.y=ground;banana.height=.45;banana.grounded=true;banana.velocity.set(0,0,0);}
        if(banana.height< -24)banana.life=0;
      }
    }
    for(const shell of field.shells){starts.set(shell.id,shell.position.clone());shell.life-=step;shell.age+=step;if(shell.life>0)stepShell(race,shell,step);}
    // Trailed items intercept projectiles before the kart body. They are consumed once.
    for(const shell of field.shells){
      if(shell.life<=0)continue;
      for(let i=0;i<race.racers.length;i++){
        if(!race.racers[i].heldItem||i===shell.owner&&shell.age<.2)continue;
        const defense=heldItemPosition(race,i),offset=defense.clone().sub(current[i]);
        const from=(previousPositions[i]??current[i]).clone().lerp(current[i],tick/steps).add(offset);
        const to=(previousPositions[i]??current[i]).clone().lerp(current[i],(tick+1)/steps).add(offset);
        if(movingBodiesTouch(starts.get(shell.id)!,shell.position,from,to,1.28,1.05)){consumeDefense(race,i,defense);breakObject(race,shell);break;}
      }
    }
    for(const object of [...field.bananas,...field.shells]){
      if(object.life<=0)continue;
      const start=starts.get(object.id)!;
      for(let i=0;i<race.racers.length;i++){
        const racer=race.racers[i];if(racer.finished!==null||(i===object.owner&&object.age<(object.kind==='banana'?.65:.2)))continue;
        before.lerpVectors(previousPositions[i]??current[i],current[i],tick/steps);after.lerpVectors(previousPositions[i]??current[i],current[i],(tick+1)/steps);
        if(movingBodiesTouch(start,object.position,before,after,object.kind==='banana'?1.35:1.5,object.kind==='banana'?.9:1)){
          hit(i,object.kind);if(racer.shield||racer.star){field.impact(object.position,'protected');race.events.push({type:'protected',racer:i,item:object.kind,position:object.position.clone(),strength:1});}breakObject(race,object);break;
        }
      }
    }
    for(let a=0;a<field.shells.length;a++){
      const shell=field.shells[a];if(shell.life<=0)continue;
      for(const banana of field.bananas)if(banana.life>0&&movingBodiesTouch(starts.get(shell.id)!,shell.position,starts.get(banana.id)!,banana.position,1.1,.85)){breakObject(race,shell);breakObject(race,banana);break;}
      if(shell.life<=0)continue;
      for(let b=a+1;b<field.shells.length;b++){
        const other=field.shells[b];if(other.life>0&&movingBodiesTouch(starts.get(shell.id)!,shell.position,starts.get(other.id)!,other.position,1.2,.8)){breakObject(race,shell);breakObject(race,other);break;}
      }
    }
    field.shells=field.shells.filter(o=>o.life>0);field.bananas=field.bananas.filter(o=>o.life>0);
  }
}
