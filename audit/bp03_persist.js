const { chromium } = require('playwright-core');
(async () => {
  const b = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
  const ctx = await b.newContext({ viewport: { width: 1440, height: 950 } });
  const p = await ctx.newPage(); p.setDefaultTimeout(45000);
  const base = 'http://localhost:3000';
  const writes = [];
  p.on('response', r => { const m = r.request().method(); if (r.url().includes('/proxy-api/pilgrims') && (m === 'PUT' || m === 'PATCH')) writes.push(m + ' ' + r.status()); });

  await p.goto(base + '/login', { waitUntil: 'networkidle' });
  await p.getByRole('button', { name: /Umrah Operator \/ Agency/i }).first().click();
  await p.waitForURL(u => !u.toString().includes('login'), { timeout: 45000 });

  await p.goto(base + '/pilgrims', { waitUntil: 'networkidle' }); await p.waitForTimeout(1500);

  // Open the EDIT modal on the first pilgrim row (pencil icon button, stopPropagation'd)
  const editBtn = p.locator('tbody tr').first().locator('button').nth(1); // [view, edit, archive]
  await editBtn.click(); await p.waitForTimeout(700);
  const modal = p.locator('div.fixed');
  const visible = await modal.getByText(/Edit pilgrim/i).first().isVisible().catch(() => false);
  console.log((visible ? '✓' : '✗') + ' Edit modal opened');

  // Read the pilgrim name so we can find the same row after reload
  const nameVal = await modal.locator('input').first().inputValue();

  // Pick a target status different from current via REAL selectOption
  const statusSelect = modal.locator('select').last(); // status select (gender is first)
  const current = await statusSelect.inputValue();
  const target = current === 'RETURNED' ? 'IN_KINGDOM' : 'RETURNED';
  await statusSelect.selectOption(target);
  console.log(`  status: ${current} → ${target} (real selectOption)`);

  // Save
  await modal.getByRole('button', { name: /Save|Update/i }).last().click();
  await p.waitForTimeout(2500);
  console.log((writes.length && writes.every(w => parseInt(w.split(' ')[1]) < 400) ? '✓' : '✗') + ' Write captured: ' + (writes.join(', ') || 'NONE'));

  // HARD RELOAD → verify persisted
  await p.goto(base + '/pilgrims', { waitUntil: 'networkidle' }); await p.waitForTimeout(1500);
  const row = p.locator('tbody tr').filter({ hasText: nameVal.split(' ')[0] }).first();
  const rowText = await row.innerText().catch(() => '');
  const persisted = rowText.toUpperCase().includes(target.replace(/_/g, ' ')) || rowText.toUpperCase().includes(target);
  console.log((persisted ? '✓' : '✗') + ` After hard reload, row shows "${target}" → persisted=${persisted}`);
  console.log('  row: ' + rowText.replace(/\n/g, ' | ').slice(0, 120));
  await b.close();
})();
