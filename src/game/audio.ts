import type { Controls } from '../network/protocol';
import type { Racer, Race, RaceEvent } from './race';
import { AUDIO_SAMPLES, motorMix, spatialMix, targetedRedThreat, type SampleName } from './audio-model';

interface Loop { source:AudioBufferSourceNode; gain:GainNode; filter:BiquadFilterNode; pan:StereoPannerNode; }
type Bus='engine'|'effects'|'ambience'|'music'|'ui';
export type AudioChannel='master'|'engine'|'effects'|'ambience'|'music';
const clamp=(v:number,a:number,b:number)=>Math.max(a,Math.min(b,v));
const note=(midi:number)=>440*2**((midi-69)/12);

/** Recorded engine/tyres/foley with original procedural cues. See CREDITS_AUDIO.md. */
export class AudioEngine {
  private context:AudioContext|null=null;
  private master:GainNode|null=null;
  private buses={} as Record<Bus,GainNode>;
  private wet:GainNode|null=null;
  private samples=new Map<SampleName,AudioBuffer>();
  private loops=new Map<string,Loop>();
  private noise:AudioBuffer|null=null;
  private loading:Promise<void>|null=null;
  private previousStage=0;
  private previousHop=0;
  private previousTrick=0;
  private previousBoost=0;
  private lastImpact=-1;
  private nextWarning=0;
  private nextRoulette=0;
  private nextStar=0;
  private nextGrass=0;
  private nextCurb=0;
  private nextBeat=0;
  private beat=0;
  private starBeat=0;
  private railHold=0;
  private serial=0;
  private voiceCount=0;
  private duckUntil=0;
  private active=false;
  private lastBotDistances:number[]=[];
  private _muted=false;
  private levels:Record<AudioChannel,number>={master:.8,engine:.9,effects:.82,ambience:.52,music:.32};
  readonly failedAssets:string[]=[];
  get muted(){return this._muted;}
  set muted(value:boolean){this._muted=value;this.applyMaster();}
  get unlocked(){return this.context?.state==='running';}
  get ready(){return this.samples.size===AUDIO_SAMPLES.length;}
  get sampleCount(){return this.samples.size;}
  get state(){return this.context?.state??'locked';}
  get volumes(){return {...this.levels};}
  setVolume(channel:AudioChannel,value:number){this.levels[channel]=clamp(Number.isFinite(value)?value:0,0,1);this.applyMaster();}

