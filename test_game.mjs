import pkg from '/opt/node22/lib/node_modules/playwright/index.js'; const { chromium } = pkg;

const errors=[];
const browser = await chromium.launch();
const page = await browser.newPage({viewport:{width:1440,height:900}});
page.on('console', m=>{ if(m.type()==='error') errors.push('CONSOLE: '+m.text()); });
page.on('pageerror', e=>errors.push('PAGEERROR: '+e.message));

await page.goto('file:///home/user/Game/index.html');
await page.waitForTimeout(600);

// 1. map rendered?
const paths = await page.$$eval('#map path.country', els=>els.length);
console.log('country paths rendered:', paths);

// 2. start cards?
const cards = await page.$$eval('#startCards .natcard', els=>els.length);
console.log('start cards:', cards);

// 3. start game as USA
await page.click('.natcard[data-id]'); // pick first card
await page.click('#startBtn');
await page.waitForTimeout(300);
console.log('start overlay hidden:', await page.$eval('#startScreen', e=>e.style.display==='none'));
console.log('header:', (await page.$eval('#natHeader', e=>e.textContent)).slice(0,60).replace(/\s+/g,' ').trim());

// 4. unpause and advance ~2s of sim
await page.keyboard.press('3');
await page.waitForTimeout(2500);
const date = await page.$eval('#dateLbl', e=>e.textContent);
console.log('date after run:', date);
const qs = await page.$eval('#quickstats', e=>e.textContent.replace(/\s+/g,' ').trim());
console.log('quickstats:', qs.slice(0,120));

// 5. click each tab, ensure no crash + has content
const tabs = await page.$$eval('#tabs button', els=>els.map(e=>e.dataset.tab));
for(const t of tabs){
  await page.click(`#tabs button[data-tab="${t}"]`);
  await page.waitForTimeout(80);
  const len = await page.$eval('#tabBody', e=>e.textContent.length);
  console.log(`tab ${t}: ${len} chars`);
}

// 6. select a foreign country and check action panel
await page.evaluate(()=>{ const id=G.order.find(k=>G.nations[k].name==='France'); selectNation(id); });
await page.waitForTimeout(120);
const acts = await page.$$eval('#selPanel [data-act]', els=>els.map(e=>e.dataset.act));
console.log('france actions:', acts.join(','));

// 7. simulate a war to test combat/conquest path (force it)
await page.evaluate(()=>{
  const us=G.playerId; const mex=G.order.find(k=>G.nations[k].name==='Mexico');
  G.nations[us].mil.army=400; G.nations[us].mil.air=400;
  startWar(us,mex);
});
await page.waitForTimeout(2500);
const warstate = await page.evaluate(()=>({wars:G.wars.length, mexAlive:G.nations[G.order.find(k=>G.nations[k].name==='Mexico')].alive, terr:G.order.filter(k=>G.nations[k].owner===G.playerId).length}));
console.log('war test:', JSON.stringify(warstate));

await page.screenshot({path:'/home/user/Game/screenshot.png'});
console.log('--- ERRORS ('+errors.length+') ---');
errors.slice(0,30).forEach(e=>console.log(e));
await browser.close();
