/**
 * A05 browser acceptance: social, comments/replies, likes/saves, notifications,
 * connections, messages and groups — end to end through the real web UI.
 * One browser context per identity; every identity signs in through /login.
 * Usage: BASE=http://localhost:3405 DEMO_PASSWORD=... OUT=<dir> node acceptance.js
 * Evidence is sanitized: identities are labels, requests are method + path + status.
 */
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright-core');

const BASE = process.env.BASE || 'http://localhost:3405';
const PASSWORD = process.env.DEMO_PASSWORD;
const OUT = process.env.OUT || path.join(process.cwd(), 'out');
const ACCOUNTS = {
  travelerA: 'traveler@umrahconnect.dev',
  travelerB: 'traveler.b@umrahconnect.dev',
  operator: 'admin@alharamain.sa',
};
if (!PASSWORD) throw new Error('Set DEMO_PASSWORD');
fs.mkdirSync(OUT, { recursive: true });

const results = [];
const requests = [];
const stamp = Date.now().toString(36);

async function step(name, fn) {
  try {
    const detail = await fn();
    results.push({ step: name, ok: true, ...(detail ? { detail } : {}) });
    console.log(`PASS  ${name}${detail ? ` — ${typeof detail === 'string' ? detail : JSON.stringify(detail)}` : ''}`);
  } catch (e) {
    results.push({ step: name, ok: false, error: String(e && e.message).split('\n')[0].slice(0, 300) });
    console.log(`FAIL  ${name} — ${String(e && e.message).split('\n')[0]}`);
  }
}
const expect = (cond, msg) => {
  if (!cond) throw new Error(msg);
};
const shot = (page, name) => page.screenshot({ path: path.join(OUT, `${name}.png` ) });

async function signIn(browser, label) {
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 950 } });
  await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: BASE });
  const page = await ctx.newPage();
  page.setDefaultTimeout(45000);
  page.on('dialog', (d) => d.accept());
  page.on('response', (r) => {
    const u = r.url();
    if (u.includes('/proxy-api/') && !u.includes('/auth/')) {
      requests.push(`${label} ${r.request().method()} ${u.replace(BASE, '').replace(/\?.*$/, '')} ${r.status()}`);
    }
  });
  page.on('pageerror', (e) => requests.push(`${label} pageerror ${String(e).slice(0, 160)}`));
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
  // Type only once React has hydrated the form (a freshly compiled page may not have).
  await page.waitForFunction(() => {
    const el = document.querySelector('#signin-email');
    return !!el && Object.keys(el).some((k) => k.startsWith('__reactProps'));
  }, null, { timeout: 120000 });
  await page.fill('#signin-email', ACCOUNTS[label]);
  await page.fill('#signin-password', PASSWORD);
  const submit = page.getByRole('button', { name: /^Sign in$/ });
  await submit.click();
  await page.waitForURL((u) => !u.toString().includes('/login'), { timeout: 120000, waitUntil: 'commit' });
  await page.waitForLoadState('networkidle').catch(() => {});
  return { ctx, page };
}

const postCard = (page, id) => page.locator(`article[data-post-id="${id}"]`);
const waitApi = (page, method, fragment) =>
  page.waitForResponse((r) => r.request().method() === method && r.url().includes(fragment), { timeout: 45000 });

