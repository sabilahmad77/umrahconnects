const { chromium } = require('playwright-core');
(async () => {
  const b = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
  const roles = {
    'Super Admin': /Super Admin/i, 'Umrah Operator': /Umrah Operator \/ Agency/i,
    'Hotel Owner': /Hotel Owner/i, 'Transport': /Transport Company/i,
    'Visa Agency': /Visa Agency/i, 'Finance': /Finance Manager/i, 'Pilgrim': /Pilgrim \/ Traveller/i,
  };
  const routes = ['/dashboard','/pilgrims','/bookings','/packages','/groups','/hotels','/transport','/compliance','/finance','/reports','/marketplace','/social','/connections','/requests','/admin-users','/admin-kyc','/hotel-dashboard','/transport-dashboard','/visa-dashboard','/finance-dashboard','/profile','/settings'];
  let totalCrash=0, total500=0;
  for (const [role, rx] of Object.entries(roles)) {
    const ctx = await b.newContext({ viewport:{width:1440,height:900} });
    const p = await ctx.newPage(); p.setDefaultTimeout(40000);
    const bad=[]; p.on('response',r=>{const m=r.request().method(); if(r.url().includes('/proxy-api')&&m!=='GET'&&r.status()>=500){total500++;bad.push(m+' '+r.url().split('/proxy-api')[1]+' '+r.status());}});
    try {
      await p.goto('http://localhost:3000/login',{waitUntil:'networkidle'});
      await p.getByRole('button',{name:rx}).first().click();
      await p.waitForURL(u=>!u.toString().includes('login'),{timeout:40000});
    } catch(e){ console.log('✗ '+role+' LOGIN FAIL'); await ctx.close(); continue; }
    let crash=[];
    for (const rt of routes) {
      await p.goto('http://localhost:3000'+rt,{waitUntil:'domcontentloaded'}).catch(()=>{});
      await p.waitForTimeout(500);
      const c=await p.locator('text=/Unhandled Runtime Error|Application error|client-side exception/i').first().isVisible().catch(()=>false);
      if(c){crash.push(rt);totalCrash++;}
    }
    console.log((crash.length?'⚠ ':'✓ ')+role+': '+(routes.length-crash.length)+'/'+routes.length+' clean'+(crash.length?' CRASH:'+crash.join(','):''));
    await ctx.close();
  }
  console.log('\nTOTALS — crashes: '+totalCrash+' | server 500s: '+total500);
  await b.close();
})();
