/** Optional native Web Audio render QA. See artifacts/audio/README.md. */
import { readFile,writeFile,mkdir,mkdtemp } from 'node:fs/promises';
import { resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';
if(!process.argv[2])throw new Error('Pass the path to node-web-audio-api/index.mjs (installed separately for offline QA).');
const {OfflineAudioContext}=await import(pathToFileURL(resolve(process.argv[2])).href);
const temporary=await mkdtemp(tmpdir()+'/kart-audio-render-'),bundle=temporary+'/game-audio.mjs';
await build({stdin:{contents:['audio','race','course'].map(name=>'export * from '+JSON.stringify(resolve('src/game/'+name+'.ts'))+';').join('\n')+'\nexport {neutral} from '+JSON.stringify(resolve('src/network/protocol.ts'))+';',resolveDir:resolve('.')},bundle:true,platform:'node',format:'esm',define:{'import.meta.env.BASE_URL':'"/"'},outfile:bundle});
const {AudioEngine,Race,Course,neutral}=await import(pathToFileURL(bundle).href);
const root=resolve('.');
globalThis.fetch=async url=>({ok:true,arrayBuffer:async()=>{const data=await readFile(root+'/public'+url);return data.buffer.slice(data.byteOffset,data.byteOffset+data.byteLength);}});
let seed=37;Math.random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
const rate=44100,duration=26,ctx=new OfflineAudioContext(2,rate*duration,rate),audio=new AudioEngine();
audio.context=ctx;audio.buildGraph();await audio.loadSamples();
if(!audio.ready)throw new Error('Missing audio samples '+audio.failedAssets);
const race=new Race(new Course()),controls=neutral(),r=race.player;
let stage=-1;
function frame(t){
  const s=Math.floor(t);controls.throttle=t<2?0:t<5?1:t<7?0:1;
  r.speed=t<2?0:t<5?(t-2)*10:t<9?30:t<11?43:28;
  r.distance+=r.speed/60;r.lane=t>=11&&t<12?9.7:t>=12&&t<13?8.75:0;
  r.drifting=t>=7&&t<9;r.lateralSpeed=r.drifting?5:0;r.driftStage=r.drifting?(t>8?2:1):0;
  r.boost=t>=9&&t<11?11-t:0;r.boostKind=r.boost?'super':'none';
  r.flying=t>=20&&t<22;r.height=r.flying?5:0;
  if(t>=23&&t<24)r.distance=race.course.tunnel[0]+30;
  race.racers.slice(1).forEach((bot,i)=>{bot.distance=r.distance+9+i*8;bot.lane=i%2?3:-3;bot.speed=30;});
  if(s!==stage){stage=s;
    const event=(type,item,strength)=>audio.event({type,item,strength,racer:0},race);
    if(s===12)event('rail',undefined,.9);
    if(s===13){event('pickup');r.roulette=.7;}
    if(s===14){r.roulette=0;event('ready','green-shell');}
    if(s===15)event('shell-launch','green-shell');
    if(s===16)event('shell-bounce','green-shell');
    if(s===17)event('shell-break','green-shell');
    if(s===18)event('use','pulse');
    if(s===19)event('banana-drop','banana');
    if(s===20)event('glider');
    if(s===21)event('use','star');
    if(s===22){event('landing',undefined,.8);const shell=race.pickups.shoot('red-shell',1,r.distance-15,0,0,0,0);shell.position.copy(race.course.position(r.distance-15));}
    if(s===23){race.pickups.shells=[];event('hit','red-shell');}
    if(s===24)event('lap');
  }
  if(t>=22&&t<23&&race.pickups.shells[0])race.pickups.shells[0].position.copy(race.course.position(r.distance-(23-t)*20));
  if(t>=25)audio.update(0,false,false);else{audio.scene(race,1/60,controls);audio.feedback(r,true);}
}
frame(0);
const pauses=Array.from({length:duration*60-1},(_,i)=>ctx.suspend((i+1)/60));const rendered=ctx.startRendering();
for(let i=1;i<duration*60;i++){
 await pauses[i-1];frame(i/60);
 await ctx.resume();
}
const output=await rendered,left=new Float32Array(output.length),right=new Float32Array(output.length);output.copyFromChannel(left,0);output.copyFromChannel(right,1);
const wav=Buffer.alloc(44+output.length*4);wav.write('RIFF');wav.writeUInt32LE(wav.length-8,4);wav.write('WAVEfmt ',8);wav.writeUInt32LE(16,16);wav.writeUInt16LE(1,20);wav.writeUInt16LE(2,22);wav.writeUInt32LE(rate,24);wav.writeUInt32LE(rate*4,28);wav.writeUInt16LE(4,32);wav.writeUInt16LE(16,34);wav.write('data',36);wav.writeUInt32LE(output.length*4,40);
let peak=0,nonfinite=0,clipped=0;for(let i=0;i<output.length;i++){for(let ch=0;ch<2;ch++){const value=(ch?right:left)[i];if(!Number.isFinite(value))nonfinite++;peak=Math.max(peak,Math.abs(value));if(Math.abs(value)>=1)clipped++;wav.writeInt16LE(Math.round(Math.max(-1,Math.min(1,value))*32767),44+i*4+ch*2);}}
const measurements=[];for(let s=0;s<duration;s++){let sum=0,p=0;for(let i=s*rate;i<(s+1)*rate;i++){sum+=left[i]**2+right[i]**2;p=Math.max(p,Math.abs(left[i]),Math.abs(right[i]));}measurements.push({second:s,rmsDb:20*Math.log10(Math.sqrt(sum/(rate*2))||1e-12),peakDb:20*Math.log10(p||1e-12)});}
await mkdir(root+'/artifacts/audio',{recursive:true});await writeFile(root+'/artifacts/audio/driving-mix.wav',wav);
const report={samples:audio.sampleCount,seconds:duration,peakDb:20*Math.log10(peak),clippedSamples:clipped,nonFiniteSamples:nonfinite,remainingVoices:audio.voiceCount,loopCount:audio.loops.size,measurements};
await writeFile(root+'/artifacts/audio/levels.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
if(nonfinite||clipped||peak<.01)throw new Error('Invalid rendered audio');
