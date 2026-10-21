// Document rendering only: original observations and editable annotation layers.
import {chromium} from 'file:///C:/Users/user/AppData/Local/npm-cache/_npx/ef40dfadc1438043/node_modules/playwright/index.mjs';
import fs from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
const root='C:/Users/user/Downloads/MediQ_관제증적_20261020';
const plan=JSON.parse(await fs.readFile(root+'/capture-plan.json','utf8'));
const browser=await chromium.launch({headless:true,executablePath:'C:/Users/user/AppData/Local/ms-playwright/chromium_headless_shell-1248/chrome-headless-shell-win64/chrome-headless-shell.exe'});
try{
 const page=await browser.newPage({viewport:{width:1680,height:1050},deviceScaleFactor:1});
 const results=[];
 for(const p of plan)for(const mode of ['original','annotated']){
  await page.goto(pathToFileURL(`${root}/${mode}/${p.slug}.html`).href);
  await page.evaluate(()=>document.fonts.ready);
  const box=await page.locator('body').boundingBox();
  const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth);
  if(overflow)throw Error('HORIZONTAL_OVERFLOW_'+p.slug);
  await page.screenshot({path:`${root}/${mode}/${p.slug}.png`,fullPage:true});
  results.push({file:`${mode}/${p.slug}.png`,height:box.height,horizontalOverflow:overflow});
 }
 await fs.writeFile(root+'/render-results.json',JSON.stringify(results,null,2));
 console.log(JSON.stringify({screenshots:results.length,maxHeight:Math.max(...results.map(x=>x.height))}));
}finally{await browser.close();}
