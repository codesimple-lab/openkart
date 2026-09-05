import {describe,it,expect} from 'vitest';
import {Course,angle} from '../src/game/course';
import {Race} from '../src/game/race';
import {neutral,isControls,validRoom} from '../src/network/protocol';
import {TouchState} from '../src/controller/touch';
const course=new Course();
describe('a complete island circuit',()=>{
  it('has a continuous lap seam, elevation and drivable ground throughout',()=>{
    expect(course.length).toBeGreaterThan(1400);
    expect(course.at(course.length-.01).p.distanceTo(course.at(.01).p)).toBeLessThan(.04);
    expect(Math.abs(angle(course.at(course.length-.01).heading-course.at(.01).heading))).toBeLessThan(.01);
    expect(Math.max(...course.samples.map(s=>s.p.y))-Math.min(...course.samples.map(s=>s.p.y))).toBeGreaterThan(45);
    expect(course.flight[1]-course.flight[0]).toBeGreaterThan(100);
    for(let s=0;s<course.length;s+=4){expect(course.inVoid(s)).toBe(false);expect(course.inFlight(s)).toBe(false);}
  });
  it('keeps unrelated parts of the road apart',()=>{
    let clearance=Infinity;
    for(let i=0;i<course.samples.length;i+=8)for(let j=i+40;j<course.samples.length;j+=8){
      if(course.samples.length-j+i<40)continue;
      const a=course.samples[i].p,b=course.samples[j].p;
      if(Math.abs(a.y-b.y)>10)continue;
      clearance=Math.min(clearance,Math.hypot(a.x-b.x,a.z-b.z));
    }
    expect(clearance).toBeGreaterThan(16);
  });
});
describe('race mechanics',()=>{
  it('finishes three real laps on the ground with five opponents',()=>{
    const race=new Race(course);let airborne=false;
    const dt=1/60;
    for(let i=0;i<60*420&&race.player.finished===null;i++){
      const r=race.player,road=course.at(r.distance);
      const steer=Math.max(-1,Math.min(1,road.curvature*r.speed/1.55-r.lane*.075-r.yaw*.9));
      race.update({...neutral(),throttle:1,steer,item:!!r.item},dt);
      airborne||=race.racers.some(racer=>racer.flying||racer.height!==0);
      expect(Number.isFinite(r.distance)&&Number.isFinite(r.height)).toBe(true);
    }
    expect(race.player.finished).not.toBeNull();expect(race.lapTimes).toHaveLength(3);expect(airborne).toBe(false);expect(race.events.some(e=>e.type==='glider'||e.type==='landing')).toBe(false);
    expect(race.racers.slice(1).every(r=>r.distance>course.length*2)).toBe(true);
    expect(race.position).toBeGreaterThanOrEqual(1);expect(race.position).toBeLessThanOrEqual(6);
  });
  it('charges a drift and awards a boost only on release',()=>{
    const race=new Race(course),r=race.player;r.distance=80;r.speed=27;
    for(let i=0;i<75;i++)race.update({...neutral(),throttle:1,steer:.35,drift:true},1/120);
    expect(r.charge).toBeGreaterThan(.3);const charge=r.charge;
    race.update({...neutral(),throttle:1},1/120);expect(r.boost).toBeGreaterThan(.5);expect(charge).toBeGreaterThan(r.charge);
  });
  it('does not count a reverse crossing as a completed lap or let reset teleport progress',()=>{
    const race=new Race(course);race.player.distance=2;race.player.speed=-5;
    for(let i=0;i<120;i++)race.update({...neutral(),brake:1},1/120);
    expect(race.lapTimes).toHaveLength(0);const before=race.player.distance;
    race.recover();expect(race.player.distance).toBe(before);
  });
  it('can brake to a stop in the former flight section instead of forcing an air speed',()=>{
    const race=new Race(course),r=race.player;r.distance=course.flight[0]+30;r.speed=26;
    for(let i=0;i<120;i++)race.update({...neutral(),brake:1},1/120);
    expect(r.speed).toBeLessThan(4);expect(r.height).toBe(0);expect(r.flying).toBe(false);
  });
});
describe('phone control safety',()=>{
  it('handles simultaneous fingers and idempotent lost capture',()=>{
    const state=new TouchState();state.press(1,'left');state.press(2,'gas');state.press(3,'drift');
    expect(state.read()).toMatchObject({steer:-1,throttle:1,drift:true});state.release(1);state.release(1);
    expect(state.read()).toMatchObject({steer:0,throttle:1,drift:true});state.clear();expect(state.read()).toEqual(neutral());
  });
  it('rejects invalid commands and pairing codes',()=>{
    expect(isControls(neutral())).toBe(true);expect(isControls({...neutral(),steer:NaN})).toBe(false);
    expect(isControls({...neutral(),throttle:8})).toBe(false);expect(isControls({...neutral(),item:'yes'})).toBe(false);
    expect(validRoom('AB23YZ')).toBe(true);expect(validRoom('<html>')).toBe(false);expect(validRoom('123')).toBe(false);
  });
});