(async () => {
  const browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
  const A = await signIn(browser, 'travelerA');
  const B = await signIn(browser, 'travelerB');
  const O = await signIn(browser, 'operator');
  const a = A.page, b = B.page, o = O.page;
  let postId, commentA1, commentA2;
  const text = `Browser acceptance ${stamp}: first night in Makkah #umrah #a05${stamp}`;

  // ── Posts ──────────────────────────────────────────────────────────────
  await step('A creates a public post from the composer', async () => {
    await a.goto(`${BASE}/social`, { waitUntil: 'networkidle' });
    await a.getByLabel('Write a post').fill(text);
    const res = waitApi(a, 'POST', '/proxy-api/social/posts');
    await a.getByRole('button', { name: 'Post', exact: true }).click();
    const r = await res;
    expect(r.status() === 201, `create → ${r.status()}`);
    postId = (await r.json()).data.id;
    const card = postCard(a, postId);
    await card.waitFor();
    const author = await card.locator('header p').first().innerText();
    expect(author === 'Yusuf Traveler', `author shown as "${author}"`);
    await shot(a, '01-traveler-a-post-created');
    return `post created, author "${author}" (was "User" before the fix)`;
  });

  // ── Comments (the reported defect) ─────────────────────────────────────
  await step('A adds two comments; both appear immediately and after refresh', async () => {
    const card = postCard(a, postId);
    await card.getByRole('button', { name: 'Comment', exact: true }).click();
    for (const body of ['First comment from A', 'Second comment from A']) {
      await card.getByLabel('Write a comment').fill(body);
      const res = waitApi(a, 'POST', `/social/posts/${postId}/comments`);
      await card.getByRole('button', { name: 'Post comment' }).click();
      const r = await res;
      expect(r.status() === 201, `comment → ${r.status()}`);
      const id = (await r.json()).data.id;
      if (!commentA1) commentA1 = id;
      else commentA2 = id;
      await card.locator(`li[data-comment-id="${id}"]`).waitFor();
    }
    await a.reload({ waitUntil: 'networkidle' });
    const again = postCard(a, postId);
    await again.getByRole('button', { name: 'Comment', exact: true }).click();
    await again.locator(`li[data-comment-id="${commentA2}"]`).waitFor();
    await again.locator(`li[data-comment-id="${commentA1}"]`).waitFor();
    const summary = await again.getByRole('button', { name: /comments?$/ }).first().innerText();
    expect(summary === '2 comments', `summary "${summary}"`);
    await shot(a, '02-traveler-a-two-comments-after-refresh');
    return summary;
  });

  // ── Traveler B: sees, replies, likes, saves; cannot edit/delete ────────
  await step('B sees A\'s public post and is offered no edit/delete on it', async () => {
    await b.goto(`${BASE}/social`, { waitUntil: 'networkidle' });
    const card = postCard(b, postId);
    await card.waitFor();
    await card.getByRole('button', { name: 'Post options' }).click();
    const items = await b.getByRole('menuitem').allInnerTexts();
    await b.keyboard.press('Escape');
    expect(items.map((s) => s.trim()).join('|') === 'Copy link', `menu offers ${JSON.stringify(items)}`);
    await card.getByRole('button', { name: 'Comment', exact: true }).click();
    const c1 = card.locator(`li[data-comment-id="${commentA1}"]`);
    await c1.waitFor();
    const actions = await c1.innerText();
    expect(!/\bEdit\b/.test(actions) && !/\bDelete\b/.test(actions), 'B is offered edit/delete on A\'s comment');
    return `menu: ${items.join(', ')}; A's comment offers Reply only`;
  });

  await step('B replies to A\'s comment; the reply shows in the thread', async () => {
    const card = postCard(b, postId);
    const c1 = card.locator(`li[data-comment-id="${commentA1}"]`);
    await c1.getByRole('button', { name: 'Reply' }).click();
    await c1.getByLabel('Write a reply').fill('Reply from B: welcome!');
    const res = waitApi(b, 'POST', `/social/posts/${postId}/comments`);
    await c1.getByRole('button', { name: 'Post reply' }).click();
    const r = await res;
    const body = await r.json();
    expect(r.status() === 201 && body.data.parentId === commentA1, `reply → ${r.status()} parent ${body.data.parentId}`);
    await c1.getByText('Reply from B: welcome!').waitFor();
    await shot(b, '03-traveler-b-reply-in-thread');
    return 'reply attached to the comment';
  });

  await step('B likes and saves the post; state and counts persist after refresh', async () => {
    const card = postCard(b, postId);
    const like = waitApi(b, 'POST', `/social/posts/${postId}/react`);
    await card.getByRole('button', { name: 'Like', exact: true }).click();
    expect((await like).status() === 201, 'like failed');
    const save = waitApi(b, 'POST', `/social/posts/${postId}/save`);
    await card.getByRole('button', { name: 'Save post' }).click();
    expect((await save).status() === 201, 'save failed');
    await b.reload({ waitUntil: 'networkidle' });
    const after = postCard(b, postId);
    await after.waitFor();
    const liked = await after.getByRole('button', { name: 'Unlike' }).getAttribute('aria-pressed');
    const saved = await after.getByRole('button', { name: 'Unsave post' }).getAttribute('aria-pressed');
    const counts = (await after.innerText()).match(/\d+ likes?|\d+ comments?/g);
    expect(liked === 'true' && saved === 'true', `liked=${liked} saved=${saved}`);
    await b.getByRole('tab', { name: 'Saved' }).click();
    await postCard(b, postId).waitFor();
    await shot(b, '04-traveler-b-saved-tab');
    return `after refresh: liked, saved, ${counts?.join(', ')}; post listed under Saved`;
  });

  // ── A: edit post, edit/delete own comment, notifications ───────────────
  await step('A edits the post and a comment, deletes a comment; counts follow', async () => {
    await a.goto(`${BASE}/social`, { waitUntil: 'networkidle' });
    const card = postCard(a, postId);
    await card.getByRole('button', { name: 'Post options' }).click();
    await a.getByRole('menuitem', { name: 'Edit post' }).click();
    await card.getByLabel('Edit post').fill(`${text} (edited)`);
    const put = waitApi(a, 'PUT', `/social/posts/${postId}`);
    await card.getByRole('button', { name: 'Save changes' }).click();
    expect((await put).status() === 200, 'post edit failed');
    await card.getByText('· Edited').waitFor();

    await card.getByRole('button', { name: 'Comment', exact: true }).click();
    const c1 = card.locator(`li[data-comment-id="${commentA1}"]`);
    await c1.getByRole('button', { name: 'Edit' }).click();
    await c1.getByLabel('Edit comment').fill('First comment from A (edited)');
    const putC = waitApi(a, 'PUT', `/comments/${commentA1}`);
    await c1.getByRole('button', { name: 'Save', exact: true }).click();
    expect((await putC).status() === 200, 'comment edit failed');
    await c1.getByText('First comment from A (edited)').waitFor();

    const c2 = card.locator(`li[data-comment-id="${commentA2}"]`);
    const del = waitApi(a, 'DELETE', `/comments/${commentA2}`);
    await c2.getByRole('button', { name: 'Delete' }).click();
    expect((await del).status() === 200, 'comment delete failed');
    await c2.waitFor({ state: 'detached' });
    await a.reload({ waitUntil: 'networkidle' });
    const after = postCard(a, postId);
    const txt = await after.innerText();
    expect(/Edited/.test(txt) && /2 comments/.test(txt) && /1 like/.test(txt), `after refresh: ${txt.replace(/\n/g, ' | ').slice(0, 200)}`);
    await after.getByRole('button', { name: 'Comment', exact: true }).click();
    await after.getByText('First comment from A (edited)').waitFor();
    await after.getByText('View 1 reply').click();
    await after.getByText('Reply from B: welcome!').waitFor();
    await shot(a, '05-traveler-a-after-edit-delete-refresh');
    return 'post edited, comment edited, comment deleted; 2 comments (1 + reply), 1 like after refresh';
  });

  await step('A is notified of B\'s reply and like; opening goes to the post; mark all read persists', async () => {
    await a.goto(`${BASE}/notifications`, { waitUntil: 'networkidle' });
    const list = a.locator('li[data-notification-id]');
    await list.first().waitFor();
    const titles = await list.allInnerTexts();
    expect(titles.some((t) => /Bilal TravelerB replied to your comment/.test(t)), 'no reply notification');
    expect(titles.some((t) => /Bilal TravelerB liked your post/.test(t)), 'no like notification');
    await shot(a, '06-traveler-a-notifications');
    const reply = list.filter({ hasText: 'replied to your comment' }).first();
    await reply.getByRole('button', { name: 'Open' }).click();
    await a.waitForURL((u) => u.toString().includes(`/social?post=${postId}`));
    await postCard(a, postId).waitFor();
    await a.goto(`${BASE}/notifications`, { waitUntil: 'networkidle' });
    await a.getByRole('button', { name: 'Mark all as read' }).click();
    await a.getByText('You are all caught up.').waitFor();
    await a.reload({ waitUntil: 'networkidle' });
    await a.getByText('You are all caught up.').waitFor();
    const bell = await a.getByRole('button', { name: /^Notifications/ }).first().getAttribute('aria-label');
    expect(bell === 'Notifications', `bell says "${bell}"`);
    return `${titles.length} notifications; opened the reply → /social?post=…; all read after refresh; bell "${bell}"`;
  });

  // ── Connections and messages ───────────────────────────────────────────
  await step('B removes an existing connection with A (repeatable runs), through the UI', async () => {
    await b.goto(`${BASE}/connections`, { waitUntil: 'networkidle' });
    const existing = b.getByRole('button', { name: 'Remove Yusuf Traveler' });
    if (!(await existing.count())) return 'no existing connection';
    const del = waitApi(b, 'DELETE', '/proxy-api/connections/with/');
    await existing.click();
    expect((await del).status() === 200, 'remove failed');
    await b.locator('section[aria-labelledby="connected-title"]').getByText('Yusuf Traveler').waitFor({ state: 'detached' });
    return 'connection removed';
  });

  await step('A sends B a connection request from Discover; B accepts', async () => {
    await a.goto(`${BASE}/discover`, { waitUntil: 'networkidle' });
    await a.getByLabel('Search people by name or city').fill('Bilal');
    const card = a.locator('div.rounded-xl', { hasText: 'Bilal TravelerB' }).last();
    await card.getByRole('button', { name: 'Connect' }).click();
    await card.getByText('Request sent').waitFor();
    await b.goto(`${BASE}/connections`, { waitUntil: 'networkidle' });
    const req = b.locator('li', { hasText: 'Yusuf Traveler' }).first();
    await req.getByRole('button', { name: 'Accept' }).click();
    await b.locator('section[aria-labelledby="connected-title"]').getByText('Yusuf Traveler').waitFor();
    await shot(b, '07-traveler-b-connected');
    return 'request sent → accepted → listed under My connections';
  });

  await step('B messages A from Connections; A reads it from the notification and replies', async () => {
    await b.getByRole('button', { name: 'Message Yusuf Traveler' }).click();
    await b.waitForURL((u) => u.toString().includes('/messages?c='));
    await b.getByLabel('Type a message').fill(`Salam from B ${stamp}`);
    await b.getByRole('button', { name: 'Send' }).click();
    const chatB = b.locator('section[aria-label="Conversation"]');
    await chatB.getByText(`Salam from B ${stamp}`).waitFor();
    await a.goto(`${BASE}/notifications`, { waitUntil: 'networkidle' });
    const msg = a.locator('li[data-notification-id]', { hasText: 'New message from Bilal TravelerB' }).first();
    await msg.getByRole('button', { name: 'Open' }).click();
    await a.waitForURL((u) => u.toString().includes('/messages?c='));
    const chatA = a.locator('section[aria-label="Conversation"]');
    await chatA.getByText(`Salam from B ${stamp}`).waitFor();
    await a.getByLabel('Type a message').fill(`Wa alaykum salam from A ${stamp}`);
    await a.getByRole('button', { name: 'Send' }).click();
    await chatA.getByText(`Wa alaykum salam from A ${stamp}`).waitFor();
    await b.reload({ waitUntil: 'networkidle' });
    await b.locator('section[aria-label="Conversation"]').getByText(`Wa alaykum salam from A ${stamp}`).waitFor();
    await shot(b, '08-traveler-b-conversation');
    return 'message delivered both ways, notification opened the conversation';
  });

  // ── Groups ─────────────────────────────────────────────────────────────
  const groupName = `A05 Browser Group ${stamp}`;
  let groupId;
  await step('Operator creates a private group, invites traveler A, posts (pinned) and opens a poll', async () => {
    await o.goto(`${BASE}/groups`, { waitUntil: 'networkidle' });
    await o.getByRole('button', { name: 'New group' }).click();
    await o.getByPlaceholder('Ramadan 2026 — Group A').fill(groupName);
    const create = waitApi(o, 'POST', '/proxy-api/groups');
    await o.getByRole('button', { name: 'Create group' }).click();
    const r = await create;
    expect(r.status() === 201, `create group → ${r.status()}`);
    groupId = (await r.json()).data.id;
    await o.goto(`${BASE}/groups/${groupId}`, { waitUntil: 'networkidle' });
    await o.getByRole('tab', { name: 'Members' }).click();
    await o.getByLabel('Invitee email').fill(ACCOUNTS.travelerA);
    await o.getByLabel('Invitation message (optional)').fill('Welcome to the group');
    await o.getByRole('button', { name: 'Invite' }).click();
    await o.getByText('pending', { exact: true }).waitFor();
    await o.getByRole('tab', { name: 'Discussion' }).click();
    await o.getByLabel('Write to the group').fill('Bus leaves the hotel at 06:00');
    await o.getByLabel('Pin to the top').check();
    await o.getByRole('button', { name: 'Post', exact: true }).click();
    await o.getByText('Bus leaves the hotel at 06:00').waitFor();
    await o.getByRole('tab', { name: 'Polls' }).click();
    await o.getByLabel('Poll question').fill('Which time suits you for Ziyarah?');
    await o.getByLabel('Poll options, one per line').fill('After Fajr\nAfter Asr');
    await o.getByRole('button', { name: 'Create poll' }).click();
    await o.getByText('Which time suits you for Ziyarah?').waitFor();
    await shot(o, '09-operator-group-poll');
    return 'group created; invite pending; pinned post; poll open';
  });

  await step('Traveler A accepts the invitation, joins the discussion and votes (then changes the vote)', async () => {
    await a.goto(`${BASE}/social/groups`, { waitUntil: 'networkidle' });
    const inv = a.locator('li', { hasText: groupName }).first();
    await inv.getByRole('button', { name: 'Accept' }).click();
    await a.locator('section[aria-labelledby="mine-title"]').getByText(groupName).waitFor();
    await a.goto(`${BASE}/social/groups/${groupId}`, { waitUntil: 'networkidle' });
    await a.getByText('Bus leaves the hotel at 06:00').waitFor();
    const post = a.locator('li[data-group-post-id]', { hasText: 'Bus leaves' }).first();
    await post.getByRole('button', { name: 'Comment' }).click();
    await post.getByLabel('Write a comment').fill('I will be in the lobby at 05:45');
    await post.getByRole('button', { name: 'Send' }).click();
    await post.getByText('I will be in the lobby at 05:45').waitFor();
    await a.getByRole('tab', { name: 'Polls' }).click();
    const poll = a.locator('li[data-poll-id]', { hasText: 'Ziyarah' });
    await poll.getByRole('button', { name: /After Fajr/ }).click();
    await poll.getByText('Choose another option to change your vote.').waitFor();
    await poll.getByRole('button', { name: /After Asr/ }).click();
    await poll.locator('button[aria-pressed="true"]', { hasText: 'After Asr' }).waitFor();
    await a.reload({ waitUntil: 'networkidle' });
    await a.getByRole('tab', { name: 'Polls' }).click();
    const pressed = await a.locator('li[data-poll-id] button[aria-pressed="true"]').innerText();
    expect(/After Asr/.test(pressed), `vote after refresh: ${pressed}`);
    await shot(a, '10-traveler-a-group-poll-voted');
    return 'invite accepted; commented; voted Fajr → changed to Asr; persisted after refresh';
  });

  await step('Operator sees the tally (1 voter), closes the poll; the traveler can no longer vote', async () => {
    await o.reload({ waitUntil: 'networkidle' });
    await o.getByRole('tab', { name: 'Polls' }).click();
    const poll = o.locator('li[data-poll-id]', { hasText: 'Ziyarah' });
    await poll.getByText('1 voter').waitFor();
    await poll.getByRole('button', { name: 'Close poll' }).click();
    await poll.getByText('Closed').waitFor();
    await a.reload({ waitUntil: 'networkidle' });
    await a.getByRole('tab', { name: 'Polls' }).click();
    const disabled = await a.locator('li[data-poll-id] button', { hasText: 'After Fajr' }).isDisabled();
    expect(disabled, 'closed poll still votable');
    return 'closed; options disabled for the traveler';
  });

  await step('Operator reports and resolves an incident; traveler A leaves the group', async () => {
    await o.getByRole('tab', { name: 'Incidents' }).click();
    await o.getByLabel('What happened').fill('Pilgrim felt dizzy during Tawaf');
    await o.getByRole('button', { name: 'Report incident' }).click();
    await o.getByText('Pilgrim felt dizzy during Tawaf').waitFor();
    await o.getByRole('button', { name: 'Mark resolved' }).click();
    await o.getByLabel('How was it resolved?').fill('Rested and rehydrated; fine');
    await o.getByRole('button', { name: 'Save resolution' }).click();
    await o.locator('li span', { hasText: /Resolved \d/ }).first().waitFor();
    await shot(o, '11-operator-incident-resolved');
    await a.goto(`${BASE}/social/groups/${groupId}`, { waitUntil: 'networkidle' });
    await a.getByRole('button', { name: 'Leave group' }).click();
    await a.waitForURL((u) => u.toString().endsWith('/social/groups'));
    await a.waitForLoadState('networkidle');
    const stillListed = await a.locator('section[aria-labelledby="mine-title"]').getByText(groupName).count();
    expect(stillListed === 0, 'group still in My groups');
    return 'incident reported and resolved; traveler left (removed from My groups)';
  });

  // ── Photos and paging ──────────────────────────────────────────────────
  await step('A attaches a photo (real upload) and publishes an image post', async () => {
    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
    await a.goto(`${BASE}/social`, { waitUntil: 'networkidle' });
    const upload = waitApi(a, 'POST', '/proxy-api/uploads');
    await a.getByLabel('Attach photos').setInputFiles({ name: 'kaaba.png', mimeType: 'image/png', buffer: png });
    const up = await upload;
    expect(up.status() === 201, `upload → ${up.status()}`);
    const url = (await up.json()).data.url;
    await a.getByRole('list', { name: 'Attached photos' }).locator('img').waitFor();
    await a.getByLabel('Write a post').fill(`Photo from the Haram ${stamp}`);
    const res = waitApi(a, 'POST', '/proxy-api/social/posts');
    await a.getByRole('button', { name: 'Post', exact: true }).click();
    const r = await res;
    const created = (await r.json()).data;
    expect(r.status() === 201 && created.mediaUrls[0] === url, `post media ${JSON.stringify(created.mediaUrls)}`);
    const img = postCard(a, created.id).locator('img');
    await img.waitFor();
    const loaded = await img.evaluate((el) => el.complete && el.naturalWidth > 0);
    expect(loaded, 'image did not render');
    await shot(a, '12-traveler-a-photo-post');
    return `uploaded ${url.replace(/[^/]+$/, '<file>')} and rendered in the post`;
  });

  await step('Comments page: 11 comments show 10 plus "View 1 more comment", which loads the rest', async () => {
    await a.goto(`${BASE}/social`, { waitUntil: 'networkidle' });
    await a.getByLabel('Write a post').fill(`Paging check ${stamp}`);
    const res = waitApi(a, 'POST', '/proxy-api/social/posts');
    await a.getByRole('button', { name: 'Post', exact: true }).click();
    const id = (await (await res).json()).data.id;
    const card = postCard(a, id);
    await card.getByRole('button', { name: 'Comment', exact: true }).click();
    for (let i = 1; i <= 11; i++) {
      await card.getByLabel('Write a comment').fill(`Paging comment ${i}`);
      const c = waitApi(a, 'POST', `/social/posts/${id}/comments`);
      await card.getByRole('button', { name: 'Post comment' }).click();
      await c;
    }
    await a.reload({ waitUntil: 'networkidle' });
    const again = postCard(a, id);
    await again.getByRole('button', { name: 'Comment', exact: true }).click();
    await again.locator('li[data-comment-id]').nth(9).waitFor();
    const first = await again.locator('li[data-comment-id]').count();
    await again.getByRole('button', { name: 'View 1 more comment' }).click();
    await again.getByText('Paging comment 1', { exact: true }).waitFor();
    const all = await again.locator('li[data-comment-id]').count();
    expect(first === 10 && all === 11, `first page ${first}, after load more ${all}`);
    const summary = await again.getByRole('button', { name: /comments?$/ }).first().innerText();
    await shot(a, '13-traveler-a-comments-load-more');
    return `first page ${first}, after "View 1 more comment" ${all}; summary "${summary}"`;
  });

  // ── Cleanup of the post: delete own post ───────────────────────────────
  await step('A deletes the post; it disappears for A and B after refresh', async () => {
    await a.goto(`${BASE}/social`, { waitUntil: 'networkidle' });
    const card = postCard(a, postId);
    await card.getByRole('button', { name: 'Post options' }).click();
    const del = waitApi(a, 'DELETE', `/social/posts/${postId}`);
    await a.getByRole('menuitem', { name: 'Delete post' }).click();
    expect((await del).status() === 200, 'delete failed');
    await card.waitFor({ state: 'detached' });
    await b.goto(`${BASE}/social`, { waitUntil: 'networkidle' });
    expect((await postCard(b, postId).count()) === 0, 'B still sees the deleted post');
    await b.goto(`${BASE}/social?post=${postId}`, { waitUntil: 'networkidle' });
    await b.getByText('This post is not available').waitFor();
    return 'deleted; B sees "This post is not available" on the old link';
  });

  fs.writeFileSync(path.join(OUT, 'browser-acceptance.json'), JSON.stringify({ base: BASE, runId: stamp, results, requests }, null, 2));
  const failed = results.filter((r) => !r.ok).length;
  console.log(`\n${results.length - failed}/${results.length} steps passed`);
  await browser.close();
  process.exit(failed ? 1 : 0);
})().catch((e) => {
  console.error('FATAL', e);
  process.exit(2);
});
