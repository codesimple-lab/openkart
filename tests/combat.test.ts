import { describe,expect,it } from 'vitest';
import { Vector3 } from 'three';
import { Course, angle } from '../src/game/course';
import { Race } from '../src/game/race';
import { activateItem,captureCombatFrame,updateCombat } from '../src/game/combat';
import { ItemBoxes,PickupField,movingBodiesTouch } from '../src/game/items';
const course=new Course();
function setup(){const race=new Race(course);race.racers=race.racers.slice(0,2);race.racers.forEach((r,i)=>{r.distance=100+i*25;r.lane=0;r.speed=0;r.height=0;});return race;}
function damage(race:Race){return(i:number)=>{const r=race.racers[i];if(!r.shield&&!r.star){r.hit=1;r.speed*=.3;}};}
describe('physical projectiles',()=>{
  it('sweeps the relative movement of both bodies, including height',()=>{
    expect(movingBodiesTouch(new Vector3(-5,0,0),new Vector3(5,0,0),new Vector3(0,0,-5),new Vector3(0,0,5))).toBe(true);
    expect(movingBodiesTouch(new Vector3(-5,3,0),new Vector3(5,3,0),new Vector3(0,0,-5),new Vector3(0,0,5))).toBe(false);
  });
  it('keeps a green shell moving in its world heading through a bend',()=>{
    const race=setup();race.racers.forEach(r=>r.distance=10);
    const distance=course.length*.14,shell=race.pickups.shoot('green-shell',0,distance,0,0,0,null),heading=shell.heading,start=shell.position.clone();
    for(let n=0;n<30;n++)updateCombat(race,1/120,damage(race));
    expect(shell.bounces).toBe(0);expect(angle(shell.heading-heading)).toBeCloseTo(0,7);
    expect(shell.position.x-start.x).toBeCloseTo(Math.sin(heading)*48*.25,3);
    expect(shell.position.z-start.z).toBeCloseTo(Math.cos(heading)*48*.25,3);
  });
  it('does not give a green shell automatic homing onto the adjacent lane',()=>{
    const race=setup();race.racers[1].lane=5;
    activateItem(race,0,'green-shell',damage(race));
    for(let n=0;n<100;n++)updateCombat(race,1/120,damage(race));
    expect(race.racers[1].hit).toBe(0);
  });
  it('red shells hit moving targets consistently across frame rates and the lap seam',()=>{
    for(const dt of [1/30,1/60,1/120])for(const seam of [false,true]){
      const race=setup(),[owner,target]=race.racers;owner.distance=seam?course.length-12:100;target.distance=owner.distance+20;target.lane=2;target.speed=24;
      activateItem(race,0,'red-shell',damage(race));
      for(let t=0;t<3&&!target.hit;t+=dt){const previous=captureCombatFrame(race);target.distance+=24*dt;updateCombat(race,dt,damage(race),previous);}
      expect(target.hit,`dt=${dt}, seam=${seam}`).toBeGreaterThan(0);expect(race.pickups.shells).toHaveLength(0);
    }
  });
  it('does not turn away forever after overshooting a red-shell target',()=>{
    const race=setup();const target=race.racers[1];target.distance=120;target.lane=2;
    race.pickups.shoot('red-shell',0,119,0,0,0,1);
    for(let n=0;n<480&&!target.hit;n++)updateCombat(race,1/120,damage(race));
    expect(target.hit).toBeGreaterThan(0);
  });
  it('allows an airborne projectile to pass over a low roadside rail',()=>{
    const race=setup(),shell=race.pickups.shoot('green-shell',0,course.flight[0]+45,7,Math.PI/2,6,null);
    for(let n=0;n<20;n++)updateCombat(race,1/120,damage(race));
    expect(shell.bounces).toBe(0);expect(shell.lane).toBeGreaterThan(10);
  });
  it('preserves thrown-object altitude and lets a banana fall under gravity',()=>{
    const race=setup(),r=race.player;r.distance=course.flight[0]+50;r.height=8;
    activateItem(race,0,'banana',damage(race));const banana=race.pickups.bananas[0],y=banana.position.y;
    expect(banana.position.y).toBeCloseTo(course.position(r.distance,r.lane,r.height+.65).y,5);expect(banana.grounded).toBe(false);
    for(let n=0;n<60;n++)updateCombat(race,1/120,damage(race));
    expect(banana.position.y).toBeLessThan(y);expect(banana.grounded).toBe(false);
  });
  it('collects a ground banana when a kart crosses it between frames',()=>{
    const race=setup(),target=race.racers[1];target.distance=115;
    race.pickups.drop(0,123.5,0);const previous=captureCombatFrame(race);target.distance=125;
    updateCombat(race,1/30,damage(race),previous);expect(target.hit).toBeGreaterThan(0);expect(race.pickups.bananas).toHaveLength(0);
  });
  it('destroys a projectile on shield/star contact without hurting the protected kart',()=>{
    for(const protection of ['shield','star'] as const){
      const race=setup(),target=race.racers[1];target[protection]=5;
      activateItem(race,0,'red-shell',damage(race));
      for(let n=0;n<240&&race.pickups.shells.length;n++)updateCombat(race,1/120,damage(race));
      expect(target.hit).toBe(0);expect(race.pickups.shells).toHaveLength(0);expect(race.pickups.impacts.some(i=>i.kind==='protected')).toBe(true);
    }
  });
  it('shells collide with shells and banana peels; the horn clears both',()=>{
    const race=setup();race.racers.forEach(r=>r.distance=10);
    race.pickups.shoot('green-shell',0,100,0,0,0,null);race.pickups.shoot('green-shell',1,113,0,Math.PI,0,null);
    for(let n=0;n<60&&race.pickups.shells.length;n++)updateCombat(race,1/120,damage(race));
    expect(race.pickups.shells).toHaveLength(0);
    const banana=race.pickups.drop(0,114,0);race.pickups.shoot('green-shell',1,100,0,0,0,null);
    for(let n=0;n<60&&race.pickups.shells.length;n++)updateCombat(race,1/120,damage(race));
    expect(banana.life).toBeLessThanOrEqual(0);expect(race.pickups.shells).toHaveLength(0);
    race.player.distance=100;race.pickups.drop(1,110,0);race.pickups.shoot('red-shell',1,100,0,0,0,0);
    activateItem(race,0,'pulse',damage(race));expect(race.pickups.shells).toHaveLength(0);expect(race.pickups.bananas).toHaveLength(0);
  });
});
describe('tight collectible volumes',()=>{
  it('does not grab a box/coin over the head or from an adjacent lane',()=>{
    const boxes=new ItemBoxes(course),box=boxes.boxes[1];
    boxes.boxes.splice(0,boxes.boxes.length,box); // Adjacent row cubes must not mask a miss.
    expect(boxes.collect(course.position(box.distance-4,4,1.15),course.position(box.distance+4,4,1.15))).toBeNull();
    expect(boxes.collect(course.position(box.distance-4,0,5),course.position(box.distance+4,0,5))).toBeNull();
    const field=new PickupField(course),coin=field.coins[0];field.coins.splice(1);
    expect(field.collectCoins(course.position(coin.distance-4,coin.lane+1.4,1.25),course.position(coin.distance+4,coin.lane+1.4,1.25))).toBe(0);
    expect(field.collectCoins(course.position(coin.distance-6,coin.lane,1.15),course.position(coin.distance+6,coin.lane,1.15))).toBe(1);
  });
});
