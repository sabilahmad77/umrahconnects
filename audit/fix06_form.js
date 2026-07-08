const { chromium } = require('playwright-core');
const fs = require('fs');
(async () => {
  const gid = fs.readFileSync('/tmp/iid.txt','utf8').trim();
  const b = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
  const p = await (await b.newContext({ viewport:{width:1440,height:950} })).newPage(); p.setDefaultTimeout(45000);
  let payStatus=null; p.on('response',r=>{if(r.url().includes('/payments')&&r.request().method()==='POST')payStatus=r.status()});
  await p.goto('http://localhost:3000/login',{waitUntil:'networkidle'});
  await p.getByRole('button',{name:/Umrah Operator \/ Agency/i}).first().click();
  await p.waitForURL(u=>!u.toString().includes('login'),{timeout:45000});
  await p.goto('http://localhost:3000/finance/invoices/'+gid,{waitUntil:'networkidle'}); await p.waitForTimeout(1500);
  await p.getByRole('button',{name:/^payments$/i}).first().click().catch(()=>{});
  await p.waitForTimeout(800);
  const form=await p.getByText(/Record a payment/i).first().isVisible().catch(()=>false);
  console.log((form?'✓':'✗')+' Record-payment form present on Payments tab');
  const rec=p.getByRole('button',{name:/^Record$/i}).first();
  if(await rec.isVisible().catch(()=>false)){
    await p.locator('input[type=number]').first().fill('10');
    await rec.click(); await p.waitForTimeout(2500);
    console.log((payStatus&&payStatus<400?'✓':'✗')+' Payment recorded via form → '+payStatus);
    console.log('  history rows: '+(await p.locator('table tbody tr').count()));
  } else console.log('  invoice settled — settled message shown');
  await b.close();
})();
