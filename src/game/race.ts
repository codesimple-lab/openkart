import { roadFrame } from './road-geometry';
import { Quaternion, Vector3 } from 'three';
import { Course, clamp, wrap } from './course';
import { ItemBoxes, PickupField } from './items';
import { type Item } from './item-types';
export type { Item } from './item-types';
import { type Controls } from '../network/protocol';
import { driveVehicle } from './vehicle-physics';
import { driveAI } from './ai-driver';
import { kartContact, kartOverlap, railContact } from './contacts';
import { updateDrift, cancelDrift, grantBoost } from './arcade-handling';
import { activateItem, captureCombatFrame, updateCombat, isDefensiveItem } from './combat';
export const PILOTS = [
  {id:'mario',name:'Mario',role:'Équilibre',color:'#ef3434',trim:'#2764ce',skin:'#f6bc8a',speed:35,acceleration:17,grip:1,mark:'M',look:'mario'},
  {id:'luigi',name:'Luigi',role:'Précision',color:'#27bd55',trim:'#2857bc',skin:'#f6bc8a',speed:33,acceleration:19,grip:1.17,mark:'L',look:'luigi'},
  {id:'peach',name:'Peach',role:'Puissance',color:'#ff80b3',trim:'#fbd843',skin:'#ffceb0',speed:38,acceleration:14,grip:.86,mark:'P',look:'peach'},
  {id:'yoshi',name:'Yoshi',role:'Accélération',color:'#73d63d',trim:'#ff8239',skin:'#73d63d',speed:34,acceleration:21,grip:1.07,mark:'Y',look:'yoshi'},
] as const;
export type Pilot = typeof PILOTS[number];
export type BoostKind='none'|'mini'|'super'|'ultra'|'item'|'pad'|'trick';
export interface RaceEvent {type:'pickup'|'ready'|'use'|'coin'|'hit'|'shell-launch'|'shell-bounce'|'shell-break'|'banana-drop'|'protected'|'rail'|'landing'|'glider'|'lap';racer:number;position?:Vector3;strength?:number;item?:Item;box?:number;}
export interface Racer {
  pilot:Pilot;distance:number;lane:number;speed:number;yaw:number;steer:number;height:number;vertical:number;
  hitKind:'spin'|'tumble'|'bump'|null;heldItem:Item|null;throwTime:number;throwBackward:boolean;throwAnimation:number;
  lateralSpeed:number;headingRate:number;driftDirection:number;impact:number;
  startStall:number;hop:number;hopTime:number;lastDrift:boolean;driftStage:0|1|2|3;trick:number;trickQueued:boolean;boostKind:BoostKind;
  flying:boolean;boost:number;charge:number;drifting:boolean;item:Item|null;reserveItem:Item|null;coins:number;star:number;shield:number;hit:number;
  padCooldown:number;roulette:number;pendingItem:Item|null;finished:number|null;lastItem:boolean;lastReset:boolean;
}
export function makeRacer(pilot:Pilot,index=0):Racer {
  return {pilot,hitKind:null,heldItem:null,throwTime:0,throwBackward:false,throwAnimation:0,distance:-5-Math.floor(index/2)*5,lane:index%2===0?-2.8:2.8,speed:0,yaw:0,steer:0,height:0,vertical:0,lateralSpeed:0,headingRate:0,driftDirection:0,impact:0,startStall:0,hop:0,hopTime:0,lastDrift:false,driftStage:0,trick:0,trickQueued:false,boostKind:'none',flying:false,boost:0,charge:0,drifting:false,item:null,reserveItem:null,coins:0,star:0,shield:0,hit:0,padCooldown:0,roulette:0,pendingItem:null,finished:null,lastItem:false,lastReset:false};
}
export class Race {
  readonly laps=3;
  readonly itemBoxes:ItemBoxes;
  readonly pickups:PickupField;
  events:RaceEvent[]=[];
  racers:Racer[]=[];
  elapsed=0;
  lapTimes:number[]=[];
  message='';
  messageTime=0;
  private previousLap=0;
  private lastSplit=0;
  constructor(readonly course:Course,pilot=0,private readonly random:()=>number=Math.random) { this.itemBoxes=new ItemBoxes(course);this.pickups=new PickupField(course);this.reset(pilot); }
  get player() {return this.racers[0];}
  reset(pilot:number) {
    this.racers=Array.from({length:6},(_,i)=>makeRacer(PILOTS[i===0?pilot:(pilot+i)%4],i));
    this.itemBoxes.reset();this.pickups.reset();this.events=[];
    this.elapsed=0;this.lapTimes=[];this.previousLap=0;this.lastSplit=0;this.message='';this.messageTime=0;
  }
  announce(text:string,seconds=1.8) {this.message=text;this.messageTime=seconds;}
  get standings() {
    return [...this.racers].sort((a,b)=>{
      if(a.finished!==null&&b.finished!==null)return a.finished-b.finished;
      if(a.finished!==null)return -1;
      if(b.finished!==null)return 1;
      return b.distance-a.distance;
    });
  }
  get position() {return this.standings.indexOf(this.player)+1;}
  get lap() {return clamp(Math.floor(Math.max(0,this.player.distance)/this.course.length)+1,1,this.laps);}
  cancelItemGesture(r=this.player){r.heldItem=null;r.throwTime=0;r.throwBackward=false;r.lastItem=false;}
  recover(r=this.player) { r.height=0;r.vertical=0;r.flying=false;r.trick=0;r.trickQueued=false;r.lane=0;r.yaw=0;r.speed=12;r.hit=.5;r.charge=0;r.lateralSpeed=0;r.headingRate=0;r.hop=0;r.hopTime=0;cancelDrift(r); }
  update(input:Controls,dt:number) {
    // Every racing surface is drivable ground; hops are a separate presentation gesture.
    for(const r of this.racers){r.height=0;r.vertical=0;r.flying=false;r.trick=0;r.trickQueued=false;}
    const previousPositions=captureCombatFrame(this);
    this.itemBoxes.update(dt);this.pickups.update(dt);
    this.elapsed+=dt;this.messageTime=Math.max(0,this.messageTime-dt);
    if(!this.messageTime)this.message='';
    this.step(this.player,input,dt,0);
    this.racers.slice(1).forEach((r,i)=>this.step(r,driveAI(this,r,i+1),dt,i+1));
    for(let pass=0;pass<2;pass++)for(let a=0;a<this.racers.length;a++)for(let b=a+1;b<this.racers.length;b++) {
      const x=this.racers[a],y=this.racers[b];
      if(kartOverlap(x,y,this.course)){if(x.star&&!y.star)this.hitRacer(b,'star');else if(y.star&&!x.star)this.hitRacer(a,'star');}
      const force=kartContact(x,y,this.course);
      if(force>4){this.events.push({type:'hit',racer:a,position:this.course.position(x.distance,x.lane,x.height+1),strength:clamp(force/15,0,1)});}
    }
    this.racers.forEach(r=>railContact(r,this.course));
    updateCombat(this,dt,(index,item)=>this.hitRacer(index,item),previousPositions);
    for(const r of this.racers)if(r.finished===null&&r.distance>=this.course.length*this.laps){r.finished=this.elapsed;r.speed=0;}
    const completed=Math.floor(Math.max(0,this.player.distance)/this.course.length);
    if(completed>this.previousLap) {
      this.events.push({type:'lap',racer:0,position:this.course.position(this.player.distance,this.player.lane,this.player.height)});
      this.lapTimes.push(this.elapsed-this.lastSplit);this.lastSplit=this.elapsed;this.previousLap=completed;
      if(completed<this.laps)this.announce(completed===2?'DERNIER TOUR':'TOUR 2 / 3',2.4);
    }
  }
  private hitRacer(index:number,item?:Item){
    const r=this.racers[index];if(r.shield>0||r.star>0||r.hit>.35)return;
    const kind=item==='banana'?'spin':item==='pulse'?'bump':'tumble';
    const lost=Math.min(3,r.coins);r.speed*=kind==='spin'?.42:kind==='bump'?.5:.27;
    r.hit=kind==='spin'?1.25:kind==='bump'?.8:1.55;r.hitKind=kind;r.coins-=lost;cancelDrift(r);r.impact=kind==='bump'?.65:1;
    r.boost=0;r.boostKind='none';r.lateralSpeed*=.3;r.headingRate*=.2;
    if(r.heldItem){r.item=r.reserveItem;r.reserveItem=null;r.heldItem=null;}r.throwTime=0;
    this.events.push({type:'hit',racer:index,item,position:this.course.position(r.distance,r.lane,r.height+1),strength:r.impact});
  }
  private useItem(r:Racer,index:number,backward=false){
    if(!r.item)return;
    const item=r.item;activateItem(this,index,item,(target,kind)=>this.hitRacer(target,kind),backward);
    if(item==='turbo')grantBoost(r,'item',r.boost);
    this.events.push({type:'use',racer:index,item,position:this.course.position(r.distance,r.lane,r.height+1)});
    r.item=r.reserveItem;r.reserveItem=null;r.heldItem=null;r.throwTime=0;r.throwAnimation=.36;
  }
  private step(r:Racer,input:Controls,dt:number,index:number) {
    if(r.finished!==null)return;
    const road=this.course.at(r.distance),local=wrap(r.distance,this.course.length);
    r.star=Math.max(0,r.star-dt);r.boost=Math.max(0,r.boost-dt);r.shield=Math.max(0,r.shield-dt);r.hit=Math.max(0,r.hit-dt);if(!r.hit)r.hitKind=null;r.throwAnimation=Math.max(0,r.throwAnimation-dt);
    r.padCooldown=Math.max(0,r.padCooldown-dt);r.impact=Math.max(0,r.impact-dt*4);r.trick=Math.max(0,r.trick-dt);r.startStall=Math.max(0,r.startStall-dt);if(!r.boost)r.boostKind='none';
    if(r.pendingItem) {
      r.roulette=Math.max(0,r.roulette-dt);
      if(!r.roulette){const item=r.pendingItem;if(!r.item)r.item=item;else r.reserveItem=item;r.pendingItem=null;this.events.push({type:'ready',racer:index,item});}
    }
    if(input.reset&&!r.lastReset)this.recover(r);r.lastReset=input.reset;
    const previousPosition=this.course.position(r.distance,r.lane,r.height+1.15);
    updateDrift(r,input,dt);
    const stunned=r.hit>.35&&(r.hitKind==='spin'||r.hitKind==='tumble');
    const driving=stunned?{...input,throttle:input.throttle*(r.hitKind==='tumble'?0:.25),steer:input.steer*.25,drift:false}:input;
    driveVehicle(r,driving,road,this.course,dt);
    const railImpact=railContact(r,this.course);
    if(railImpact>4){this.events.push({type:'rail',racer:index,position:this.course.position(r.distance,r.lane,r.height),strength:Math.min(1,railImpact/18)});}
    if(this.course.boosts.some(s=>Math.abs(local-s)<3)&&Math.abs(r.lane)<4&&!r.padCooldown) {
      grantBoost(r,'pad',1.3);r.padCooldown=2;
    }
    const branchPad=this.course.routeBoosts.find(pad=>Math.abs(local-pad.distance)<3&&Math.abs(r.lane-pad.lane)<pad.width/2);
    if(branchPad&&!r.padCooldown){grantBoost(r,'pad',branchPad.duration);r.padCooldown=.8;}
    if(input.item){
      if(!r.lastItem&&r.item){
        r.throwBackward=Boolean(input.itemBackward);r.throwTime=isDefensiveItem(r.item)?dt:0;
        if(!isDefensiveItem(r.item))this.useItem(r,index,r.throwBackward);
      }else if(r.throwTime>0){r.throwTime+=dt;r.throwBackward=Boolean(input.itemBackward);}
      if(r.throwTime>=.18&&r.item&&isDefensiveItem(r.item))r.heldItem=r.item;
    }else if(r.lastItem&&r.throwTime>0)this.useItem(r,index,r.throwBackward);
    r.lastItem=input.item;
    const currentPosition=this.course.position(r.distance,r.lane,r.height+1.15);
    const coins=this.pickups.collectCoins(previousPosition,currentPosition);
    if(coins){r.coins=Math.min(10,r.coins+coins);this.events.push({type:'coin',racer:index});}
    if(!r.reserveItem&&!r.pendingItem) {
      const box=this.itemBoxes.collect(previousPosition,currentPosition,roadFrame(this.course,r.distance,r.lane).quaternion.multiply(new Quaternion().setFromAxisAngle(new Vector3(0,1,0),-r.yaw)));
      if(box) {
        const rank=1+this.racers.filter(other=>other.distance>r.distance).length;
        const roll=this.random();
        const pool:Item[]=rank>=4?['turbo','turbo','red-shell','red-shell','star','pulse']:rank>=2?['turbo','banana','green-shell','red-shell','red-shell','star']:['turbo','banana','banana','green-shell','green-shell','pulse'];
        r.pendingItem=pool[Math.min(pool.length-1,Math.max(0,Math.floor(roll*pool.length)))];r.roulette=.7;
        this.events.push({type:'pickup',racer:index,box:box.id});
      }
    }

  }
}
