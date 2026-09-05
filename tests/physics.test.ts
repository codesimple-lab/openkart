import {describe,it,expect} from 'vitest';
import {Course} from '../src/game/course';
import {Race,makeRacer,PILOTS} from '../src/game/race';
import {driveAI} from '../src/game/ai-driver';
import {driveVehicle,routeVelocity,steeringGain} from '../src/game/vehicle-physics';
import {kartContact,railContact} from '../src/game/contacts';
import {neutral} from '../src/network/protocol';
const course=new Course();
const flat={...course.at(0),curvature:0,tangent:course.at(0).tangent.clone().set(0,0,1)};
function seeded(seed:number){return()=>{seed=(1664525*seed+1013904223)>>>0;return seed/4294967296;};}
describe('shared driving physics',()=>{
  it('releasing the wheel preserves world heading instead of pulling the kart to the centerline',()=>{
    const r=makeRacer(PILOTS[0]);r.speed=26;r.yaw=.2;r.lane=0;
    for(let i=0;i<60;i++)driveVehicle(r,neutral(),flat,course,1/120);
    expect(r.yaw).toBeCloseTo(.2,4);expect(r.lane).toBeGreaterThan(2);
  });
  it('has the same top speed and boost for players and opponents',()=>{
    const racers=Array.from({length:6},(_,i)=>makeRacer(PILOTS[0],i));
    for(const r of racers){r.distance=0;r.coins=10;r.boost=10;}
    for(let i=0;i<120*20;i++)for(const r of racers)driveVehicle(r,{...neutral(),throttle:1},flat,course,1/120);
    expect(Math.max(...racers.map(r=>r.speed))-Math.min(...racers.map(r=>r.speed))).toBeLessThan(.001);
    expect(racers[0].speed).toBeGreaterThan(45);
  });
  it('does not remove an opponent’s active mushroom speed with a bot-only cap',()=>{
    const race=new Race(course);race.racers=race.racers.slice(0,2);
    const [player,bot]=race.racers;
    player.distance=10;bot.distance=45;
    for(const r of race.racers){r.pilot=PILOTS[0];r.speed=40;r.boost=2;r.coins=10;r.lane=0;}
    race.update({...neutral(),throttle:1},1/120);
    expect(bot.speed).toBeGreaterThan(39);expect(Math.abs(bot.speed-player.speed)).toBeLessThan(.1);
  });
  it('rolls down a slope and loses speed when climbing with the same throttle',()=>{
    const uphill=makeRacer(PILOTS[0]),downhill=makeRacer(PILOTS[0]);
    uphill.speed=downhill.speed=25;
    for(let i=0;i<120;i++){
      driveVehicle(uphill,neutral(),{...flat,tangent:flat.tangent.clone().set(0,.2,.98)},course,1/120);
      driveVehicle(downhill,neutral(),{...flat,tangent:flat.tangent.clone().set(0,-.2,.98)},course,1/120);
    }
    expect(downhill.speed-uphill.speed).toBeGreaterThan(3.5);
  });
  it('preserves forward momentum when parallel karts overlap and resolves penetration immediately',()=>{
    const a=makeRacer(PILOTS[0]),b=makeRacer(PILOTS[0]);a.distance=b.distance=100;a.lane=0;b.lane=1.7;a.speed=b.speed=30;
    kartContact(a,b,course);
    expect(Math.abs(a.lane-b.lane)).toBeGreaterThanOrEqual(2.92);expect(a.speed).toBeCloseTo(30,5);expect(b.speed).toBeCloseTo(30,5);expect(a.impact).toBe(0);
  });
  it('transfers momentum from a rear collision without slowing both karts',()=>{
    const a=makeRacer(PILOTS[0]),b=makeRacer(PILOTS[0]);a.distance=100;b.distance=103;a.lane=b.lane=0;a.speed=35;b.speed=20;
    kartContact(a,b,course);
    expect(a.speed).toBeLessThan(30);expect(b.speed).toBeGreaterThan(25);expect(a.speed+b.speed).toBeCloseTo(55,4);
  });
  it('keeps tangential speed on a rail graze but stops a head-on impact',()=>{
    const graze=makeRacer(PILOTS[0]),crash=makeRacer(PILOTS[0]);
    for(const r of [graze,crash]){r.distance=100;r.lane=9;r.speed=30;}
    graze.yaw=.06;crash.yaw=1.25;
    railContact(graze,course);railContact(crash,course);
    expect(routeVelocity(graze).forward).toBeGreaterThan(29);expect(crash.speed).toBeLessThan(12);expect(crash.impact).toBeGreaterThan(.8);
  });
  it('does not produce an automatic cruise win across a fixed three-race benchmark',()=>{
    // Collisions and item pickups can legitimately change one seeded result. This
    // sample guards against automatic wins; it does not claim universally fair balancing.
    let contested=0;
    for(const seed of [21,72,305]){
      const race=new Race(course,0,seeded(seed));
      for(let frame=0;frame<120*360&&race.racers.some(r=>r.finished===null);frame++){
        const r=race.player,input=driveAI(race,r,0);
        if(input.drift)input.steer=(input.steer*.45+Math.sign(course.at(r.distance).curvature)*.55)*steeringGain(r,true)/Math.max(.01,steeringGain(r,false));
        input.drift=false;input.item=false;
        race.update(input,1/120);
      }
      expect(race.racers.every(r=>r.finished!==null)).toBe(true);
      const ahead=race.racers.slice(1).filter(r=>r.finished!<race.player.finished!).length;
      if(ahead>0)contested++;
      console.info('steady-cruise seed '+seed,{player:race.player.finished,rivalsAhead:ahead});
    }
    expect(contested).toBeGreaterThanOrEqual(2);
  },20000);
  it.each([21,72,305])('finishes a competitive complete race with identical AI input rules, seed %s',(seed)=>{
    const race=new Race(course,0,seeded(seed));
    let ticks=0,impacts=0,peakLane=0;
    while(race.racers.some(r=>r.finished===null)&&ticks<120*360){
      const oldImpact=race.player.impact;
      race.update(driveAI(race,race.player,0),1/120);
      if(race.player.impact>oldImpact+.05)impacts++;
      if(!race.player.flying)peakLane=Math.max(peakLane,Math.abs(race.player.lane));
      ticks++;
    }
    console.info('race-balance seed '+seed,race.racers.map(r=>({pilot:r.pilot.id,time:r.finished,distance:r.distance.toFixed(0)})),{impacts,peakLane});
    expect(race.racers.every(r=>r.finished!==null)).toBe(true);
    const times=race.racers.map(r=>r.finished!);
    expect(Math.max(...times)-Math.min(...times)).toBeLessThan(24);
  });
});
