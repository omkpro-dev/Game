import pkg from '/opt/node22/lib/node_modules/playwright/index.js'; const { chromium } = pkg;
const browser=await chromium.launch();
async function fresh(nation){ const page=await browser.newPage({viewport:{width:1400,height:880}});
  const errs=[]; page.on('pageerror',e=>errs.push(e.message)); page.on('console',m=>{if(m.type()==='error')errs.push(m.text());});
  await page.goto('file:///home/user/Game/index.html'); await page.waitForTimeout(400);
  await page.evaluate(n=>{const id=G.order.find(k=>G.nations[k].name===n);startGame(id);},nation);
  await page.waitForTimeout(200); page._errs=errs; return page; }

// 1. MOVEMENT
let page=await fresh('France');
console.log('MOVE:', JSON.stringify(await page.evaluate(()=>{
  const n=G.nations[G.playerId]; const a=G.armies[[...n.armyIds][0]]; const from=a.tile;
  let target=null; for(const k of n.tiles){const t=TILES.get(k); if(!t.army){const dc=Math.abs((k%COLS)-(from%COLS)),dr=Math.abs(Math.floor(k/COLS)-Math.floor(from/COLS)); if(dc+dr>=3&&dc+dr<=7){target=k;break;}}}
  orderMove(a,target); for(let i=0;i<30;i++)moveArmies(3);
  return {from,target,now:a.tile,moved:a.tile===target,alive:!!G.armies[a.id]};
})));
await page.close();

// 2. PLAYER OFFENSIVE — order armies at enemy, verify captures
page=await fresh('Germany');
console.log('OFFENSIVE:', JSON.stringify(await page.evaluate(()=>{
  const n=G.nations[G.playerId];
  const foe=n.nb.find(b=>G.nations[b].alive&&G.nations[b].tileCount>=4);
  // build a strong strike force
  for(let i=0;i<12;i++) deployDivision(n,n.templates[1],n.capital,true);
  startWar(G.playerId,foe);
  const before=G.nations[foe].tileCount;
  // command every player army toward nearest enemy tile each ~month
  for(let i=0;i<260;i++){
    if(i%8===0){ for(const id of [...n.armyIds]){ const a=G.armies[id]; if(a&&!a.engaging&&(!a.path||!a.path.length)){ const tk=nearestEnemyTile(a,n); if(tk)orderMove(a,tk);} } }
    moveArmies(3); resolveTileCombat(3); regenArmies(3);
  }
  return {foe:G.nations[foe].name, before, after:G.nations[foe].tileCount, captured:before-G.nations[foe].tileCount,
    foeAlive:G.nations[foe].alive, playerTiles:n.tileCount};
})));
console.log(' errs:', page._errs.slice(0,5));
await page.close();

// 3. BALANCE (fresh, no war contamination) as USA
page=await fresh('United States of America');
const bal=await page.evaluate(()=>{
  const P=()=>G.nations[G.playerId]; const s=[];
  for(let yr=1;yr<=8;yr++){ for(let i=0;i<73;i++){ step(5); G.date=new Date(G.date.getTime()+5*864e5);} 
    s.push({yr,tension:Math.round(G.worldTension),wars:G.wars.length,conq:G.order.filter(k=>!G.nations[k].alive).length,
      gdp:Math.round(P().gdp),treas:Math.round(P().treasury),stab:Math.round(P().stability),net:Math.round((P()._income||0)-(P()._expense||0))});}
  return {s, indep:G.order.filter(k=>G.nations[k].alive).length, armies:Object.keys(G.armies).length};
});
console.log('\nyr|tens|wars|conq|gdp|treasury|stab|net/yr  (USA, peaceful)');
for(const r of bal.s) console.log(`${r.yr} | ${r.tension} | ${r.wars} | ${r.conq} | ${r.gdp} | ${r.treas} | ${r.stab} | ${r.net}`);
console.log('independent:', bal.indep, '| armies:', bal.armies, '| errs:', page._errs.slice(0,5));
await page.close();
await browser.close();
