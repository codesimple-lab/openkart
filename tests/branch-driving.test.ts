import {describe,it,expect} from 'vitest';
import {Course} from '../src/game/course';
import {Race} from '../src/game/race';
import {driveAI} from '../src/game/ai-driver';
import {railContact} from '../src/game/contacts';
import {setRouteVelocity,routeVelocity} from '../src/game/vehicle-physics';
import {updateCombat,captureCombatFrame,activateItem} from '../src/game/combat';
import {neutral} from '../src/network/protocol';
const course=new Course();
describe('shortcut driving and separators',()=>{
 it.each(course.routes)('saves measurable time through $id with the same driver and visible pads',route=>{
  const times:number[]=[];
  for(const takeBranch of [false,true]){
   const c=new Course();if(!takeBranch){c.routes.splice(0);c.routeBoosts.splice(0);}
   const race=new Race(c);race.racers=race.racers.slice(0,1);
   // Isolate the route choice from random inventory and coin-speed changes. Main-road pads
   // and the driver's ordinary drift policy remain active in both runs.
   race.itemBoxes.boxes.forEach(b=>b.cooldown=Infinity);race.pickups.coins.forEach(coin=>coin.cooldown=Infinity);
   const r=race.player;r.coins=10;r.distance=route.start-33;r.lane=0;r.speed=28;
   let ticks=0,impacts=0;
   while(r.distance<route.end+12&&ticks<2400){
    const impact=r.impact;race.update(driveAI(race,r,1),1/120);if(r.impact>impact+.05)impacts++;ticks++;
    expect(r.speed).toBeLessThanOrEqual(r.pilot.speed+2.5+11+.15);
   }
   expect(r.distance).toBeGreaterThan(route.end+12);expect(impacts).toBe(0);times.push(ticks/120);
  }
  console.info('shortcut time',route.id,{main:times[0],branch:times[1],saved:times[0]-times[1]});
  expect(times[0]-times[1]).toBeGreaterThan(.75);
 });
 it.each([0,1])('gives racer %i the same physical shortcut pad and no boost from the main road',index=>{
  for(const pad of course.routeBoosts){
   const race=new Race(course);race.racers=race.racers.slice(0,2);const r=race.racers[index];
   r.distance=pad.distance;r.lane=0;r.speed=20;race.update(neutral(),1/120);expect(r.boost).toBe(0);
   r.distance=pad.distance;r.lane=pad.lane;r.speed=20;race.update(neutral(),1/120);
   expect(r.boostKind).toBe('pad');expect(r.boost).toBe(pad.duration);
  }
 });
 it.each(course.routes)('lets an isolated opponent enter and leave $id on its wheels',route=>{
  const race=new Race(course);race.racers=race.racers.slice(0,1);const r=race.player;r.distance=route.start-33;r.lane=0;r.speed=28;let maxLane=0,impacts=0,ticks=0;
  while(r.distance<route.end+12&&ticks<120*20){const impact=r.impact;race.update(driveAI(race,r,1),1/120);if(r.impact>impact+.05)impacts++;maxLane=Math.max(maxLane,route.side*r.lane);expect(r.flying).toBe(false);expect(r.height).toBe(0);ticks++;}
  console.log('branch',route.id,{time:ticks/120,impacts,maxLane,end:r.distance});
  expect(r.distance).toBeGreaterThan(route.end+10);expect(maxLane).toBeGreaterThan(route.offset*.7);expect(impacts).toBe(0);
 });
 it.each(course.routes)('uses both real walls of the $id branch instead of a main-road wall',route=>{
  const race=new Race(course),r=race.player;r.distance=(route.start+route.end)/2;r.lane=course.routeLane(route,r.distance);r.speed=25;
  const lane=r.lane;expect(railContact(r,course)).toBe(0);expect(r.lane).toBe(lane);
  const bounds=course.laneBounds(r.distance,r.lane);r.lane=bounds[0]+.4;r.yaw=-.3;
  expect(railContact(r,course)).toBeGreaterThan(0);expect(r.lane).toBeGreaterThan(bounds[0]+1.4);
 });
 it.each(course.routes)('lets a red shell follow a target through the $id junction',route=>{
  const race=new Race(course);race.racers=race.racers.slice(0,2);const [owner,target]=race.racers;owner.distance=route.start-8;owner.lane=0;target.distance=route.start+16;target.lane=course.routeLane(route,target.distance);
  activateItem(race,0,'red-shell',i=>race.racers[i].hit=1);
  for(let n=0;n<480&&!target.hit;n++){const previous=captureCombatFrame(race);const metric=Math.max(.35,1-course.at(target.distance).curvature*target.lane);target.distance+=24/metric/120;target.lane=course.routeLane(route,target.distance);updateCombat(race,1/120,i=>race.racers[i].hit=1,previous);}
  expect(target.hit).toBeGreaterThan(0);
 });
 it.each(course.routes)('places five collectible rewards along $id without overlapping another coin',route=>{
  const race=new Race(course);
  for(const fraction of [.42,.48,.54,.60,.66]){
   const distance=route.start+(route.end-route.start)*fraction,lane=course.routeLane(route,distance),coin=race.pickups.coins.find(c=>Math.abs(c.distance-distance)<.01&&Math.abs(c.lane-lane)<.01);
   expect(coin).toBeDefined();expect(coin!.height).toBe(1.25);expect(course.surface(distance,lane)).toBe('asphalt');
   expect(race.pickups.coins.filter(c=>c!==coin&&c.position.distanceTo(coin!.position)<3)).toHaveLength(0);
   const before=course.position(distance-1,course.routeLane(route,distance-1),1.15),after=course.position(distance+1,course.routeLane(route,distance+1),1.15);
   expect(race.pickups.collectCoins(before,after)).toBeGreaterThan(0);expect(coin!.cooldown).toBe(6);
  }
 });
 it('does not create an impact when velocity is tangent to a curved shortcut wall',()=>{
  const race=new Race(course),r=race.player,route=course.routes[0];r.distance=route.start+(route.end-route.start)*.3;
  const center=course.routeLane(route,r.distance);r.lane=course.laneBounds(r.distance,center)[1]-1.46+.04;
  const slope=(course.laneBounds(r.distance+.3,r.lane)[1]-course.laneBounds(r.distance-.3,r.lane)[1])/.6;
  const metric=Math.max(.35,1-course.at(r.distance).curvature*r.lane);
  setRouteVelocity(r,30,30*slope/metric);const before=routeVelocity(r);
  expect(railContact(r,course)).toBeLessThan(.00001);expect(routeVelocity(r).forward).toBeCloseTo(before.forward,10);expect(routeVelocity(r).side).toBeCloseTo(before.side,10);
 });
 it.each(course.routes)('lets a lobbed banana land on the actual $id pavement',route=>{
  const race=new Race(course);race.racers.forEach(r=>r.distance=0);const distance=(route.start+route.end)/2,lane=course.routeLane(route,distance);
  const banana=race.pickups.drop(7,distance+3.5,lane,3,0);banana.velocity.set(0,0,0);
  for(let n=0;n<120&&!banana.grounded;n++)updateCombat(race,1/120,()=>{});
  expect(banana.grounded).toBe(true);expect(banana.position.y).toBeCloseTo(course.position(banana.distance,banana.lane,.45).y,5);
 });
 it('keeps a projectile inside the branch corridor and reflects from its median wall',()=>{
  const race=new Race(course);race.racers.forEach(r=>r.distance=0);const route=course.routes[0],distance=(route.start+route.end)/2,center=course.routeLane(route,distance);
  const shell=race.pickups.shoot('green-shell',0,distance,center,-Math.PI/2,0,null);
  for(let n=0;n<25&&!shell.bounces;n++)updateCombat(race,1/120,()=>{});
  expect(shell.bounces).toBeGreaterThan(0);expect(shell.lane).toBeGreaterThan(course.at(distance).width/2+2);
 });
});
