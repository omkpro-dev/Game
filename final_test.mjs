import pkg from '/opt/node22/lib/node_modules/playwright/index.js'; const { chromium } = pkg;
const browser=await chromium.launch();
async function fresh(n){ const p=await browser.newPage({viewport:{width:1400,height:880}});
  const e=[]; p.on('pageerror',x=>e.push(x.message)); p.on('console',m=>{if(m.type()==='error')e.push(m.text());});
  await p.goto('file:///home/user/Game/index.html'); await p.waitForTimeout(400);
  await p.evaluate(nn=>{const id=G.order.find(k=>G.nations[k].name===nn);startGame(id);},n); await p.waitForTimeout(150); p._e=e; return p; }

// 1. LONG WORLD SIM (12y) as USA
let page=await fresh('United States of America');
const long=await page.evaluate(()=>{
  for(let i=0;i<12*73;i++){ step(5); G.date=new Date(G.date.getTime()+5*864e5); }
  return {indep:G.order.filter(k=>G.nations[k].alive).length, conquered:G.order.filter(k=>!G.nations[k].alive).length,
    wars:G.wars.length, armies:Object.keys(G.armies).length, tension:Math.round(G.worldTension),
    biggest:(()=>{const a=[...G.order].filter(k=>G.nations[k].alive).sort((x,y)=>G.nations[y].tileCount-G.nations[x].tileCount);return a.slice(0,4).map(k=>G.nations[k].name+':'+G.nations[k].tileCount);})()};
});
console.log('12y world:', JSON.stringify(long), '| errs:', page._e.slice(0,5));
await page.close();

// 2. PLAYER CONQUERED -> game over
page=await fresh('Belgium'); // tiny nation
const over=await page.evaluate(()=>{
  const n=G.nations[G.playerId]; const foe=n.nb.find(b=>G.nations[b].alive);
  // make foe overwhelming
  const fn=G.nations[foe]; for(let i=0;i<40;i++) deployDivision(fn,fn.templates[1],fn.capital,true);
  startWar(foe,G.playerId);
  let ended=false; const origEnd=window.endGame;
  for(let i=0;i<600 && G.nations[G.playerId].alive;i++){
    if(i%6===0){for(const id of [...fn.armyIds]){const a=G.armies[id];if(a&&!a.engaging&&(!a.path||!a.path.length)){const tk=nearestEnemyTile(a,fn);if(tk)orderMove(a,tk);}}}
    step(5); G.date=new Date(G.date.getTime()+5*864e5);
  }
  return {playerAlive:G.nations[G.playerId].alive, playerTiles:G.nations[G.playerId].tileCount, gameEnded:typeof gameEnded!=='undefined'?gameEnded:'?'};
});
console.log('conquest of player:', JSON.stringify(over));
const modalShown=await page.$eval('#modalWrap',e=>e.style.display==='flex').catch(()=>false);
const modalTitle=await page.$eval('#modalTitle',e=>e.textContent).catch(()=>'');
console.log('game-over modal:', modalShown, '"'+modalTitle+'" | errs:', page._e.slice(0,5));
await page.close();

// 3. PERFORMANCE at various zooms
page=await fresh('China');
const perf=await page.evaluate(()=>{
  const out={};
  cam.zoom=cv.clientHeight/(ROWS*BASE+80);cam.ox=0;cam.oy=0;G.dirty=true;
  let t0=performance.now();for(let i=0;i<8;i++)draw();out.zoomedOut=+( (performance.now()-t0)/8 ).toFixed(1);
  centerNation(G.playerId);cam.zoom=4;clampCam();
  t0=performance.now();for(let i=0;i<8;i++)draw();out.zoomedIn=+( (performance.now()-t0)/8 ).toFixed(1);
  return out;
});
console.log('perf(ms/frame):', JSON.stringify(perf), '| errs:', page._e.slice(0,5));
await page.close();
await browser.close();
