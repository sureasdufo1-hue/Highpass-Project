import {chromium} from 'file:///C:/Users/user/AppData/Local/npm-cache/_npx/ef40dfadc1438043/node_modules/playwright/index.mjs';
import fs from 'node:fs/promises';
const folder='C:/Users/user/Documents/New project/output/playwright/security-detail-20261020';await fs.mkdir(folder,{recursive:true});
const browser=await chromium.launch({headless:true,executablePath:'C:/Users/user/AppData/Local/ms-playwright/chromium_headless_shell-1248/chrome-headless-shell-win64/chrome-headless-shell.exe'});
try{const page=await browser.newPage({viewport:{width:1440,height:1100}});const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('http://127.0.0.1:34892/');await page.getByText('기간 내 요청 1건',{exact:false}).waitFor({state:'attached'});
 for(const width of [1440,390]){await page.setViewportSize({width,height:1100});for(const [key,name]of [['helper','건강도우미 요청'],['qr','QR 생애주기'],['protection','보호 설정']]){await page.getByRole('tab',{name,exact:true}).click();if(key==='protection')await page.getByText('DB 접속 보호 · TLS 적용 확인',{exact:true}).waitFor();else await page.locator(`#sc-panel-${key} details summary`).first().click();const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth);if(overflow)throw Error('OVERFLOW_'+key+'_'+width);await page.screenshot({path:`${folder}/${key}-${width}.png`,fullPage:true});}}
 if(errors.length)throw Error(errors.join(','));console.log(JSON.stringify({screenshots:6,horizontalOverflow:false,pageErrors:errors}));
}finally{await browser.close();}
