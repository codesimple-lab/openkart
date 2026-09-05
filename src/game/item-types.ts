/** Lightweight shared metadata: imported by both the 3D game and phone controller. */
export type Item = 'turbo'|'pulse'|'shield'|'banana'|'green-shell'|'red-shell'|'star';
export const ITEM_LABELS:Record<Item,string>={turbo:'CHAMPIGNON',pulse:'SUPER KLAXON',shield:'BOUCLIER',banana:'BANANE','green-shell':'CARAPACE VERTE','red-shell':'CARAPACE ROUGE',star:'SUPER ÉTOILE'};
const svg=(body:string)=>`<svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">${body}</svg>`;
const shell=(color:string)=>svg(`<ellipse cx="32" cy="46" rx="26" ry="10" fill="#fff8db" stroke="#173147" stroke-width="3"/><path d="M9 43Q9 9 32 9Q55 9 55 43Z" fill="${color}" stroke="#173147" stroke-width="3"/><path d="M22 12L19 32L31 43L44 32L42 12M19 32L10 37M44 32L54 37M19 32H44" fill="none" stroke="#174235" stroke-width="2"/>`);
export const ITEM_ICONS:Record<Item,string>={
 turbo:svg('<path d="M20 38H44V50Q32 64 20 50Z" fill="#ffe8ba" stroke="#312435" stroke-width="3"/><path d="M5 35C5-1 59-1 59 35Q57 44 32 41Q7 44 5 35Z" fill="#f43840" stroke="#312435" stroke-width="3"/><ellipse cx="32" cy="18" rx="10" ry="11" fill="white"/><path d="M7 22Q21 17 17 33L7 35M57 22Q43 17 47 33L57 35" fill="white"/><path d="M27 46V52M37 46V52" stroke="#312435" stroke-width="4" stroke-linecap="round"/>'),
 'green-shell':shell('#36cd53'),'red-shell':shell('#f33c41'),
 banana:svg('<path d="M29 8H37L35 34Q45 45 58 43L51 57Q35 53 31 42Q27 55 9 56L4 46Q20 46 26 33Z" fill="#ffe439" stroke="#765111" stroke-width="3"/><path d="M31 16L29 41M24 41L16 49M37 40L48 49" fill="none" stroke="#e7a313" stroke-width="2"/><path d="M28 5H38" stroke="#6e652c" stroke-width="5"/><circle cx="29" cy="30" r="2"/><circle cx="35" cy="30" r="2"/>'),
 star:svg('<path d="M32 3L41 21L62 25L47 40L51 61L32 51L13 61L17 40L2 25L23 21Z" fill="#ffdf33" stroke="#b27305" stroke-width="3"/><path d="M27 28V37M37 28V37" stroke="#322838" stroke-width="5" stroke-linecap="round"/>'),
 shield:svg('<path d="M32 5L55 14V31Q53 50 32 60Q11 50 9 31V14Z" fill="#63e6ff" stroke="#1766b7" stroke-width="4"/><path d="M32 17V45M21 31H43" stroke="white" stroke-width="6"/>'),
 pulse:svg('<path d="M12 28H27L45 14V51L27 39H12Z" fill="#e94a36" stroke="#45273c" stroke-width="3"/><path d="M20 40V55H30L26 40" fill="#ffd92f"/><path d="M51 21Q61 32 51 43" fill="none" stroke="#ffda39" stroke-width="5"/>'),
};
export const ITEM_POOL:readonly Item[]=['turbo','banana','green-shell','red-shell','star','pulse'];
