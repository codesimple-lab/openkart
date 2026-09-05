export interface Controls { steer:number; throttle:number; brake:number; drift:boolean; item:boolean; itemBackward?:boolean; reset:boolean }
export const neutral = (): Controls => ({ steer:0, throttle:0, brake:0, drift:false, item:false, reset:false });
export function isControls(v: unknown): v is Controls {
  if (!v || typeof v !== 'object') return false;
  const c = v as Record<string,unknown>;
  return ['steer','throttle','brake'].every(k => typeof c[k] === 'number' && Number.isFinite(c[k]))
    && Number(c.steer) >= -1 && Number(c.steer) <= 1
    && Number(c.throttle) >= 0 && Number(c.throttle) <= 1
    && Number(c.brake) >= 0 && Number(c.brake) <= 1
    && (c.itemBackward===undefined||typeof c.itemBackward==='boolean')
    && ['drift','item','reset'].every(k => typeof c[k] === 'boolean');
}
export const validRoom = (v:unknown): v is string => typeof v === 'string' && /^[A-HJ-NP-Z2-9]{6}$/.test(v);
export function roomCode():string {
  const letters = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return [...crypto.getRandomValues(new Uint8Array(6))].map(v => letters[v % letters.length]).join('');
}
