const { chromium } = require('playwright-core');
(async () => {
  const b = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
  const p = await (await b.newContext({ viewport:{width:1440,height:950} })).newPage(); p.setDefaultTimeout(45000);
  await p.goto('http://localhost:3000/login',{waitUntil:'networkidle'});
  // login copy honest?
  const overclaim = await p.getByText('SISKOPATUH visa integration',{exact:false}).count();
  const honest = await p.getByText(/SISKOPATUH-ready/i).count();
  console.log((overclaim===0?'✓':'✗')+' login page: no "visa integration" overclaim (found '+overclaim+'), honest copy present='+(honest>0));
  await p.getByRole('button',{name:/Visa Agency/i}).first().click();
  await p.waitForURL(u=>!u.toString().includes('login'),{timeout:45000});
  await p.goto('http://localhost:3000/compliance',{waitUntil:'networkidle'}); await p.waitForTimeout(1500);
  const planned = await p.getByText('PLANNED',{exact:true}).count();
  const greenIntegration = await p.getByText('Nusuk Integration',{exact:false}).count();
  console.log((planned>=4?'✓':'✗')+' compliance chips show PLANNED ×'+planned+' (want ≥4)');
  console.log((greenIntegration===0?'✓':'✗')+' no "Nusuk Integration" live-claim chip remains (found '+greenIntegration+')');
  await b.close();
})();
