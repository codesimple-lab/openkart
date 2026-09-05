import { clamp } from './course';
import type { Racer, BoostKind } from './race';
import type { Controls } from '../network/protocol';

export const DRIFT_THRESHOLDS=[.4,1,1.7] as const;
export function driftStage(charge:number):0|1|2|3 {return charge>=1.7?3:charge>=1?2:charge>=.4?1:0;}
export function grantBoost(r:Racer,kind:BoostKind,duration:number) {
  if(duration>=r.boost){r.boostKind=kind;r.boost=duration;}
  // A short kick makes release immediately perceptible without bypassing shared top speeds.
  r.speed=Math.min(r.pilot.speed+r.coins*.25+11+(r.star?7:0),r.speed+3.2);
}
export function cancelDrift(r:Racer) {r.drifting=false;r.charge=0;r.driftStage=0;r.driftDirection=0;}

/** Commit the drift side at the hop. Countersteering widens it; only releasing
 * the drift button cashes in its charge. Steering through neutral cannot release a turbo. */
export function updateDrift(r:Racer,input:Controls,dt:number) {
  const pressed=input.drift&&!r.lastDrift;
  r.hopTime=Math.max(0,r.hopTime-dt);
  if(pressed&&!r.flying&&r.speed>8&&r.hit<.35)r.hopTime=.3;
  r.hop=Math.sin(r.hopTime/.3*Math.PI)*.36;
  const eligible=!r.flying&&r.speed>12&&r.hit<.35&&input.brake<.7;
  if(!eligible){cancelDrift(r);r.lastDrift=input.drift;return;}
  if(!r.drifting&&input.drift&&r.hopTime>.08&&Math.abs(input.steer)>.12){
    r.drifting=true;r.driftDirection=Math.sign(input.steer);r.charge=0;
  }
  if(r.drifting){
    if(!input.drift){
      const stage=driftStage(r.charge);
      if(stage)grantBoost(r,stage===3?'ultra':stage===2?'super':'mini',[0,.75,1.45,2.25][stage]);
      cancelDrift(r);
    }else{
      const inner=clamp(input.steer*r.driftDirection,0,1);
      r.charge=Math.min(2,r.charge+dt*(.6+inner*.35));r.driftStage=driftStage(r.charge);
    }
  }
  r.lastDrift=input.drift;
}
