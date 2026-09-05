import { describe, it, expect, vi } from 'vitest';
import { Course } from '../src/game/course';
import { ItemBoxes } from '../src/game/items';
import { Race } from '../src/game/race';
import { neutral } from '../src/network/protocol';
const course=new Course();
const row=course.boxes[0];
function isolated(){const race=new Race(course,0,()=>0);race.racers=race.racers.slice(0,1);return race;}
describe('physical item boxes',()=>{
  it('requires contact with the visible cube, including its height',()=>{
    for(const [lane,height] of [[7,1.15],[0,8]]){
      const field=new ItemBoxes(course);
      expect(field.collect(course.position(row-4,lane,height),course.position(row+4,lane,height))).toBeNull();
    }
    const field=new ItemBoxes(course);
    expect(field.collect(course.position(row-12,0,1.15),course.position(row+12,0,1.15))?.lane).toBe(0);
  });
  it('shares consumed boxes between racers and respawns after 2.5 seconds',()=>{
    const field=new ItemBoxes(course),from=course.position(row-4,0,1.15),to=course.position(row+4,0,1.15);
    expect(field.collect(from,to)).not.toBeNull();expect(field.collect(from,to)).toBeNull();
    field.update(2.49);expect(field.collect(from,to)).toBeNull();field.update(.02);expect(field.collect(from,to)).not.toBeNull();
    field.reset();expect(field.boxes.every(b=>b.cooldown===0)).toBe(true);
  });
  it('awards exactly one item after roulette and uses it on a fresh button press',()=>{
    const race=isolated(),r=race.player;r.distance=row;r.lane=0;
    race.update({...neutral(),item:true},1/120);
    expect(r.pendingItem).toBe('turbo');expect(r.item).toBeNull();
    for(let i=0;i<90;i++)race.update({...neutral(),item:true},1/120);
    expect(r.item).toBe('turbo');expect(r.boost).toBe(0);
    race.update(neutral(),1/120);race.update({...neutral(),item:true},1/120);
    expect(r.item).toBeNull();expect(r.boost).toBeGreaterThan(2);
    expect(race.events.filter(e=>e.type==='pickup')).toHaveLength(1);
  });
  it('does not consume a box when inventory is full',()=>{
    const race=isolated(),r=race.player;r.distance=row;r.lane=0;r.item='shield';r.reserveItem='banana';
    race.update(neutral(),1/120);expect(r.item).toBe('shield');expect(race.itemBoxes.boxes.every(b=>b.cooldown===0)).toBe(true);
  });
  it('activates protection and hits an opponent with the offensive item',()=>{
    const race=new Race(course),r=race.player,target=race.racers[1];r.distance=100;r.lane=0;r.item='shield';
    target.distance=114;target.lane=0;target.speed=30;
    race.update({...neutral(),item:true},1/120);expect(r.shield).toBeGreaterThan(5);
    race.update(neutral(),1/120);r.item='pulse';race.update({...neutral(),item:true},1/120);
    expect(target.hitKind).toBe('bump');expect(target.hit).toBeGreaterThan(.7);expect(target.speed).toBeLessThan(16);
  });
});
describe('map audit regressions',()=>{
  it('has no abrupt road width changes',()=>{
    course.samples.forEach((s,i)=>expect(Math.abs(s.width-course.samples[(i+1)%course.resolution].width)).toBeLessThan(.1));
  });
  it('clears stale airborne state and keeps the former sky section on the road',()=>{
    const race=isolated(),r=race.player;r.distance=course.flight[0]+45;r.lane=0;r.height=6;r.flying=true;r.speed=26;
    race.update(neutral(),1/120);expect(r.height).toBe(0);expect(r.flying).toBe(false);expect(r.vertical).toBe(0);
    expect(race.events.some(e=>e.type==='glider'||e.type==='landing')).toBe(false);expect(r.boost).toBe(0);
  });
  it('places collectible coins on drivable ground in the old flight corridor',()=>{
    const race=isolated();
    const coins=race.pickups.coins.filter(coin=>coin.distance>course.flight[0]&&coin.distance<course.flight[1]);
    expect(coins.length).toBeGreaterThan(0);
    for(const coin of coins){expect(coin.height).toBe(1.25);expect(coin.position.distanceTo(course.position(coin.distance,coin.lane,1.25))).toBeLessThan(.001);}
  });
  it('collides with a kart one whole lap behind',()=>{
    const race=new Race(course);race.racers=race.racers.slice(0,2);
    const [a,b]=race.racers;a.distance=100+course.length;b.distance=100;a.lane=b.lane=0;a.speed=b.speed=25;
    race.update(neutral(),1/120);expect(a.hit).toBeGreaterThan(0);expect(b.hit).toBeGreaterThan(0);
  });
});

describe('short item button taps',()=>{
  it('preserves a phone press and release received before a physics tick',async()=>{
    const {ControlBuffer}=await import('../src/network/control-buffer');const buffer=new ControlBuffer();
    buffer.push({...neutral(),item:true});buffer.push(neutral());
    expect(buffer.read().item).toBe(true);expect(buffer.read().item).toBe(false);
    buffer.push({...neutral(),item:true});buffer.clear();expect(buffer.read()).toEqual(neutral());
  });
  it('preserves a quick keyboard E tap without waiting for key repeat',async()=>{
    const events=new EventTarget();vi.stubGlobal('window',events);
    try{
      const {Keyboard}=await import('../src/game/input');const keyboard=new Keyboard(()=>{});
      for(const name of ['keydown','keyup']){const e=new Event(name);Object.defineProperty(e,'code',{value:'KeyE'});events.dispatchEvent(e);}
      expect(keyboard.read().item).toBe(true);expect(keyboard.read().item).toBe(false);
    }finally{vi.unstubAllGlobals();}
  });
});
