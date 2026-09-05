import type { Vector3 } from 'three';
import type { Shell } from './items';

const clamp=(v:number,a:number,b:number)=>Math.max(a,Math.min(b,v));

/** Sound-control values, not a claim that the arcade drivetrain simulates real RPM. */
export function motorMix(speed:number,throttle:number,boost:boolean,flying:boolean){
  const velocity=clamp(Math.abs(speed)/42,0,1.25),load=clamp(throttle,0,1);
  const rpm=1200+velocity*4100+load*900+(boost?500:0);
  return {
    rpm,
    idleRate:clamp(.64+rpm/6500,.65,1.85),
    loadRate:clamp(.42+rpm/6900,.5,1.5),
    idleGain:(.075+velocity*.035)*(1-load*.32)*(flying?.58:1),
    loadGain:(.018+velocity*.09+load*.08)*(flying?.68:1),
    cutoff:850+load*2700+velocity*900,
  };
}

/** Match Three's view: screen-right = forward × up = (-cos heading, 0, sin heading). */
export function spatialMix(listener:Pick<Vector3,'x'|'y'|'z'>,heading:number,source:Pick<Vector3,'x'|'y'|'z'>,range=75){
  const dx=source.x-listener.x,dy=source.y-listener.y,dz=source.z-listener.z;
  const distance=Math.hypot(dx,dy,dz);
  return {distance,pan:clamp((-dx*Math.cos(heading)+dz*Math.sin(heading))/Math.max(4,distance)*.9,-.9,.9),gain:distance>=range?0:1/(1+(distance/13)**2)*clamp((range-distance)/12,0,1)};
}

export function targetedRedThreat(shells:readonly Shell[],player:Pick<Vector3,'x'|'y'|'z'>,target=0){
  let distance=Infinity;
  for(const shell of shells){
    if(shell.kind!=='red-shell'||shell.target!==target||shell.life<=0)continue;
    distance=Math.min(distance,Math.hypot(shell.position.x-player.x,shell.position.y-player.y,shell.position.z-player.z));
  }
  return distance<55?{distance,interval:clamp(.13+distance*.01,.14,.68)}:null;
}

export const AUDIO_SAMPLES=['engine-idle','engine-load','tyres','waves','metal-1','metal-2','metal-3','chassis-1','chassis-2','chassis-3','shell-1','shell-2','shell-3','wood-1','wood-2','grass-1','grass-2','box','cloth'] as const;
export type SampleName=typeof AUDIO_SAMPLES[number];
