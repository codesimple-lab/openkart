import { build } from 'esbuild';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const root=resolve(fileURLToPath(new URL('..',import.meta.url)));
const bundle=await build({stdin:{contents:"export {Course} from './src/game/course'; export {driverPortrait} from './src/game/driver-portraits';",resolveDir:root},bundle:true,platform:'node',format:'esm',write:false});
const {Course,driverPortrait}=await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);
const out=resolve(root,'docs/images');await mkdir(out,{recursive:true});
const shell=(width,height,label,body)=>`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="${label}"><style>text{font-family:Arial,Helvetica,sans-serif}</style>${body}</svg>`;
const names=['Mario','Luigi','Peach','Yoshi'],colors=['#ed353e','#22b94d','#ff77b0','#69d334'],roles=['Équilibre','Précision','Puissance','Accélération'];
const cards=names.map((name,i)=>{
 const x=36+i*285,portrait=driverPortrait(i).replace('<svg viewBox','<svg x="37" y="24" width="180" height="180" viewBox');
 return `<g transform="translate(${x} 102)"><rect width="255" height="276" rx="20" fill="#fff"/><rect y="256" width="255" height="20" rx="10" fill="${colors[i]}"/>${portrait}<text x="127" y="225" text-anchor="middle" fill="#12305d" font-size="26" font-weight="800">${name}</text><text x="127" y="248" text-anchor="middle" fill="#526a8e" font-size="15">${roles[i]}</text></g>`;
}).join('');
await writeFile(resolve(out,'pilotes.svg'),shell(1200,414,'Les quatre pilotes d’OpenKart',`<rect width="1200" height="414" rx="24" fill="#0867d8"/><text x="38" y="51" fill="white" font-size="29" font-weight="900" font-style="italic">OPENKART</text><text x="1160" y="48" text-anchor="end" fill="#d7ecff" font-size="15" letter-spacing="2">CHOISIS TON CHAMPION</text>${cards}`));
const course=new Course();
const xs=course.samples.map(s=>s.p.x),zs=course.samples.map(s=>s.p.z);
const minX=Math.min(...xs),maxX=Math.max(...xs),minZ=Math.min(...zs),maxZ=Math.max(...zs);
const scale=Math.min(480/(maxX-minX),465/(maxZ-minZ));
const point=p=>[850+(p.x-(minX+maxX)/2)*scale,300+(p.z-(minZ+maxZ)/2)*scale];
const path=course.samples.map((s,i)=>`${i?'L':'M'}${point(s.p).map(v=>v.toFixed(2)).join(',')}`).join(' ')+'Z';
const [sx,sy]=point(course.at(0).p);
const body=`<rect width="1200" height="600" rx="24" fill="#eef7ff"/>
<text x="48" y="71" fill="#0867d8" font-size="16" font-weight="800" letter-spacing="3">LE CIRCUIT</text>
<text x="48" y="136" fill="#12305d" font-size="46" font-weight="900">Île des</text><text x="48" y="187" fill="#12305d" font-size="46" font-weight="900">Aiguilles</text>
<text x="48" y="257" fill="#526a8e" font-size="20">Port, lacets, viaduc</text><text x="48" y="289" fill="#526a8e" font-size="20">et grotte aux cristaux.</text>
<text x="48" y="374" fill="#0867d8" font-size="38" font-weight="800">${(course.length/1000).toFixed(2).replace('.',',')} km</text>
<text x="48" y="410" fill="#526a8e" font-size="19">3 tours · 6 pilotes</text>
<text x="48" y="520" fill="#526a8e" font-size="15">Tracé généré depuis le circuit du jeu.</text><text x="48" y="545" fill="#526a8e" font-size="15">Les passages cachés restent à découvrir.</text>
<path d="${path}" fill="none" stroke="#c6e1f6" stroke-width="31" stroke-linejoin="round"/>
<path d="${path}" fill="none" stroke="#176bd0" stroke-width="18" stroke-linejoin="round"/>
<path d="${path}" fill="none" stroke="#f3faff" stroke-width="2" stroke-dasharray="7 7"/>
<circle cx="${sx}" cy="${sy}" r="14" fill="#ffdd38" stroke="#fff" stroke-width="4"/>
<text x="${sx+24}" y="${sy+6}" fill="#12305d" font-size="16" font-weight="800">DÉPART</text>`;
await writeFile(resolve(out,'circuit.svg'),shell(1200,600,'Tracé du circuit Île des Aiguilles',body));
console.log('Generated docs/images/pilotes.svg and circuit.svg from game source.');
