import { angle, clamp, wrap, type Course, type ShortcutRoute } from './course';
import type { Race, Racer } from './race';
import { neutral, type Controls } from '../network/protocol';
import { gripLimit, steeringGain, topSpeed } from './vehicle-physics';
import { isDefensiveItem } from './combat';
const itemDecisions=new WeakMap<Racer,{lastUse:number;backward:boolean}>();
const branchChoices=new WeakMap<Racer,{lap:number;id:string|null}>();

function branchFrame(course:Course,route:ShortcutRoute,distance:number){
  // Average over several road samples so tessellation does not become a false tight bend.
  const before=course.position(distance-4,course.routeLane(route,distance-4)),p=course.position(distance,course.routeLane(route,distance)),after=course.position(distance+4,course.routeLane(route,distance+4));
  const first=p.clone().sub(before),second=after.clone().sub(p),direction=after.clone().sub(before);
  const heading=Math.atan2(direction.x,direction.z),length=(first.length()+second.length())*.5;
  return {lane:course.routeLane(route,distance),yaw:angle(course.at(distance).heading-heading),curvature:-angle(Math.atan2(second.x,second.z)-Math.atan2(first.x,first.z))/Math.max(.1,length),scale:length/4};
}

/** Deterministic look-ahead driver; the same policy can drive the player in tests.
 * No hidden top speed, teleport, or player-distance rubber band. */
