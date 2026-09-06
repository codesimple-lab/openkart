import {describe,it,expect} from 'vitest';
import {GyroSteering,screenRoll,angleDelta} from '../src/controller/gyro';
const warm=(g:GyroSteering,beta=60,gamma=0,orientation=0)=>{for(let t=1000;t<=1400;t+=20)g.update(beta,gamma,orientation,t);};
describe('phone steering wheel',()=>{
  it('uses the screen axes in portrait and both landscapes',()=>{
    expect(screenRoll(60,15,0)).toBeGreaterThan(0);
    expect(screenRoll(15,60,90)).toBeLessThan(0);
    expect(screenRoll(-15,60,90)).toBeGreaterThan(0);
    expect(screenRoll(15,-60,270)).toBeGreaterThan(0);
    expect(screenRoll(15,-60,-90)).toBeCloseTo(screenRoll(15,-60,270)!);
  });
  it('rejects missing data and a flat phone without poisoning the filter',()=>{
    expect(screenRoll(null,1,0)).toBeNull();expect(screenRoll(NaN,0,0)).toBeNull();expect(screenRoll(0,0,0)).toBeNull();
    const g=new GyroSteering();warm(g);g.update(NaN,0,0,1420);expect(g.read(1420)).toBe(0);
  });
  it('calibrates only while steady and removes hand tremor around neutral',()=>{
    const g=new GyroSteering();
    for(let t=1000;t<1800;t+=20)g.update(60,t%40?30:-30,0,t);
    expect(g.ready).toBe(false);g.reset();warm(g);expect(g.ready).toBe(true);
    for(let t=1420;t<1800;t+=20){g.update(60,t%40?1:-1,0,t);expect(g.read(t)).toBe(0);}
  });
  it('smooths steps quickly, supports sensitivity and inversion, and neutralizes stale data',()=>{
    const g=new GyroSteering();warm(g);g.update(60,60,0,1420);
    expect(g.read(1420)).toBeGreaterThan(0);expect(g.read(1420)).toBeLessThan(.4);
    for(let t=1440;t<=1800;t+=20)g.update(60,60,0,t);
    expect(g.read(1800)).toBeGreaterThan(.9);expect(g.read(2500)).toBe(0);expect(g.active(2500)).toBe(false);
    g.inverted=true;for(let t=1820;t<=2200;t+=20)g.update(60,60,0,t);expect(g.read(2200)).toBeLessThan(-.9);
    g.inverted=false;g.reset();warm(g);g.sensitivity=16;for(let t=1420;t<1800;t+=20)g.update(60,40,0,t);const fast=g.read(1800);
    g.reset();warm(g);g.sensitivity=34;for(let t=1420;t<1800;t+=20)g.update(60,40,0,t);expect(g.read(1800)).toBeLessThan(fast);
  });
  it('recalibrates after screen rotation and event interruption without a steering spike',()=>{
    const g=new GyroSteering();warm(g);g.update(0,60,90,1450);expect(g.ready).toBe(false);expect(g.read(1450)).toBe(0);
    warm(g,0,60,90);g.update(10,60,90,3000);expect(g.ready).toBe(false);expect(g.read(3000)).toBe(0);
    expect(angleDelta(-179,179)).toBe(2);expect(angleDelta(179,-179)).toBe(-2);
  });
});
