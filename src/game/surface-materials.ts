import * as T from 'three';

/** Staggered dressed stone, with shallow joints rather than painted black grid lines. */
export function harborPaving() {
  const color=document.createElement('canvas'),height=document.createElement('canvas');color.width=height.width=512;color.height=height.height=512;
  const ctx=color.getContext('2d')!,bump=height.getContext('2d')!;
  ctx.fillStyle='#8c897e';ctx.fillRect(0,0,512,512);bump.fillStyle='#333';bump.fillRect(0,0,512,512);
  let seed=71403;const random=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;};
  for(let row=0;row<16;row++)for(let col=-1;col<9;col++) {
    const x=col*64+(row%2)*32,y=row*32,v=162+Math.floor(random()*28);
    ctx.fillStyle=`rgb(${v+6},${v+3},${v-6})`;ctx.fillRect(x+1,y+1,62,30);
    ctx.fillStyle='#d0c9b355';ctx.fillRect(x+2,y+2,60,1);ctx.fillRect(x+2,y+2,1,28);
    ctx.fillStyle='#57584f33';ctx.fillRect(x+2,y+29,60,1);ctx.fillRect(x+61,y+2,1,28);
    bump.fillStyle='#999';bump.fillRect(x+1,y+1,62,30);bump.fillStyle='#ccc';bump.fillRect(x+2,y+2,60,28);
    for(let n=0;n<35;n++){ctx.fillStyle=random()>.5?'#fff1df13':'#50473713';ctx.fillRect(x+3+random()*58,y+3+random()*26,1+random()*2,1);}
  }
  const map=new T.CanvasTexture(color),bumpMap=new T.CanvasTexture(height);
  map.colorSpace=T.SRGBColorSpace;
  for(const t of [map,bumpMap]){t.wrapS=t.wrapT=T.RepeatWrapping;t.anisotropy=8;}
  return new T.MeshStandardMaterial({map,bumpMap,bumpScale:.035,roughness:.92});
}
