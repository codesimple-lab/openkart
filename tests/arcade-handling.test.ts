import { describe,it,expect } from 'vitest';
import { updateDrift } from '../src/game/arcade-handling';
import { driveVehicle } from '../src/game/vehicle-physics';
import { RocketStart } from '../src/game/rocket-start';
import { Course } from '../src/game/course';
import { Race,makeRacer,PILOTS } from '../src/game/race';
import { neutral } from '../src/network/protocol';

describe('arcade driving gestures',()=>{
  it('keeps the drift through neutral and countersteer, releasing turbo only with the button',()=>{
    const r=makeRacer(PILOTS[0]);r.speed=28;
    updateDrift(r,{...neutral(),drift:true,steer:1},.01);
    for(let i=0;i<120;i++)updateDrift(r,{...neutral(),drift:true,steer:0},1/120);
    expect(r.drifting).toBe(true);expect(r.driftStage).toBe(1);expect(r.boost).toBe(0);
    for(let i=0;i<120;i++)updateDrift(r,{...neutral(),drift:true,steer:-1},1/120);
    expect(r.driftDirection).toBe(1);expect(r.driftStage).toBe(2);expect(r.boost).toBe(0);
    updateDrift(r,neutral(),1/120);
    expect(r.boostKind).toBe('super');expect(r.boost).toBeGreaterThan(1.4);expect(r.drifting).toBe(false);
  });
  it('needs a longer held drift for ultra and does not hop repeatedly while held',()=>{
    const r=makeRacer(PILOTS[0]);r.speed=28;
    for(let i=0;i<240;i++)updateDrift(r,{...neutral(),drift:true,steer:1},1/120);
    expect(r.driftStage).toBe(3);expect(r.hop).toBe(0);
    updateDrift(r,neutral(),1/120);expect(r.boostKind).toBe('ultra');expect(r.boost).toBeGreaterThan(2);
  });
  it('cancels charge on a hit without rewarding a turbo',()=>{
    const r=makeRacer(PILOTS[0]);r.speed=28;r.drifting=true;r.driftDirection=1;r.charge=1.8;r.hit=1;
    updateDrift(r,neutral(),1/120);expect(r.boost).toBe(0);expect(r.driftStage).toBe(0);
  });
  it('widens a committed drift with countersteer without reversing its turning direction',()=>{
    const course=new Course(),r=makeRacer(PILOTS[0]);r.speed=28;r.drifting=true;r.driftDirection=1;r.steer=-1;
    const flat={...course.at(0),curvature:0,tangent:course.at(0).tangent.clone().set(0,0,1)};
    driveVehicle(r,{...neutral(),throttle:1,steer:-1,drift:true},flat,course,1/120);
    expect(r.headingRate).toBeGreaterThan(0);
  });
  it('keeps a drift hop on the old launch area without a glider, figure or free landing boost',()=>{
    const race=new Race(new Course()),r=race.player;r.distance=race.course.flight[0]-2;r.speed=30;r.lane=0;
    race.update({...neutral(),throttle:1,drift:true,steer:.3},1/120);
    expect(r.hopTime).toBeGreaterThan(0);expect(r.drifting).toBe(true);expect(r.trickQueued).toBe(false);expect(r.trick).toBe(0);expect(r.flying).toBe(false);
    r.distance=race.course.flight[1]-.5;r.height=6;r.flying=true;r.vertical=-3;r.boost=0;r.charge=0;r.drifting=false;
    race.update({...neutral(),throttle:1},1/120);
    expect(r.height).toBe(0);expect(r.flying).toBe(false);expect(r.boost).toBe(0);
    expect(race.events.some(e=>e.type==='glider'||e.type==='landing')).toBe(false);
  });
});
describe('rocket start timing',()=>{
  it('rewards throttle near two, penalizes holding from three, and permits releasing to retry',()=>{
    const start=new RocketStart();start.update(1,3);start.update(1,1.7);expect(start.result().stall).toBeGreaterThan(0);
    start.update(0,1.8);start.update(1,1.7);expect(start.result().boost).toBeGreaterThan(1.3);expect(start.result().stall).toBe(0);
    start.reset();start.update(1,.2);expect(start.result().boost).toBe(0);
  });
});
