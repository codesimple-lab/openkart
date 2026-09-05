import { defineConfig, type Plugin, type HttpServer } from 'vite';
import basicSsl from '@vitejs/plugin-basic-ssl';
import { networkInterfaces } from 'node:os';
import { WebSocketServer, WebSocket } from 'ws';
import { isControls, validRoom } from './src/network/protocol';

const port = Number(process.env.PORT ?? 5180);
const secure = process.env.DELTA_HTTPS === '1';
function lanAddress() {
  const addresses = Object.entries(networkInterfaces()).flatMap(([name, list]) => (list ?? []).filter(a => a.family === 'IPv4' && !a.internal).map(a => ({name, ip:a.address})));
  return process.env.DELTA_LAN_IP ?? addresses.find(a => /^(en|eth|wlan)/.test(a.name) && /^(192\.168\.|10\.|172\.(1[6-9]|2\d|3[01])\.)/.test(a.ip))?.ip ?? addresses[0]?.ip ?? '127.0.0.1';
}
function relay(): Plugin {
  const setup = (server: HttpServer) => {
    interface Room { host:WebSocket|null; phone:WebSocket|null; key:string; lastActive:number }
    const rooms = new Map<string,Room>();
    const peers = new Map<WebSocket,{ room:string; role:'host'|'phone'; sequence:number }>();
    const wss = new WebSocketServer({ noServer:true, maxPayload:2048 });
    const send = (ws:WebSocket|null, data:object) => { if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(data)); };
    const broadcast = (room:Room) => {
      send(room.host,{type:'peer',connected:!!room.phone});
      send(room.phone,{type:'peer',connected:!!room.host});
    };
    wss.on('connection', ws => {
      ws.on('message', raw => {
        let m; try { m = JSON.parse(raw.toString()); } catch { return; }
        if (!m || typeof m !== 'object') return;
        if (m.type === 'join') {
          if (peers.has(ws) || !validRoom(m.room) || !['host','phone'].includes(m.role)) return;
          let room = rooms.get(m.room);
          if (m.role === 'host') {
            if (typeof m.key !== 'string' || !/^[a-f0-9]{32}$/.test(m.key)) return;
            if (room && (room.key !== m.key || room.host)) { send(ws,{type:'error',message:'Cette session est déjà utilisée.'}); return; }
            room ??= {host:null,phone:null,key:m.key,lastActive:Date.now()};
            room.host = ws; rooms.set(m.room,room);
          } else {
            if (!room?.host) { send(ws,{type:'error',message:'Session introuvable. Ouvre le jeu et vérifie le code affiché.'}); return; }
            if (room.phone) { send(ws,{type:'error',message:'Une manette est déjà connectée à cette course.'}); return; }
            room.phone = ws;
          }
          peers.set(ws,{room:m.room,role:m.role,sequence:-1});
          send(ws,{type:'ready',room:m.room}); broadcast(room); return;
        }
        const peer = peers.get(ws); if (!peer) return;
        const room = rooms.get(peer.room); if (!room) return;
        room.lastActive = Date.now();
        if (m.type === 'ping' && Number.isFinite(m.time)) { send(ws,{type:'pong',time:m.time}); return; }
        if (peer.role === 'phone' && m.type === 'input' && isControls(m.controls) && Number.isSafeInteger(m.sequence) && m.sequence > peer.sequence) {
          peer.sequence = m.sequence; send(room.host,{type:'input',controls:m.controls});
        }
        if (peer.role === 'phone' && m.type === 'action' && ['start','pause'].includes(m.action)) send(room.host,{type:'action',action:m.action});
        if (peer.role === 'host' && m.type === 'status' && Number.isFinite(m.speed) && Number.isFinite(m.lap) && typeof m.flight === 'boolean' && ['garage','countdown','race','paused','finish'].includes(m.phase)) {
          send(room.phone,{type:'status',speed:m.speed,lap:m.lap,flight:m.flight,phase:m.phase,item:['turbo','pulse','shield','banana','green-shell','red-shell','star'].includes(m.item)?m.item:null,roulette:m.roulette===true,reserveItem:['turbo','pulse','shield','banana','green-shell','red-shell','star'].includes(m.reserveItem)?m.reserveItem:null,coins:Number.isInteger(m.coins)?Math.max(0,Math.min(10,m.coins)):0});
        }
      });
      ws.on('close', () => {
        const p = peers.get(ws); if (!p) return;
        peers.delete(ws); const r = rooms.get(p.room); if (!r) return;
        r[p.role] = null; r.lastActive = Date.now(); broadcast(r);
      });
      ws.on('error', () => ws.close());
    });
    const cleanup = setInterval(() => {
      rooms.forEach((r,id) => { if (!r.host && Date.now()-r.lastActive>120000) { r.phone?.close(); rooms.delete(id); } });
    },30000);
    server.on('upgrade',(request,socket,head) => {
      if (request.url?.split('?')[0] !== '/relay') return;
      wss.handleUpgrade(request,socket,head,ws => wss.emit('connection',ws,request));
    });
    server.once('close',() => { clearInterval(cleanup); wss.clients.forEach(ws => ws.close()); wss.close(); });
  };
  const middleware = (_req:unknown,res:{setHeader:(k:string,v:string)=>void;end:(v:string)=>void}) => {
    res.setHeader('Content-Type','application/json');
    res.setHeader('Cache-Control','no-store');
    res.end(JSON.stringify({origin:`${secure?'https':'http'}://${lanAddress()}:${port}`}));
  };
  return { name:'delta-phone-relay', configureServer(server) { server.middlewares.use('/api/network',middleware); if(server.httpServer) setup(server.httpServer); }, configurePreviewServer(server) { server.middlewares.use('/api/network',middleware); setup(server.httpServer); } };
}
export default defineConfig({ plugins:[...(secure?[basicSsl()]:[]),relay()], server:{port,strictPort:true}, preview:{port,strictPort:true}, build:{rollupOptions:{output:{manualChunks:{three:['three']}}}} });
