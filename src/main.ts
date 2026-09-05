import './style.css';
const root=document.querySelector<HTMLElement>('#app')!;
try {
  if(location.pathname==='/controller') {
    const {Controller}=await import('./controller/controller');new Controller(root);
  }else {
    const {Game}=await import('./game/game');new Game(root);
  }
}catch(error){
  console.error(error);root.replaceChildren();
  const panel=document.createElement('section');panel.className='startup';
  const title=document.createElement('h1');title.textContent='Le départ attend encore.';
  const help=document.createElement('p');help.textContent=error instanceof Error&&/webgl|context/i.test(error.message)?'Le navigateur ne peut pas créer le rendu 3D. Active son accélération graphique, ou ouvre ce lien dans un autre navigateur.':'Le jeu n’a pas pu démarrer. Recharge la page pour réessayer.';
  const reload=document.createElement('button');reload.className='start-button';reload.textContent='RECHARGER';reload.onclick=()=>location.reload();panel.append(title,help,reload);root.append(panel);
}
