const { chromium } = require('playwright-core');
const fs = require('fs');
(async () => {
  const gid = fs.readFileSync('/tmp/iid.txt','utf8').trim();
  const b = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
  const p = await (await b.newContext({ viewport:{width:1440,height:950} })).newPage(); p.setDefaultTimeout(45000);
  const errs=[]; p.on('console',m=>{if(m.type()==='error')errs.push(m.text().slice(0,120))}); p.on('pageerror',e=>errs.push('PE:'+e.message.slice(0,120)));
  await p.goto('http://localhost:3000/login',{waitUntil:'networkidle'});
  await p.getByRole('button',{name:/Umrah Operator \/ Agency/i}).first().click();
  await p.waitForURL(u=>!u.toString().includes('login'),{timeout:45000});
  await p.goto('http://localhost:3000/finance/'+gid,{waitUntil:'networkidle'}); await p.waitForTimeout(2000);
  console.log('URL:', p.url().replace('http://localhost:3000',''));
  const tabs = await p.$$eval('button', bs=>bs.map(x=>(x.textContent||'').trim()).filter(t=>/overview|payments|edit/i.test(t)));
  console.log('tab buttons:', JSON.stringify(tabs));
  console.log('errors:', errs.slice(0,4));
  console.log('body(0..300):', (await p.locator('body').innerText()).slice(0,300).replace(/\n+/g,' | '));
  await b.close();
})();
