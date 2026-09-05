import { describe, expect, it } from 'vitest';
import { PerspectiveCamera, Vector3 } from 'three';
import { readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { AUDIO_SAMPLES, motorMix, spatialMix, targetedRedThreat } from '../src/game/audio-model';
import { Course } from '../src/game/course';
import { PickupField } from '../src/game/items';

describe('recorded driving audio and warning control',()=>{
  it('responds to throttle load even when velocity is unchanged',()=>{
    const coast=motorMix(25,0,false,false),loaded=motorMix(25,1,false,false);
    expect(loaded.rpm).toBeGreaterThan(coast.rpm);expect(loaded.loadGain).toBeGreaterThan(coast.loadGain);expect(loaded.cutoff).toBeGreaterThan(coast.cutoff);
  });
  it('keeps finite playback rates through reversing, boosts, flight and a standstill',()=>{
    for(const speed of [-12,0,10,35,60])for(const throttle of [0,.5,1])for(const flying of [true,false]){
      const mix=motorMix(speed,throttle,true,flying);
      Object.values(mix).forEach(value=>expect(Number.isFinite(value)).toBe(true));
      expect(mix.loadRate).toBeGreaterThanOrEqual(.5);expect(mix.loadRate).toBeLessThanOrEqual(1.5);
      expect(mix.idleGain).toBeGreaterThanOrEqual(0);
    }
    expect(motorMix(30,1,false,true).loadGain).toBeLessThan(motorMix(30,1,false,false).loadGain);
  });
  it('puts sources on the correct side after turning and attenuates by actual 3D distance',()=>{
    const zero=new Vector3();
    expect(spatialMix(zero,0,new Vector3(8,0,0)).pan).toBeLessThan(0);
    expect(spatialMix(zero,0,new Vector3(-8,0,0)).pan).toBeGreaterThan(0);
    expect(spatialMix(zero,Math.PI,new Vector3(8,0,0)).pan).toBeGreaterThan(0);
    expect(spatialMix(zero,0,new Vector3(0,80,0)).gain).toBe(0);
    expect(spatialMix(zero,0,new Vector3(0,0,35)).gain).toBeLessThan(spatialMix(zero,0,new Vector3(0,0,8)).gain);
  });
  it('matches the actual PerspectiveCamera screen side in all heading quadrants',()=>{
    const listener=new Vector3(3,2,7);
    for(const heading of [0,Math.PI/2,Math.PI,-Math.PI/2,.73]){
      const forward=new Vector3(Math.sin(heading),0,Math.cos(heading));
      const camera=new PerspectiveCamera(60,1.6,.1,1000);camera.position.copy(listener);camera.lookAt(listener.clone().add(forward));camera.updateMatrixWorld(true);
      for(const lateral of [-5,5]){
        const source=listener.clone().addScaledVector(forward,20).addScaledVector(new Vector3(-forward.z,0,forward.x),lateral);
        const ndc=source.clone().project(camera),mix=spatialMix(listener,heading,source);
        expect(Math.sign(mix.pan)).toBe(Math.sign(ndc.x));
        expect(Math.sign(mix.pan)).toBe(Math.sign(lateral));
      }
    }
  });
  it('places the actual course positive lane on the screen and stereo right',()=>{
    const course=new Course();
    for(const distance of [100,350,900,1300,1800]){
      const center=course.position(distance,0,1),listener=course.position(distance-12,0,1),forward=center.clone().sub(listener);
      const camera=new PerspectiveCamera(60,1.6,.1,1000);camera.position.copy(listener);camera.lookAt(center);camera.updateMatrixWorld(true);
      const source=course.position(distance,5,1),ndc=source.clone().project(camera);
      const mix=spatialMix(listener,Math.atan2(forward.x,forward.z),source);
      expect(ndc.x).toBeGreaterThan(0);expect(mix.pan).toBeGreaterThan(0);
    }
  });
  it('warns only about living red shells targeting this player, including from behind',()=>{
    const field=new PickupField(new Course()),position=new Vector3();
    const shell=field.shoot('red-shell',1,0,0,0,0,2);shell.position.set(0,0,-15);
    expect(targetedRedThreat(field.shells,position)).toBeNull();
    shell.target=0;expect(targetedRedThreat(field.shells,position)?.distance).toBe(15);
    const far=targetedRedThreat(field.shells,position)!.interval;shell.position.z=-4;
    expect(targetedRedThreat(field.shells,position)!.interval).toBeLessThan(far);
    shell.kind='green-shell';expect(targetedRedThreat(field.shells,position)).toBeNull();
    shell.kind='red-shell';shell.life=0;expect(targetedRedThreat(field.shells,position)).toBeNull();
  });
  it('ships each referenced sample intact with attribution and valid PCM data',()=>{
    const manifest=JSON.parse(readFileSync(new URL('../public/audio/manifest.json',import.meta.url),'utf8')) as {file:string;sha256:string;seconds:number}[];
    for(const name of AUDIO_SAMPLES){
      const path=new URL('../public/audio/'+name+'.wav',import.meta.url);expect(existsSync(path)).toBe(true);
      const data=readFileSync(path),entry=manifest.find(sample=>sample.file===name+'.wav');
      expect(data.subarray(0,4).toString()).toBe('RIFF');expect(data.subarray(8,12).toString()).toBe('WAVE');
      expect(entry?.seconds).toBeGreaterThan(.05);expect(entry?.sha256).toBe(createHash('sha256').update(data).digest('hex'));
    }
    const credits=readFileSync(new URL('../public/audio/CREDITS.txt',import.meta.url),'utf8');
    expect(credits).toContain('Tom Haigh');expect(credits).toContain('qubodup');expect(credits).toContain('https://creativecommons.org/licenses/by/3.0/');
  });
});
