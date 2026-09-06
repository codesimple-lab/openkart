/** Same browser tab may resume its socket; a different phone may not evict it. */
export function controllerId(){
  try{
    const saved=sessionStorage.getItem('openkart-controller');
    if(saved&&/^[a-f0-9]{32}$/.test(saved))return saved;
  }catch{/* Private browsing may disable storage. */}
  const id=[...crypto.getRandomValues(new Uint8Array(16))].map(v=>v.toString(16).padStart(2,'0')).join('');
  try{sessionStorage.setItem('openkart-controller',id);}catch{/* Keep the identity for this page lifetime. */}
  return id;
}
