const { chromium } = require('playwright-core');
(async () => {
  const b = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
  const p = await (await b.newContext({ viewport:{width:1440,height:950} })).newPage(); p.setDefaultTimeout(45000);
  let pkgStatus=null; p.on('response',r=>{if(r.url().includes('/packages')&&r.request().method()==='POST')pkgStatus=r.status()});
  const stamp=Date.now();
  await p.goto('http://localhost:3000/login',{waitUntil:'networkidle'});
  await p.getByRole('button',{name:/Umrah Operator \/ Agency/i}).first().click();
  await p.waitForURL(u=>!u.toString().includes('login'),{timeout:45000});
  // packages page
  await p.goto('http://localhost:3000/packages',{waitUntil:'networkidle'}); await p.waitForTimeout(1200);
  const has404 = await p.locator('text=/could not be found/i').first().isVisible().catch(()=>false);
  console.log((!has404?'✓':'✗')+' /packages route renders');
  const sidebarLink = await p.locator('aside >> text=Packages').first().isVisible().catch(()=>false);
  console.log((sidebarLink?'✓':'✗')+' Sidebar has Packages link');
  // create
  await p.getByRole('button',{name:/New package/i}).first().click(); await p.waitForTimeout(500);
  const pname='QA UI Package '+stamp;
  await p.getByPlaceholder('Premium 14-Night Umrah').fill(pname);
  await p.getByPlaceholder('12000').fill('9500');
  await p.getByRole('button',{name:/Create package/i}).click();
  await p.waitForTimeout(2500);
  console.log((pkgStatus&&pkgStatus<400?'✓':'✗')+' Package created via UI → '+pkgStatus);
  const inList = await p.locator('text='+JSON.stringify(pname)).first().isVisible().catch(()=>false);
  console.log((inList?'✓':'?')+' New package appears in list');
  // booking modal shows it
  await p.goto('http://localhost:3000/bookings',{waitUntil:'networkidle'}); await p.waitForTimeout(1200);
  await p.getByRole('button',{name:/New booking/i}).first().click(); await p.waitForTimeout(800);
  const opts = await p.$$eval('div.fixed select option', os=>os.map(o=>o.textContent||''));
  const found = opts.some(o=>o.includes('QA UI Package '+stamp));
  console.log((found?'✓':'?')+' New package selectable in New Booking modal');
  await b.close();
})();