export function driveAI(race:Race,r:Racer,index:number):Controls {
  const course=race.course,road=course.at(r.distance),speed=Math.max(8,r.speed);
  let desiredSpeed=topSpeed(r),maxCurve=0;
  // Brake early for tight turns: v² = u² + 2 a d, using a conservative 16 m/s².
  for(const ahead of [0,8,18,32,52]){
    const curvature=Math.abs(course.at(r.distance+ahead).curvature);
    maxCurve=Math.max(maxCurve,curvature);
    const turnSpeed=Math.sqrt(gripLimit(r)*.80/Math.max(.001,curvature));
    desiredSpeed=Math.min(desiredSpeed,Math.sqrt(turnSpeed*turnSpeed+2*16*Math.max(0,ahead-7)));
  }
  let laneTarget=((index%3)-1)*2.6;
  // Hold a stable line, use the inside of a bend, and separate overtaking lines.
  laneTarget+=clamp(road.curvature*35,-1.0,1.0);
  for(let i=0;i<race.racers.length;i++){
    const other=race.racers[i];if(other===r||other.finished!==null)continue;
    const gap=wrap(other.distance-r.distance,course.length);
    if(gap<15&&Math.abs(other.lane-laneTarget)<2.5){
      const side=r.lane>other.lane?1:r.lane<other.lane?-1:index%2?1:-1;
      laneTarget=clamp(other.lane+side*3,-5.5,5.5);
    }
  }
  // Seek boxes only when reachable without crossing the road at the last second.
  if(!r.reserveItem&&!r.pendingItem){
    const box=race.itemBoxes.boxes.filter(b=>!b.cooldown).map(b=>({box:b,gap:wrap(b.distance-r.distance,course.length)}))
      .filter(b=>b.gap>15&&b.gap<48&&Math.abs(b.box.lane-r.lane)<4).sort((a,b)=>Math.abs(a.box.lane-r.lane)-Math.abs(b.box.lane-r.lane))[0];
    if(box)laneTarget=box.box.lane;
  }
  for(const banana of race.pickups.bananas){
    const gap=wrap(banana.distance-r.distance,course.length);
    if(gap>3&&gap<27&&Math.abs(banana.height-r.height)<2&&Math.abs(banana.lane-laneTarget)<2.4){
      const side=r.lane>=banana.lane?1:-1;
      laneTarget=clamp(banana.lane+side*3.2,-5.5,5.5);
    }
  }
  const local=wrap(r.distance,course.length),lap=Math.floor(Math.max(0,r.distance)/course.length);
  let choice=branchChoices.get(r);if(!choice||choice.lap!==lap){choice={lap,id:null};branchChoices.set(r,choice);}
  let branch=course.routes.find(route=>route.id===choice!.id&&local<route.end+8&&local>route.start-35);
  if(!branch){
    choice.id=null;
    branch=course.routes.find((route,routeIndex)=>local>route.start-32&&local<route.start+8&&(index+lap+routeIndex)%3!==0);
    if(branch)choice.id=branch.id;
  }
  const lookahead=Math.max(10,speed*.55);
  const desiredYaw=clamp(Math.atan2(laneTarget-r.lane,lookahead),-.38,.38);
  let desiredRate=road.curvature*speed+angle(desiredYaw-r.yaw)*3.0-r.lateralSpeed*.06;
  if(branch){
    // A bypass has its own bends: the main road must not impose additional braking.
    desiredSpeed=topSpeed(r);maxCurve=0;
    // Follow the actual branch tangent and curvature, including the tighter inner bend.
    const frame=branchFrame(course,branch,r.distance);
    for(const ahead of [0,5,12,22,35]){
      const next=branchFrame(course,branch,r.distance+ahead),curve=Math.abs(next.curvature);maxCurve=Math.max(maxCurve,curve);
      const cornerSpeed=Math.sqrt(gripLimit(r,false)*.83/Math.max(.001,curve));
      desiredSpeed=Math.min(desiredSpeed,Math.sqrt(cornerSpeed*cornerSpeed+2*16*Math.max(0,ahead-5)*next.scale));
    }
    desiredRate=frame.curvature*speed+angle(frame.yaw-r.yaw)*4+clamp((frame.lane-r.lane)*.18,-.65,.65)-r.lateralSpeed*.07;
  }
  // Drift only with room to commit, and release before a hairpin reverses direction.
  const curveAhead=course.at(r.distance+16).curvature;
  const drift=!branch&&r.speed>20&&Math.abs(road.curvature)>.009&&Math.abs(road.curvature)<.032&&
    Math.sign(curveAhead)===Math.sign(road.curvature)&&Math.abs(r.lane)<5.6&&Math.abs(r.yaw)<.5&&r.charge<1.78&&(!r.drifting||r.driftDirection===Math.sign(road.curvature));
  let steer=desiredRate/Math.max(.05,steeringGain(r,drift));
  if(drift)steer=(steer-Math.sign(road.curvature)*.55)/.45;
  const input:Controls={...neutral(),throttle:r.speed<desiredSpeed+.2?1:clamp(1-(r.speed-desiredSpeed)*.35,0,1),brake:clamp((r.speed-desiredSpeed-1)/5,0,1),steer:clamp(steer,-1,1),drift};
  let decision=itemDecisions.get(r);if(!decision){decision={lastUse:-10,backward:false};itemDecisions.set(r,decision);}
  const center=course.position(r.distance,r.lane,r.height+.85),heading=road.heading-r.yaw;
  const opponents=race.racers.filter(other=>other!==r&&other.finished===null).map(other=>({other,gap:wrap(other.distance-r.distance+course.length/2,course.length)-course.length/2}));
  const danger=race.pickups.shells.some(shell=>shell.owner!==index&&shell.position.distanceTo(center)<38&&(shell.target===index||shell.position.clone().sub(center).dot(road.tangent)<0));
  input.itemBackward=decision.backward;
  if(r.item&&r.hit<.35){
    if(r.lastItem){
      // Stay equipped while a threat approaches, release a short attack on the next tick.
      input.item=isDefensiveItem(r.item)&&danger;
      if(!input.item)decision.lastUse=race.elapsed;
    }else if(race.elapsed-decision.lastUse>.7){
      const ahead=opponents.filter(o=>o.gap>5&&o.gap<100).sort((a,b)=>a.gap-b.gap);
      const rear=opponents.some(o=>o.gap< -5&&o.gap> -25&&Math.abs(o.other.lane-r.lane)<2.2);
      const close=opponents.some(o=>Math.abs(o.gap)<14&&Math.abs(o.other.height-r.height)<2);
      const greenShot=ahead.some(({other,gap})=>{
        const target=course.position(other.distance,other.lane,other.height+.85),dx=target.x-center.x,dz=target.z-center.z;
        const along=dx*Math.sin(heading)+dz*Math.cos(heading),across=dx*Math.cos(heading)-dz*Math.sin(heading);
        const otherHeading=course.at(other.distance).heading-other.yaw;
        const closing=48-other.speed*Math.cos(otherHeading-heading),time=along/Math.max(5,closing);
        const intercept=across+Math.sin(otherHeading-heading)*other.speed*time;
        return gap<65&&along>6&&time<2.5&&Math.abs(intercept)<1.35&&Math.abs(other.height-r.height)<1.2;
      });
      const freeSlot=Boolean(r.reserveItem)&&race.itemBoxes.boxes.some(b=>{const gap=wrap(b.distance-r.distance,course.length);return gap>0&&gap<30&&!b.cooldown;});
      decision.backward=r.item==='banana'&&(rear||freeSlot||danger);
      input.itemBackward=decision.backward;
      input.item=isDefensiveItem(r.item)&&danger||r.item==='red-shell'&&ahead.length>0||r.item==='green-shell'&&greenShot||
        r.item==='banana'&&(rear||freeSlot||ahead.some(o=>o.gap<22&&Math.abs(o.other.lane-r.lane)<2))||
        r.item==='pulse'&&(close||danger)||r.item==='turbo'&&maxCurve<.033&&!r.boost||r.item==='star'&&(close||race.position>2)||r.item==='shield'&&danger;
      if(input.item&&!isDefensiveItem(r.item))decision.lastUse=race.elapsed;
    }
  }
  return input;
}
