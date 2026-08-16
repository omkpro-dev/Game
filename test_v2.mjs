import pkg from '/opt/node22/lib/node_modules/playwright/index.js'; const { chromium } = pkg;
const errors=[];
const browser=await chromium.launch();
const page=await browser.newPage({viewport:{width:1500,height:920}});
page.on('pageerror',e=>errors.push('PAGEERROR: '+e.message));
page.on('console',m=>{if(m.type()==='error')errors.push('CONSOLE: '+m.text());});
await page.goto('file:///home/user/Game/index.html');
await page.waitForTimeout(700);
console.log('start cards:', await page.$$eval('#startCards .natcard',e=>e.length).catch(()=>'ERR'));
console.log('world built:', await page.evaluate(()=>({nations:G.order.length, tiles:TILES.size, armies:Object.keys(G.armies).length})).catch(e=>'ERR '+e));
// start as USA
await page.evaluate(()=>{const id=G.order.find(k=>G.nations[k].name==='United States of America');startGame(id);});
await page.waitForTimeout(500);
console.log('overlay hidden:', await page.$eval('#startScreen',e=>e.style.display==='none'));
console.log('header:', (await page.$eval('#natHeader',e=>e.textContent)).replace(/\s+/g,' ').trim().slice(0,80));
// tabs
for(const t of ['nation','economy','build','resources','military','research','diplomacy','alliances','domestic','intl','intel']){
  await page.click(`#tabs button[data-tab="${t}"]`).catch(()=>{});
  await page.waitForTimeout(40);
  const len=await page.$eval('#tabBody',e=>e.textContent.length).catch(()=>-1);
  console.log(`  tab ${t}: ${len}`);
}
await page.waitForTimeout(200);
await page.screenshot({path:'/home/user/Game/v2_start.png'});
console.log('ERRORS('+errors.length+'):'); errors.slice(0,20).forEach(e=>console.log(' ',e));
await browser.close();
