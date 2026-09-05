import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import WebSocket from 'ws';
const base=process.env.DELTA_TEST_ORIGIN??'http://127.0.0.1:5180';
const endpoint=base.replace(/^http/,'ws')+'/relay';
const letters='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const room=[...randomBytes(6)].map(b=>letters[b%letters.length]).join('');
const sockets=[];
function next(ws,predicate,ms=2000){return new Promise((resolve,reject)=>{const timer=setTimeout(()=>{ws.off('message',handler);reject(new Error('No expected message'));},ms);const handler=raw=>{const m=JSON.parse(String(raw));if(predicate(m)){clearTimeout(timer);ws.off('message',handler);resolve(m);}};ws.on('message',handler);});}
async function open(){const ws=new WebSocket(endpoint);sockets.push(ws);await new Promise((resolve,reject)=>{ws.once('open',resolve);ws.once('error',reject);});return ws;}
async function join(ws,role,code=room,key){const ready=next(ws,m=>m.type==='ready'||m.type==='error');ws.send(JSON.stringify({type:'join',role,room:code,key}));return ready;}
const controls={steer:.6,throttle:1,brake:0,drift:true,item:false,reset:false};
try{
  const info=await (await fetch(base+'/api/network')).json();assert.match(info.origin,/^https?:\/\//);
  const host=await open();assert.equal((await join(host,'host',room,randomBytes(16).toString('hex'))).type,'ready');
  const phone=await open();assert.equal((await join(phone,'phone')).type,'ready');
  const input=next(host,m=>m.type==='input');phone.send(JSON.stringify({type:'input',controls,sequence:1}));assert.deepEqual((await input).controls,controls);
  let forwarded=0;const counter=raw=>{if(JSON.parse(String(raw)).type==='input')forwarded++;};host.on('message',counter);
  phone.send(JSON.stringify({type:'input',controls:{...controls,steer:5},sequence:2}));
  phone.send(JSON.stringify({type:'input',controls,sequence:0}));
  phone.send(JSON.stringify({type:'input',controls:{...controls,itemBackward:'invalid'},sequence:2}));
  await new Promise(r=>setTimeout(r,80));assert.equal(forwarded,0);host.off('message',counter);
  const action=next(host,m=>m.type==='action');phone.send(JSON.stringify({type:'action',action:'start'}));assert.equal((await action).action,'start');
  const telemetry=next(phone,m=>m.type==='status');host.send(JSON.stringify({type:'status',speed:95,lap:2,flight:true,phase:'race'}));assert.equal((await telemetry).flight,true);
  for(const payload of [{item:'turbo',roulette:false},{item:null,roulette:true},{item:'invalid',roulette:'bad'}]){
    const packet=next(phone,m=>m.type==='status');host.send(JSON.stringify({type:'status',speed:95,lap:2,flight:false,phase:'race',...payload}));
    const received=await packet;assert.equal(received.item,payload.item==='turbo'?'turbo':null);assert.equal(received.roulette,payload.roulette===true);
  }
  for(const item of ['banana','green-shell','red-shell','star','pulse']){
    const packet=next(phone,m=>m.type==='status');host.send(JSON.stringify({type:'status',speed:105,lap:1,flight:false,phase:'race',item,reserveItem:'star',coins:9}));
    const received=await packet;assert.equal(received.item,item);assert.equal(received.reserveItem,'star');assert.equal(received.coins,9);
  }
  const invalidStatus=next(phone,m=>m.type==='status');host.send(JSON.stringify({type:'status',speed:0,lap:1,flight:false,phase:'garage',item:'<svg>',reserveItem:'bad',coins:99}));
  const sanitized=await invalidStatus;assert.equal(sanitized.item,null);assert.equal(sanitized.reserveItem,null);assert.equal(sanitized.coins,10);
  const press=next(host,m=>m.type==='input');phone.send(JSON.stringify({type:'input',controls:{...controls,item:true,itemBackward:true},sequence:3}));assert.deepEqual((await press).controls,{...controls,item:true,itemBackward:true});
  const release=next(host,m=>m.type==='input');phone.send(JSON.stringify({type:'input',controls:{...controls,item:false},sequence:4}));assert.equal((await release).controls.item,false);
  // A simultaneous throttle/steering/drift/backthrow packet must retain every finger.
  const tapPress=next(host,m=>m.type==='input'&&m.controls.item),tapRelease=next(host,m=>m.type==='input'&&!m.controls.item);
  phone.send(JSON.stringify({type:'input',controls:{...controls,item:true,itemBackward:true},sequence:5}));
  phone.send(JSON.stringify({type:'input',controls:{...controls,item:false},sequence:6}));
  assert.deepEqual((await tapPress).controls,{...controls,item:true,itemBackward:true});assert.deepEqual((await tapRelease).controls,{...controls,item:false});
  const pauseAction=next(host,m=>m.type==='action');phone.send(JSON.stringify({type:'action',action:'pause'}));assert.equal((await pauseAction).action,'pause');
  const paused=next(phone,m=>m.type==='status');host.send(JSON.stringify({type:'status',speed:0,lap:1,flight:false,phase:'paused'}));assert.equal((await paused).phase,'paused');
  const resumeAction=next(host,m=>m.type==='action');phone.send(JSON.stringify({type:'action',action:'pause'}));assert.equal((await resumeAction).action,'pause');
  const resumedThrow=next(host,m=>m.type==='input');phone.send(JSON.stringify({type:'input',controls:{...controls,item:true,itemBackward:true},sequence:7}));assert.equal((await resumedThrow).controls.itemBackward,true);
  const second=await open();assert.equal((await join(second,'phone')).type,'error');
  const gone=next(host,m=>m.type==='peer'&&!m.connected);phone.close();await gone;
  const resumed=await open();assert.equal((await join(resumed,'phone')).type,'ready');
  const reconnectInput=next(host,m=>m.type==='input');resumed.send(JSON.stringify({type:'input',controls:{...controls,throttle:0},sequence:1}));assert.equal((await reconnectInput).controls.throttle,0);
  console.log('Relay OK: pairing, simultaneous controls/backthrow, fast directed press/release, invalid and stale input rejection, pause/resume directed throw, telemetry, exclusive controller, disconnect and reconnect.');
}finally{sockets.forEach(ws=>ws.close());}
