import pkg from '/opt/node22/lib/node_modules/playwright/index.js'; const { chromium } = pkg;
const errors=[];
const browser = await chromium.launch();
const page = await browser.newPage({viewport:{width:1440,height:900}});
page.on('pageerror', e=>errors.push('PAGEERROR: '+e.message));
page.on('console', m=>{ if(m.type()==='error') errors.push('CONSOLE: '+m.text()); });
await page.goto('file:///home/user/Game/index.html');
await page.waitForTimeout(400);
await page.click('.natcard[data-id]');
await page.click('#startBtn');
await page.waitForTimeout(200);

// fast-forward ~5 years via direct step() calls, sampling yearly
const report = await page.evaluate(()=>{
  const samples=[];
  const P=()=>G.nations[G.playerId];
  for(let yr=1; yr<=6; yr++){
    for(let i=0;i<365/15;i++){ step(15); G.date=new Date(G.date.getTime()+15*864e5); }
    const conquered = G.order.filter(k=>!G.nations[k].alive).length;
    samples.push({
      yr, tension:Math.round(G.worldTension), wars:G.wars.length, conquered,
      pTreasury:Math.round(P().treasury), pGDP:Math.round(P().gdp),
      pStab:Math.round(P().stability), pNet:Math.round((P()._income||0)-(P()._expense||0)),
    });
  }
  // distribution of nations still independent
  const indep=G.order.filter(k=>G.nations[k].owner===k && G.nations[k].alive).length;
  return {samples, indep, total:G.order.length};
});
console.log('Player: '+await page.$eval('#natHeader',e=>e.textContent.split('·')[0].replace(/\s+/g,' ').trim()));
console.log('year | tension | activeWars | conquered | pTreasury | pGDP  | pStab | pNet/yr');
for(const s of report.samples){
  console.log(`${s.yr}    | ${String(s.tension).padStart(3)}     | ${String(s.wars).padStart(3)}        | ${String(s.conquered).padStart(3)}       | ${String(s.pTreasury).padStart(6)}    | ${String(s.pGDP).padStart(5)} | ${s.pStab}    | ${s.pNet}`);
}
console.log(`independent nations remaining: ${report.indep}/${report.total}`);
console.log('ERRORS:', errors.length); errors.slice(0,10).forEach(e=>console.log(e));
await browser.close();