  /** Must be called from a desktop click/key gesture; network START alone may be blocked. */
  start(){
    try {
      if(!this.context){this.context=new AudioContext();this.buildGraph();}
      void this.context.resume().catch(()=>{/* UI reads unlocked and offers a local gesture. */});
      this.loading??=this.loadSamples();
    }catch{/* Audio unavailable must not interrupt racing. */}
  }
  private buildGraph(){
    const c=this.context!;
    this.master=c.createGain();
    const limiter=c.createDynamicsCompressor();limiter.threshold.value=-5;limiter.knee.value=3;limiter.ratio.value=20;limiter.attack.value=.003;limiter.release.value=.13;
    this.master.connect(limiter).connect(c.destination);
    for(const key of ['engine','effects','ambience','music','ui'] as const){const bus=c.createGain();bus.connect(this.master);this.buses[key]=bus;}
    const convolution=c.createConvolver(),impulse=c.createBuffer(2,c.sampleRate*1.05,c.sampleRate);
    for(let channel=0;channel<2;channel++){const out=new Float32Array(impulse.length);for(let i=0;i<out.length;i++)out[i]=(Math.random()*2-1)*Math.exp(-i/c.sampleRate*6)*.2;impulse.copyToChannel(out,channel);}
    convolution.buffer=impulse;this.wet=c.createGain();this.wet.gain.value=0;
    for(const key of ['engine','effects','ambience'] as const)this.buses[key].connect(convolution);
    convolution.connect(this.wet).connect(this.master);
    this.noise=c.createBuffer(1,c.sampleRate*3.7,c.sampleRate);const data=new Float32Array(this.noise.length);
    for(let i=0;i<data.length;i++)data[i]=(Math.random()*2-1)*.55;this.noise.copyToChannel(data,0);
    this.loop('wind',this.noise,'ambience','lowpass',650);
    this.loop('road',this.noise,'effects','lowpass',230);
    this.loop('scrape',this.noise,'effects','bandpass',2700);
    for(let i=0;i<3;i++)this.loop('projectile-'+i,this.noise,'effects','bandpass',1000+i*160);
    this.applyMaster();
  }
  private async loadSamples(){
    const c=this.context!;
    await Promise.all(AUDIO_SAMPLES.map(async name=>{
      try {
        const response=await fetch(`${import.meta.env.BASE_URL}audio/${name}.wav`);
        if(!response.ok)throw new Error(String(response.status));
        this.samples.set(name,await c.decodeAudioData(await response.arrayBuffer()));
      }catch{this.failedAssets.push(name);}
    }));
    const idle=this.samples.get('engine-idle'),load=this.samples.get('engine-load');
    if(idle)this.loop('idle',idle,'engine','lowpass',1400);
    if(load){this.loop('load',load,'engine','lowpass',2400);for(let i=1;i<6;i++)this.loop('rival-'+i,load,'engine','lowpass',1900);}
    const tyres=this.samples.get('tyres');if(tyres)this.loop('tyres',tyres,'effects','lowpass',4200);
    const waves=this.samples.get('waves');if(waves)this.loop('sea',waves,'ambience','lowpass',3400);
  }
  private applyMaster(){
    if(!this.context||!this.master)return;
    this.target(this.master.gain,this._muted?0:this.levels.master,.02);
    for(const key of ['engine','effects','ambience','music','ui'] as const){
      if(this.buses[key])this.target(this.buses[key].gain,key==='ui'?.88:this.levels[key],.03);
    }
  }
  private target(parameter:AudioParam,value:number,lag=.065){parameter.setTargetAtTime(value,this.context!.currentTime,lag);}
  private loop(id:string,buffer:AudioBuffer,bus:Bus,type:BiquadFilterType,frequency:number){
    const c=this.context!,source=c.createBufferSource(),gain=c.createGain(),filter=c.createBiquadFilter(),pan=c.createStereoPanner();
    source.buffer=buffer;source.loop=true;gain.gain.value=0;filter.type=type;filter.frequency.value=frequency;filter.Q.value=.7;
    source.connect(filter).connect(gain).connect(pan).connect(this.buses[bus]);source.start(0,Math.random()*buffer.duration);
    this.loops.set(id,{source,gain,filter,pan});
  }
  private driveLoop(id:string,gain:number,rate=1,pan=0,cutoff?:number){
    const loop=this.loops.get(id);if(!loop)return;
    this.target(loop.gain.gain,gain);this.target(loop.source.playbackRate,clamp(rate,.2,3),.09);this.target(loop.pan.pan,clamp(pan,-1,1));
    if(cutoff!==undefined)this.target(loop.filter.frequency,cutoff);
  }
  /** Legacy call remains supported. scene() supplies load, surfaces and spatial context. */
  update(speed:number,active:boolean,flight:boolean,drifting=false,slip=0,boost=false){
    if(!this.context)return;
    this.active=active;
    if(!active){
      for(const loop of this.loops.values())this.target(loop.gain.gain,0,.04);
      this.target(this.buses.music.gain,0,.035);if(this.wet)this.target(this.wet.gain,0,.05);this.nextBeat=0;return;
    }
    const mix=motorMix(speed,.45,boost,flight);
    this.driveLoop('idle',mix.idleGain,mix.idleRate);this.driveLoop('load',mix.loadGain,mix.loadRate,0,mix.cutoff);
    this.driveLoop('tyres',flight?0:clamp((drifting?.03:0)+Math.abs(slip)*.022,0,.19)*clamp(Math.abs(speed)/8,0,1),.88+Math.abs(speed)*.007);
    this.driveLoop('wind',(flight?.055:boost?.075:.012)*clamp(Math.abs(speed)/25,0,1));
  }
  scene(race:Race,dt:number,controls:Controls){
    if(!this.context)return;
    const c=this.context,r=race.player,t=c.currentTime;
    this.update(r.speed,true,r.flying,r.drifting,r.lateralSpeed,r.boost>0);
    const mix=motorMix(r.speed,controls.throttle,r.boost>0,r.flying);
    this.driveLoop('idle',mix.idleGain,mix.idleRate);this.driveLoop('load',mix.loadGain,mix.loadRate,0,mix.cutoff);
    const road=race.course.at(r.distance),position=race.course.position(r.distance,r.lane,r.height+1),heading=road.heading-r.yaw;
    const ground=!r.flying&&r.height<.15,speed=clamp(Math.abs(r.speed)/35,0,1.4),surface=race.course.surface(r.distance,r.lane),offroad=surface==='grass';
    this.driveLoop('road',ground?speed*(offroad?.075:.018):0,1,0,offroad?850:190+speed*160);
    this.railHold=Math.max(0,this.railHold-dt);this.driveLoop('scrape',ground&&this.railHold>0?.07*speed:0,1,clamp(r.lane/8,-1,1));
    if(ground&&offroad&&speed>.12&&t>this.nextGrass){this.sample(this.variant('grass',2),.14*speed,.8+speed*.2,clamp(r.lane/10,-.7,.7));this.nextGrass=t+.14;}
    if(ground&&surface==='curb'&&speed>.2&&t>this.nextCurb){this.sample(this.variant('wood',2),.11*speed,.9+speed*.4,clamp(r.lane/10,-.7,.7));this.nextCurb=t+clamp(1.6/Math.max(1,r.speed),.055,.25);}
    const local=((r.distance%race.course.length)+race.course.length)%race.course.length;
    const tunnel=local>race.course.tunnel[0]&&local<race.course.tunnel[1];
    if(this.wet)this.target(this.wet.gain,tunnel?.3:0,.28);
    const coast=local/race.course.length<.14||local/race.course.length>.68;
    this.driveLoop('sea',coast&&!tunnel?.16*(.78+Math.sin(t*.43)*.18):0,1,-.5);
    for(let i=1;i<race.racers.length;i++){
      const rival=race.racers[i],spatial=spatialMix(position,heading,race.course.position(rival.distance,rival.lane,rival.height+1));
      const radial=this.lastBotDistances[i]===undefined?0:clamp((spatial.distance-this.lastBotDistances[i])/Math.max(.008,dt),-45,45);this.lastBotDistances[i]=spatial.distance;
      const rivalMix=motorMix(rival.speed,.8,rival.boost>0,rival.flying);
      this.driveLoop('rival-'+i,.11*spatial.gain,rivalMix.loadRate*343/(343+radial)*(1+(i%3-1)*.045),spatial.pan,1200+spatial.gain*1800);
    }
    const shells=race.pickups.shells.map(shell=>({shell,mix:spatialMix(position,heading,shell.position,55)})).sort((a,b)=>a.mix.distance-b.mix.distance).slice(0,3);
    for(let i=0;i<3;i++){
      const near=shells[i];this.driveLoop('projectile-'+i,near?.mix.gain?near.mix.gain*.042:0,1,near?.mix.pan??0,near?.shell.kind==='red-shell'?1900:1150);
    }
    const threat=targetedRedThreat(race.pickups.shells,position);
    if(threat&&t>=this.nextWarning){
      this.tone(1250,1550,.075,0,.09,'square','ui');this.tone(950,1200,.055,.08,.055,'square','ui');this.nextWarning=t+threat.interval;this.duckUntil=t+.24;
    }else if(!threat)this.nextWarning=0;
    if(r.roulette>0&&t>=this.nextRoulette){this.tone(500+(this.serial++%5)*150,780,.045,0,.06,'triangle','ui');this.nextRoulette=t+.065;}
    if(r.star>0&&t>=this.nextStar){const melody=[72,76,79,84,79,76,74,81];this.tone(note(melody[this.starBeat++%8]),note(melody[(this.starBeat-1)%8]),.16,0,.04,'triangle','ui');this.nextStar=t+.16;}
    const duck=t<this.duckUntil?.33:1;
    this.target(this.buses.engine.gain,this.levels.engine*(t<this.duckUntil?.76:1),.04);
    this.target(this.buses.music.gain,this.levels.music*duck*(r.star>0?.2:1),.06);
    this.music(race.lap===race.laps);
  }
  event(event:RaceEvent,race:Race){
    if(!this.context||this.muted)return;
    const r=race.racers[event.racer]??race.player,player=race.player;
    const at=event.position??race.course.position(r.distance,r.lane,r.height+1);
    const spatial=spatialMix(race.course.position(player.distance,player.lane,player.height+1),race.course.at(player.distance).heading-player.yaw,at);
    const direct=event.racer===0&&spatial.distance<4;
    const gain=direct?1:spatial.gain,pan=direct?0:spatial.pan;
    const strength=clamp(event.strength??.7,.08,1);
    if(gain<.015)return;
    switch(event.type){
      case 'coin': if(event.racer===0){this.tone(1760,1760,.12,0,.055,'sine','ui');this.tone(2349,2349,.16,.035,.033,'sine','ui');}break;
      case 'pickup':this.sample('box',.35*gain,1.35,pan);if(event.racer===0)this.nextRoulette=0;break;
      case 'ready':if(event.racer===0)[784,988,1319].forEach((f,i)=>this.tone(f,f,.17,i*.045,.06,'triangle','ui'));break;
      case 'use':
        if(event.item==='pulse'){[185,233,277].forEach(f=>this.tone(f,f*.96,.52,0,.1*gain,'sawtooth','effects',pan));this.burst(.35,.19*gain,350,950,pan);}
        else if(event.item==='turbo')this.burst(.45,.2*gain,400,2800,pan);
        else if(event.item==='star'){[523,659,784,1047].forEach((f,i)=>this.tone(f,f,.24,i*.05,.075*gain,'triangle','effects',pan));}
        else if(event.item==='shield')this.tone(420,1260,.4,0,.06*gain,'sine','effects',pan);
        break;
      case 'shell-launch':this.burst(.2,.17*gain,500,event.item==='red-shell'?2300:1700,pan);this.sample('cloth',.25*gain,1.7,pan);break;
      case 'shell-bounce':this.sample(this.variant('shell',3),.4*gain,1.3,pan);break;
      case 'shell-break':this.sample('box',.55*gain,.8,pan);this.sample(this.variant('shell',3),.32*gain,.78,pan);break;
      case 'banana-drop':this.sample('cloth',.4*gain,1.2,pan);this.tone(280,160,.1,0,.035*gain,'sine','effects',pan);break;
      case 'protected':this.tone(950,420,.23,0,.07*gain,'sine','effects',pan);this.sample(this.variant('shell',3),.2*gain,1.8,pan);break;
      case 'hit':this.sample(this.variant('chassis',3),.7*gain,.8,pan);this.burst(.15,.13*gain,160,480,pan);if(event.racer===0){this.lastImpact=this.context.currentTime;this.duckUntil=this.context.currentTime+.35;}break;
      case 'rail':this.sample(this.variant('metal',3),(.18+strength*.65)*gain,.75+strength*.25,pan);if(event.racer===0){this.railHold=.22;this.lastImpact=this.context.currentTime;}break;
      case 'landing':this.sample(this.variant('chassis',3),(.2+strength*.5)*gain,.68,pan);this.sample('cloth',.22*gain,.8,pan);break;
      case 'glider':this.sample('cloth',.6*gain,.68,pan);this.burst(.55,.11*gain,400,1600,pan);break;
      case 'lap':if(event.racer===0){[659,784,988,1319].forEach((f,i)=>this.tone(f,f,.21,i*.09,.065,'triangle','ui'));this.duckUntil=this.context.currentTime+.5;}break;
    }
  }
  resetFeedback(){
    this.previousStage=0;this.previousHop=0;this.previousTrick=0;this.previousBoost=0;this.nextWarning=0;this.nextRoulette=0;this.nextStar=0;this.starBeat=0;this.railHold=0;this.nextBeat=0;this.beat=0;this.lastBotDistances=[];
  }
  feedback(r:Racer,active:boolean){
    if(!active)return;
    const stage=r.driftStage??0,hop=r.hop??0,trick=r.trick??0;
    if(r.drifting&&stage>this.previousStage){const notes=stage===3?[1047,1319,1568]:stage===2?[880,1175]:[784];notes.forEach((f,i)=>this.tone(f,f*1.012,.14,i*.045,.045,'sine','ui'));}
    if(hop>.005&&this.previousHop<=.005)this.sample('cloth',.27,1.25);
    if(trick>this.previousTrick+.1){[659,988,1319].forEach((f,i)=>this.tone(f,f*1.06,.15,i*.055,.035,'triangle','ui'));this.burst(.17,.07,900,2600);}
    if(r.boost>this.previousBoost+.1){
      this.burst(.34,.16,450,2600);
      if(['mini','super','ultra'].includes(r.boostKind)){const root=r.boostKind==='ultra'?784:r.boostKind==='super'?659:523;[1,1.25,1.5].forEach((ratio,i)=>this.tone(root*ratio,root*ratio,.22,i*.045,.043,'triangle','ui'));}
    }
    this.previousStage=stage;this.previousHop=hop;this.previousTrick=trick;this.previousBoost=r.boost;
  }
  impact(strength:number){
    if(!this.context||this.context.currentTime-this.lastImpact<.1)return;
    this.lastImpact=this.context.currentTime;this.sample(this.variant('chassis',3),.5*clamp(strength,0,1),.75);this.burst(.16,.1*strength,150,400);
  }
  finish(position=1){
    const melody=position===1?[72,76,79,84,79,84]:[67,71,74,79];
    melody.forEach((pitch,i)=>{this.tone(note(pitch),note(pitch),i===melody.length-1?.75:.22,i*.16,.09,'triangle','ui');this.tone(note(pitch-12),note(pitch-12),.24,i*.16,.035,'sine','ui');});
  }
  beep(frequency=600,duration=.13){this.tone(frequency,frequency,duration,0,.06,'triangle','ui');}
  private variant(group:'metal'|'chassis'|'shell'|'wood'|'grass',count:number){return `${group}-${1+(this.serial++%count)}` as SampleName;}
  private sample(name:SampleName,volume:number,rate=1,pan=0){
    if(!this.context||this.muted||this.voiceCount>=48)return;
    const buffer=this.samples.get(name);if(!buffer)return;
    const c=this.context,source=c.createBufferSource(),gain=c.createGain(),panner=c.createStereoPanner();source.buffer=buffer;source.playbackRate.value=rate;gain.gain.value=volume;panner.pan.value=pan;
    source.connect(gain).connect(panner).connect(this.buses.effects);this.voiceCount++;
    source.onended=()=>{source.disconnect();gain.disconnect();panner.disconnect();this.voiceCount--;};source.start();
  }
  private tone(from:number,to:number,duration:number,delay=0,volume=.04,type:OscillatorType='sine',bus:Bus='effects',pan=0){
    if(!this.context||this.muted||this.voiceCount>=48)return;
    const c=this.context,start=c.currentTime+delay,o=c.createOscillator(),gain=c.createGain(),panner=c.createStereoPanner(),filter=c.createBiquadFilter();
    filter.type='lowpass';filter.frequency.value=type==='sawtooth'?1800:type==='square'?3200:6500;
    o.type=type;o.frequency.setValueAtTime(from,start);o.frequency.exponentialRampToValueAtTime(to,start+duration);panner.pan.value=pan;
    gain.gain.setValueAtTime(.0001,start);gain.gain.linearRampToValueAtTime(volume,start+.008);gain.gain.exponentialRampToValueAtTime(.0001,start+duration);
    o.connect(filter).connect(gain).connect(panner).connect(this.buses[bus]);this.voiceCount++;
    o.onended=()=>{o.disconnect();filter.disconnect();gain.disconnect();panner.disconnect();this.voiceCount--;};o.start(start);o.stop(start+duration+.01);
  }
  private burst(duration:number,volume:number,from:number,to:number,pan=0,bus:Bus='effects',delay=0){
    if(!this.context||!this.noise||this.muted||this.voiceCount>=48)return;
    const c=this.context,start=c.currentTime+delay,source=c.createBufferSource(),gain=c.createGain(),filter=c.createBiquadFilter(),panner=c.createStereoPanner();
    source.buffer=this.noise;filter.type='bandpass';filter.Q.value=.6;panner.pan.value=pan;
    filter.frequency.setValueAtTime(from,start);filter.frequency.exponentialRampToValueAtTime(to,start+duration*.7);
    gain.gain.setValueAtTime(.0001,start);gain.gain.linearRampToValueAtTime(volume,start+.018);gain.gain.exponentialRampToValueAtTime(.0001,start+duration);
    source.connect(filter).connect(gain).connect(panner).connect(this.buses[bus]);this.voiceCount++;
    source.onended=()=>{source.disconnect();filter.disconnect();gain.disconnect();panner.disconnect();this.voiceCount--;};source.start(start,Math.random()*2);source.stop(start+duration);
  }
  /** Original light instrumental pattern, not a Nintendo melody. Audio-clock scheduling. */
  private music(finalLap:boolean){
    if(!this.context||!this.active||this.muted)return;
    const now=this.context.currentTime,step=60/(finalLap?158:138)/2;
    if(!this.nextBeat||this.nextBeat<now-.2)this.nextBeat=now+.015;
    const melody=[76,79,81,0,79,76,74,72,74,76,79,0,76,74,72,0,77,81,84,0,81,79,77,76,74,79,83,0,81,79,74,0];
    for(let scheduled=0;this.nextBeat<now+.12&&scheduled<3;scheduled++){
      const i=this.beat++%32,delay=Math.max(0,this.nextBeat-now),root=[48,45,53,43][Math.floor(i/8)];
      const pitch=melody[i];if(pitch){const f=note(pitch);this.tone(f,f,.19,delay,.12,'triangle','music',.2);this.tone(f*2,f*2,.085,delay,.025,'sine','music',.25);}
      if(i%2===0)this.tone(note(root+(i%4===2?7:0)),note(root+(i%4===2?7:0)),.2,delay,.2,'triangle','music',-.12);
      if(i%4===0)this.tone(130,46,.15,delay,.23,'sine','music');
      if(i%4===2)this.burst(.1,.2,1600,900,0,'music',delay);
      this.burst(.038,i%2?.05:.075,6200,7600,.18,'music',delay);
      this.nextBeat+=step;
    }
  }
}
