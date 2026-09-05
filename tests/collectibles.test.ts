import { describe,it,expect } from 'vitest';
import { Course } from '../src/game/course';
import { Race } from '../src/game/race';
import { neutral } from '../src/network/protocol';
import { CollectibleVisuals } from '../src/game/collectible-visuals';
import { Scene,Mesh } from 'three';
import { updateCombat } from '../src/game/combat';
const course=new Course();
function isolated(count=1){const race=new Race(course,0,()=>0);race.racers=race.racers.slice(0,count);return race;}
function tick(race:Race,seconds:number){for(let i=0;i<seconds*120;i++)race.update(neutral(),1/120);}
describe('Mario Kart-style collectibles',()=>{
 it('fills a second slot then consumes both in FIFO order on separate presses',()=>{
   const race=isolated(),r=race.player;r.distance=course.boxes[0];r.lane=0;r.item='banana';
   race.update(neutral(),1/120);expect(r.pendingItem).toBe('turbo');tick(race,.8);
   expect(r.item).toBe('banana');expect(r.reserveItem).toBe('turbo');
   race.update({...neutral(),item:true,itemBackward:true},1/120);race.update(neutral(),1/120);expect(race.pickups.bananas).toHaveLength(1);expect(r.item).toBe('turbo');expect(r.reserveItem).toBeNull();
   tick(race,.05);race.update({...neutral(),item:true},1/120);expect(r.item).toBeNull();expect(r.boost).toBeGreaterThan(2);
 });
 it('collects only coins on the swept path, caps at ten, and respawns them',()=>{
   const race=isolated(),r=race.player,coin=race.pickups.coins[0];r.distance=coin.distance;r.lane=coin.lane;r.coins=9;
   race.update(neutral(),1/120);expect(r.coins).toBe(10);expect(coin.cooldown).toBe(6);
   race.update(neutral(),1/120);expect(r.coins).toBe(10);expect(coin.cooldown).toBeLessThan(6);
   r.distance=0;race.pickups.update(6);expect(coin.cooldown).toBe(0);
   race.reset(0);expect(race.player.coins).toBe(0);expect(race.pickups.coins.every(c=>!c.cooldown)).toBe(true);
 });
 it('leaves a physical banana behind and hits a following kart, losing coins',()=>{
   const race=isolated(2),[r,other]=race.racers;r.distance=110;r.lane=0;r.item='banana';other.distance=90;other.lane=0;other.coins=8;
   race.update({...neutral(),item:true,itemBackward:true},1/120);race.update(neutral(),1/120);expect(race.pickups.bananas).toHaveLength(1);expect(r.hit).toBe(0);
   other.distance=106;other.lane=0;other.speed=20;race.update(neutral(),1/120);
   expect(other.hit).toBeGreaterThan(1);expect(other.coins).toBe(5);expect(race.pickups.bananas).toHaveLength(0);
 });
 it('travels before a green shell hits and cannot hit its owner at launch',()=>{
   const race=isolated(2),[r,other]=race.racers;r.distance=80;r.lane=0;r.item='green-shell';other.distance=106;other.lane=0;other.speed=0;
   const launch=course.position(r.distance+3.5,0),aim=course.position(other.distance,0);
   r.yaw=course.at(r.distance).heading-Math.atan2(aim.x-launch.x,aim.z-launch.z);
   race.update({...neutral(),item:true},1/120);race.update(neutral(),1/120);expect(race.pickups.shells).toHaveLength(1);expect(other.hit).toBe(0);expect(r.hit).toBe(0);
   // Keep the target stationary: the live AI can now dodge a ballistic green shell.
   const combatTick=(seconds:number)=>{for(let i=0;i<seconds*120;i++)updateCombat(race,1/120,index=>{race.racers[index].hit=1.25;});};
   const start=race.pickups.shells[0].position.clone();combatTick(.15);expect(race.pickups.shells[0].position.distanceTo(start)).toBeGreaterThan(5);
   combatTick(.6);expect(other.hit).toBeGreaterThan(0);expect(race.pickups.shells).toHaveLength(0);
 });
 it('red shell steers toward the driver ahead across the lap seam',()=>{
   const race=isolated(2),[r,other]=race.racers;r.distance=course.length-20;r.lane=-3;r.item='red-shell';other.distance=course.length+15;other.lane=3;
   race.update({...neutral(),item:true},1/120);race.update(neutral(),1/120);const shell=race.pickups.shells[0];expect(shell.target).toBe(1);
   tick(race,.2);expect(shell.lane).toBeGreaterThan(-3);tick(race,.8);expect(other.hit).toBeGreaterThan(0);
 });
 it('star protects against projectiles and bananas and expires',()=>{
   const race=isolated(),r=race.player;r.distance=100;r.lane=0;r.coins=10;r.item='star';
   race.update({...neutral(),item:true},1/120);expect(r.star).toBeGreaterThan(6);
   race.pickups.drop(1,104,0);race.update(neutral(),1/120);expect(r.hit).toBe(0);expect(r.coins).toBe(10);
   tick(race,7.1);expect(r.star).toBe(0);expect(r.shield).toBe(0);
 });
 it('renders finite geometry for coins, shells, bananas and star sparkles and removes expired objects',()=>{
   const race=isolated(),scene=new Scene(),visuals=new CollectibleVisuals(scene,race);race.player.star=2;
   race.pickups.drop(0,100,0);race.pickups.shoot('green-shell',0,110,0,0,0,null);race.pickups.shoot('red-shell',0,120,0,0,0,null);
   visuals.update(1);let meshes=0;scene.traverse(o=>{if(o instanceof Mesh){meshes++;const positions=o.geometry.getAttribute('position');expect(Array.from(positions.array).every(Number.isFinite)).toBe(true);}});expect(meshes).toBeGreaterThan(72);
   const children=visuals.root.children.length;race.pickups.reset();visuals.update(2);expect(visuals.root.children.length).toBe(children-3);
 });
});
