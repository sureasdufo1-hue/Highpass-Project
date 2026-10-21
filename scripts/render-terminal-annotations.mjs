// Render annotation documents, never reconstruct or overwrite terminal originals.
import {chromium} from 'file:///C:/Users/user/AppData/Local/npm-cache/_npx/ef40dfadc1438043/node_modules/playwright/index.mjs';
import fs from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
const root=process.argv[2]||'C:/Users/user/Downloads/MediQ_리눅스터미널_증적_20261020';
const plan=JSON.parse(await fs.readFile(root+'/annotation-plan.json','utf8'));
const browser=await chromium.launch({headless:true,executablePath:'C:/Users/user/AppData/Local/ms-playwright/chromium_headless_shell-1248/chrome-headless-shell-win64/chrome-headless-shell.exe'});
try{
 const page=await browser.newPage({viewport:{width:1800,height:1000},deviceScaleFactor:1});
 const results=[];
 for(const p of plan){
  await page.goto(pathToFileURL(`${root}/editable/${p.slug}.html`).href);
  await page.evaluate(()=>document.fonts.ready);
  const quality=await page.evaluate(()=>({horizontalOverflow:document.documentElement.scrollWidth>innerWidth,imagesLoaded:[...document.images].every(i=>i.complete&&i.naturalWidth>0)}));
  if(quality.horizontalOverflow||!quality.imagesLoaded)throw Error('ANNOTATION_QA_'+p.slug);
  await page.screenshot({path:`${root}/annotated/${p.slug}.png`,fullPage:true});
  results.push({panel:p.slug,...quality});
 }
 await fs.writeFile(root+'/render-results.json',JSON.stringify(results,null,2));
 console.log(JSON.stringify({annotatedScreenshots:results.length}));
}finally{await browser.close();}
