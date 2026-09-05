import { describe,it,expect } from 'vitest';
import { Race } from '../src/game/race';
import { Course } from '../src/game/course';
import { neutral,isControls } from '../src/network/protocol';
import { ControlBuffer } from '../src/network/control-buffer';
import { activateItem,heldItemPosition,updateCombat } from '../src/game/combat';
import { kartOverlap } from '../src/game/contacts';
import { driveAI } from '../src/game/ai-driver';
import { TouchState } from '../src/controller/touch';
const course=new Course();
function raceAt(count=1){const race=new Race(course);race.racers=race.racers.slice(0,count);race.racers.forEach((r,i)=>{r.distance=100+i*25;r.lane=0;});return race;}
function hold(race:Race,seconds=.22,backward=false){for(let i=0;i<seconds*120;i++)race.update({...neutral(),item:true,itemBackward:backward},1/120);}
describe('item defense and directional throws',()=>{
  it('requires a real oriented kart contact for star damage',()=>{
    const race=raceAt(2),[a,b]=race.racers;b.distance=104;a.yaw=b.yaw=Math.PI/2;a.star=5;
    expect(kartOverlap(a,b,course)).toBeNull();race.update(neutral(),1/120);expect(b.hit).toBe(0);
    b.distance=a.distance+2;expect(kartOverlap(a,b,course)).not.toBeNull();race.update(neutral(),1/120);expect(b.hitKind).toBe('tumble');
  });
  it('equips after holding, releases once, and preserves the second slot',()=>{
    const race=raceAt(),r=race.player;r.item='green-shell';r.reserveItem='turbo';
    hold(race);expect(r.heldItem).toBe('green-shell');expect(r.item).toBe('green-shell');expect(race.pickups.shells).toHaveLength(0);
    race.update(neutral(),1/120);expect(r.heldItem).toBeNull();expect(r.item).toBe('turbo');expect(race.pickups.shells).toHaveLength(1);expect(r.throwAnimation).toBeGreaterThan(0);
    race.update(neutral(),1/120);expect(race.pickups.shells).toHaveLength(1);expect(r.item).toBe('turbo');
  });
  it('preserves a tap and its backward direction received entirely between physics frames',()=>{
    const race=raceAt(),r=race.player,buffer=new ControlBuffer();r.item='red-shell';
    buffer.push({...neutral(),item:true,itemBackward:true});buffer.push(neutral());
    race.update(buffer.read(),1/120);expect(race.pickups.shells).toHaveLength(0);
    race.update(buffer.read(),1/120);expect(race.pickups.shells).toHaveLength(1);expect(race.pickups.shells[0].backward).toBe(true);expect(race.pickups.shells[0].target).toBeNull();
    const s=race.pickups.shells[0],distance=s.distance;for(let i=0;i<12;i++)updateCombat(race,1/120,()=>{});expect(s.distance).toBeLessThan(distance);
    expect(isControls({...neutral(),itemBackward:true})).toBe(true);expect(isControls({...neutral(),itemBackward:'yes'})).toBe(false);
  });
  it('intercepts an approaching rear shell and consumes the held item, not the reserve',()=>{
    const race=raceAt(),r=race.player;r.item='banana';r.reserveItem='turbo';hold(race);
    const defense=heldItemPosition(race,0),shell=race.pickups.shoot('red-shell',1,90,0,0,0,0);shell.position.copy(defense);shell.distance=r.distance-3.2;
    race.update({...neutral(),item:true},1/120);
    expect(r.hit).toBe(0);expect(r.heldItem).toBeNull();expect(r.item).toBe('turbo');expect(race.pickups.shells).toHaveLength(0);expect(race.events.some(e=>e.type==='protected')).toBe(true);
    race.update(neutral(),1/120);expect(r.item).toBe('turbo');expect(r.boost).toBe(0);
  });
  it('does not block a front hit with an item held behind',()=>{
    const race=raceAt(),r=race.player;r.item='banana';hold(race);
    const shell=race.pickups.shoot('green-shell',1,105,0,0,0,null,true);shell.position.copy(course.position(r.distance,0,.6));shell.distance=r.distance;
    race.update({...neutral(),item:true},1/120);expect(r.hitKind).toBe('tumble');expect(r.heldItem).toBeNull();
  });
  it('distinguishes banana spin, shell tumble and horn bump',()=>{
    for(const item of ['banana','green-shell','pulse'] as const){
      const race=raceAt(item==='pulse'?2:1),r=race.player;
      if(item==='banana')race.pickups.drop(1,r.distance+3.5,0);
      if(item==='green-shell'){const shell=race.pickups.shoot(item,1,r.distance-3.5,0,0,0,null);shell.position.copy(course.position(r.distance,0,.6));}
      if(item==='pulse'){race.racers[1].distance=r.distance+8;race.racers[1].item='pulse';race.racers[1].lastItem=false;}
      race.update(neutral(),1/120);
      expect(r.hitKind).toBe(item==='banana'?'spin':item==='pulse'?'bump':'tumble');expect(race.events.some(e=>e.type==='hit'&&e.item===item&&e.position&&e.strength)).toBe(true);
    }
  });
  it('throws a banana forwards as an arc and backwards as a dropped hazard',()=>{
    const forward=raceAt(),back=raceAt();activateItem(forward,0,'banana',()=>{},false);activateItem(back,0,'banana',()=>{},true);
    const thrown=forward.pickups.bananas[0],dropped=back.pickups.bananas[0];expect(thrown.grounded).toBe(false);expect(thrown.velocity.y).toBeGreaterThan(5);expect(thrown.distance).toBeGreaterThan(100);expect(dropped.distance).toBeLessThan(100);
  });
  it('keeps backthrow independent from simultaneous steering, gas and drift fingers',()=>{
    const touch=new TouchState(),buffer=new ControlBuffer(),race=raceAt();race.player.item='green-shell';
    touch.press(1,'left');touch.press(2,'gas');touch.press(3,'drift');touch.press(4,'backthrow');
    expect(touch.read()).toMatchObject({steer:-1,throttle:1,drift:true,item:true,itemBackward:true});
    buffer.push(touch.read());touch.release(4);touch.release(4);buffer.push(touch.read());
    race.update(buffer.read(),1/120);race.update(buffer.read(),1/120);
    expect(race.pickups.shells).toHaveLength(1);expect(race.pickups.shells[0].backward).toBe(true);
    expect(touch.read()).toMatchObject({steer:-1,throttle:1,drift:true,item:false});
    touch.clear();expect(touch.read()).toEqual(neutral());
  });
  it('cancels a prepared backward throw on pause and accepts a fresh backward tap after resume',()=>{
    const race=raceAt(),r=race.player;r.item='red-shell';r.reserveItem='turbo';hold(race,.24,true);
    race.cancelItemGesture();race.update(neutral(),1/120);
    expect(race.pickups.shells).toHaveLength(0);expect(r.item).toBe('red-shell');expect(r.reserveItem).toBe('turbo');expect(r.heldItem).toBeNull();
    race.update({...neutral(),item:true,itemBackward:true},1/120);race.update(neutral(),1/120);
    expect(race.pickups.shells).toHaveLength(1);expect(race.pickups.shells[0].backward).toBe(true);expect(r.item).toBe('turbo');
  });
  it('re-equips when the phone button is still held after resume without launching automatically',()=>{
    const race=raceAt(),r=race.player;r.item='green-shell';hold(race,.24,true);
    race.cancelItemGesture();hold(race,.24,true);
    expect(r.heldItem).toBe('green-shell');expect(race.pickups.shells).toHaveLength(0);
    race.update(neutral(),1/120);expect(race.pickups.shells).toHaveLength(1);expect(race.pickups.shells[0].backward).toBe(true);
  });
  it('cancels an uncompleted press on hit without firing a second item on release',()=>{
    const race=raceAt(),r=race.player;r.item='green-shell';r.reserveItem='turbo';race.update({...neutral(),item:true},1/120);
    const shell=race.pickups.shoot('green-shell',1,100,0,0,0,null);shell.position.copy(course.position(r.distance,0,.6));shell.distance=r.distance;
    race.update({...neutral(),item:true},1/120);expect(r.hitKind).toBe('tumble');expect(r.throwTime).toBe(0);
    race.update(neutral(),1/120);expect(race.pickups.shells).toHaveLength(0);expect(r.item).toBe('green-shell');expect(r.reserveItem).toBe('turbo');
  });
  it('keeps a held item when a front hit is absorbed by a star',()=>{
    const race=raceAt(),r=race.player;r.item='banana';r.star=5;hold(race);
    const shell=race.pickups.shoot('green-shell',1,100,0,0,0,null);shell.position.copy(course.position(r.distance,0,.6));shell.distance=r.distance;
    race.update({...neutral(),item:true},1/120);expect(r.hit).toBe(0);expect(r.heldItem).toBe('banana');expect(r.item).toBe('banana');
    race.update(neutral(),1/120);expect(race.pickups.bananas).toHaveLength(1);expect(r.item).toBeNull();
  });
  it('makes an AI equip a defense for an incoming target instead of waiting on a global clock',()=>{
    const race=raceAt(2),r=race.racers[1];r.item='banana';race.elapsed=.173;
    race.pickups.shoot('red-shell',0,r.distance-20,0,0,0,1);
    expect(driveAI(race,r,1).item).toBe(true);
  });
});
