import {test, expect, type Page, type Browser, type Download} from '@playwright/test';

const passphrase = 'a private learning room 2026';
const filePassphrase = 'only this selected exchange 2026';
const briefTitle = 'Balanced forces together';

async function createRoom(page: Page) {
  await page.goto('/');
  await page.getByRole('button', {name: 'Create your room', exact: true}).click();
  await page.getByLabel('Passphrase', {exact: true}).fill(passphrase);
  await page.getByLabel('Confirm passphrase', {exact: true}).fill(passphrase);
  await page.getByRole('button', {name: 'Create & start learning', exact: true}).click();
  await expect(page.getByRole('heading', {name: 'Follow your curiosity.'})).toBeVisible();
}
async function education(page: Page) {
  await page.getByRole('button', {name: 'Learning briefs', exact: true}).click();
  await expect(page.getByRole('button', {name: 'New brief', exact: true})).toBeVisible();
}
async function newBrief(page: Page, title = briefTitle) {
  await education(page);
  await page.getByRole('button', {name: 'New brief', exact: true}).click();
  await page.getByLabel('Brief title', {exact: true}).fill(title);
  await page.getByLabel('Learning goal', {exact: true}).fill('Explain why a book stays on a desk.');
  await page.getByLabel('Practice task', {exact: true}).fill('Name the forces and describe their directions.');
  await page.getByLabel('Worked example', {exact: true}).fill('An object at rest has zero net force.');
  await page.getByLabel('Success checks', {exact: true}).fill('Name both forces\nExplain zero net force');
  await page.getByLabel('Language', {exact: true}).fill('en');
  await page.getByRole('button', {name: 'Save brief', exact: true}).click();
  await openBrief(page, title, 1);
}
async function openBrief(page: Page, title = briefTitle, version = 1) {
  const versionPicker=page.getByLabel('Brief version',{exact:true});
  const card=page.getByRole('button',{name:`Open brief ${title} v${version}`,exact:true});
  if(await versionPicker.count()&&!(await card.count()))await versionPicker.selectOption(String(version));else await card.click();
  await expect(page.getByLabel('My attempt', {exact: true})).toBeVisible();
}
async function saveAttempt(page: Page, answer = 'Gravity pulls down and the desk pushes up.') {
  await page.getByLabel('My attempt', {exact: true}).fill(answer);
  await page.getByLabel('Question for feedback', {exact: true}).fill('How should I draw the force arrows?');
  await page.getByLabel('My private next action', {exact: true}).fill('PRIVATE_NEXT_ACTION_CANARY');
  await page.getByLabel('Review on', {exact: true}).fill('2026-10-29');
  await page.getByRole('button', {name: /^(Save private attempt|Save new revision)$/}).click();
  await expect(page.getByRole('button', {name: 'Save new revision', exact: true})).toBeVisible();
  await expect(page.getByRole('status').filter({hasText: /Saved/}).first()).toBeVisible();
}
async function downloadBytes(download: Download): Promise<Buffer> {
  const stream = await download.createReadStream();
  if (!stream) throw new Error('Selected exchange download stream is unavailable.');
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks);
}
async function selectedDownload(page: Page, mode: 'plain' | 'encrypted', recipient: string) {
  const dialog = page.getByRole('dialog', {name: 'Review selected text', exact: true});
  await expect(dialog).toBeVisible();
  await dialog.getByLabel('Intended recipient', {exact: true}).fill(recipient);
  await dialog.getByLabel('Sharing protection', {exact: true}).selectOption(mode);
  if (mode === 'encrypted') {
    await dialog.getByLabel('New file passphrase', {exact: true}).fill(filePassphrase);
    await dialog.getByLabel('Confirm file passphrase', {exact: true}).fill(filePassphrase);
  }
  await dialog.getByRole('button', {name: 'Preview selected text', exact: true}).click();
  const preview = await dialog.getByLabel('Selected text preview', {exact: true}).textContent();
  await dialog.getByLabel('I reviewed the selected text and intended recipient', {exact: true}).check();
  const pending = page.waitForEvent('download');
  await dialog.getByRole('button', {name: 'Download selected text', exact: true}).click();
  const download = await pending;
  const bytes = await downloadBytes(download);
  await expect(dialog).toHaveCount(0);
  return {bytes, preview, name: download.suggestedFilename()};
}
async function importFile(page: Page, bytes: Buffer, encrypted = false) {
  await page.getByRole('button', {name: 'Import selected text', exact: true}).click();
  await page.getByLabel('Import learning exchange', {exact: true}).setInputFiles({name: encrypted ? 'selected.olr.json' : 'selected.json', mimeType: 'application/json', buffer: bytes});
  const dialog = page.getByRole('dialog', {name: 'Review imported text', exact: true});
  await expect(dialog).toBeVisible();
  if (encrypted) await dialog.getByLabel('File passphrase', {exact: true}).fill(filePassphrase);
  await dialog.getByRole('button', {name: 'Preview import', exact: true}).click();
  return dialog;
}
async function isolatedPage(browser: Browser) {
  const use = test.info().project.use;
  const context = await browser.newContext({baseURL: use.baseURL, viewport: use.viewport, userAgent: use.userAgent, deviceScaleFactor: use.deviceScaleFactor, isMobile: use.isMobile, hasTouch: use.hasTouch});
  const page = await context.newPage();
  await createRoom(page);
  await education(page);
  return {context, page};
}
async function closeIfOpen(page: Page) {
  const dialog = page.getByRole('dialog');
  if (await dialog.count()) await dialog.getByRole('button', {name: 'Close dialog', exact: true}).click();
}

test('learning briefs preserve private revisions through lock and unlock', async ({page}) => {
  await createRoom(page); await newBrief(page);
  await saveAttempt(page, 'ORIGINAL_ANSWER_HISTORY_CANARY');
  await saveAttempt(page, 'Revised explanation: the two forces balance.');
  await page.getByRole('button', {name: 'Lock room', exact: true}).click();
  await expect(page.getByRole('heading', {name: 'Unlock your room'})).toBeVisible();
  expect(await page.locator('body').innerText()).not.toContain('ORIGINAL_ANSWER_HISTORY_CANARY');
  await page.getByLabel('Passphrase', {exact: true}).fill(passphrase);
  await page.getByRole('button', {name: 'Unlock & start learning', exact: true}).click();
  await education(page); await openBrief(page);
  await expect(page.getByLabel('My attempt', {exact: true})).toHaveValue('Revised explanation: the two forces balance.');
  await page.getByText('Saved attempt history',{exact:true}).click();
  await expect(page.getByText('Revision 1', {exact: true})).toBeVisible();
  await expect(page.getByText('ORIGINAL_ANSWER_HISTORY_CANARY', {exact: true})).toBeVisible();
  await expect(page.getByLabel('My private next action', {exact: true})).toHaveValue('PRIVATE_NEXT_ACTION_CANARY');
});

test('plain selected submission matches its preview and excludes journals, history and private plans', async ({page}) => {
  await createRoom(page);
  await page.getByRole('button', {name: 'Add a source', exact: true}).click();
  await page.getByLabel('My own note').check();
  await page.getByLabel('Title', {exact: true}).fill('UNSELECTED_LIBRARY_SOURCE_CANARY');
  await page.getByLabel('A thought to begin with').fill('PRIVATE_LIBRARY_JOURNAL_CANARY');
  await page.getByRole('button', {name: 'Add to learning room', exact: true}).click();
  await expect(page.getByText('UNSELECTED_LIBRARY_SOURCE_CANARY', {exact: true})).toBeVisible();
  await newBrief(page);
  await saveAttempt(page, 'ORIGINAL_PRIVATE_ANSWER_CANARY');
  await saveAttempt(page, 'The selected answer for a teacher.');
  await page.getByRole('button', {name: 'Prepare selected submission', exact: true}).click();
  const file = await selectedDownload(page, 'plain', 'The chosen teacher');
  const plaintext = file.bytes.toString('utf8');
  expect(plaintext).toBe(file.preview);
  const decoded = JSON.parse(plaintext);
  expect(decoded.kind).toBe('submission');
  expect(decoded.payload.answer).toBe('The selected answer for a teacher.');
  expect(decoded.recipient).toBe('The chosen teacher');
  for (const canary of ['PRIVATE_LIBRARY_JOURNAL_CANARY', 'UNSELECTED_LIBRARY_SOURCE_CANARY', 'ORIGINAL_PRIVATE_ANSWER_CANARY', 'PRIVATE_NEXT_ACTION_CANARY', '2026-10-29', passphrase]) expect(plaintext).not.toContain(canary);
  expect(Object.keys(decoded.payload)).toEqual(['id', 'attemptId', 'attemptRevision', 'brief', 'answer', 'question']);
});

test('encrypted selected work and feedback complete a two-room roundtrip without sharing the vault', async ({page, browser}) => {
  await createRoom(page); await newBrief(page); await saveAttempt(page, 'Selected answer for encrypted review.');
  await page.getByRole('button', {name: 'Prepare selected submission', exact: true}).click();
  await expect(page.getByRole('dialog').getByLabel('Sharing protection', {exact: true})).toHaveValue('encrypted');
  const submission = await selectedDownload(page, 'encrypted', 'Teacher');
  expect(submission.bytes.toString('utf8')).not.toContain('Selected answer for encrypted review.');
  expect(submission.bytes.toString('utf8')).not.toContain('PRIVATE_NEXT_ACTION_CANARY');
  const teacher = await isolatedPage(browser);
  try {
    const incoming = await importFile(teacher.page, submission.bytes, true);
    await expect(incoming).toContainText('Selected answer for encrypted review.');
    await incoming.getByRole('button', {name: 'Add selected text to my library', exact: true}).click();
    await expect(teacher.page.getByRole('heading', {name: 'Selected submissions', exact: true})).toBeVisible();
    await teacher.page.getByRole('button', {name: 'Write feedback', exact: true}).click();
    await teacher.page.getByLabel('What is working', {exact: true}).fill('You named the force of gravity.');
    await teacher.page.getByLabel('One next action', {exact: true}).fill('Explain the upward force from the desk.');
    await teacher.page.getByLabel('A question to consider', {exact: true}).fill('How do the two forces compare?');
    await teacher.page.getByRole('button', {name: 'Save feedback', exact: true}).click();
    await expect(teacher.page.getByRole('button', {name: 'Share feedback', exact: true})).toBeVisible();
    await teacher.page.getByRole('button', {name: 'Share feedback', exact: true}).click();
    const feedback = await selectedDownload(teacher.page, 'encrypted', 'Student');
    const reviewed = await importFile(page, feedback.bytes, true);
    await expect(reviewed).toContainText('Explain the upward force from the desk.');
    await reviewed.getByRole('button', {name: 'Add selected text to my library', exact: true}).click();
    await expect(page.locator('.education-feedback')).toContainText('Explain the upward force from the desk.');
    await expect(page.getByText(/unverified/i).first()).toBeVisible();
    await expect(page.getByLabel('My private next action', {exact: true})).toHaveValue('PRIVATE_NEXT_ACTION_CANARY');
  } finally { await teacher.context.close(); }
});

test('exchange import rejects malformed and conflicting records while exact replay adds no duplicate', async ({page, browser}) => {
  await createRoom(page); await newBrief(page);
  await page.getByRole('button', {name: 'Share brief', exact: true}).click();
  const file = await selectedDownload(page, 'plain', 'Students');
  const target = await isolatedPage(browser);
  try {
    let dialog = await importFile(target.page, file.bytes);
    await dialog.getByRole('button', {name: 'Add selected text to my library', exact: true}).click();
    const selector = target.page.getByRole('button', {name: `Open brief ${briefTitle} v1`, exact: true});
    await expect(selector).toHaveCount(1);
    dialog = await importFile(target.page, file.bytes);
    await dialog.getByRole('button', {name: 'Add selected text to my library', exact: true}).click();
    await expect(target.page.getByRole('status').filter({hasText: /already|replay/i}).first()).toBeVisible();
    await expect(selector).toHaveCount(1);
    await closeIfOpen(target.page);
    const conflicting = JSON.parse(file.bytes.toString('utf8'));
    conflicting.payload.goal = 'CONFLICTING_GOAL_MUST_NOT_REPLACE';
    dialog = await importFile(target.page, Buffer.from(JSON.stringify(conflicting)));
    await dialog.getByRole('button', {name: 'Add selected text to my library', exact: true}).click();
    await expect(target.page.getByRole('alert').filter({hasText: /conflict/i}).first()).toBeVisible();
    await closeIfOpen(target.page);
    const malformed = JSON.parse(file.bytes.toString('utf8'));
    malformed.payload.privateJournal = 'ILLEGAL_EXTRA_FIELD';
    dialog = await importFile(target.page, Buffer.from(JSON.stringify(malformed)));
    await expect(target.page.getByRole('alert').filter({hasText: /Unexpected|invalid/i}).first()).toBeVisible();
    await expect(dialog.getByRole('button', {name: 'Add selected text to my library', exact: true})).toHaveCount(0);
    await closeIfOpen(target.page);
    await openBrief(target.page);
    await expect(target.page.locator('.education-brief')).toContainText('Explain why a book stays on a desk.');
    expect(await target.page.locator('body').innerText()).not.toContain('CONFLICTING_GOAL_MUST_NOT_REPLACE');
  } finally { await target.context.close(); }
});

test('private attempt drafts survive cancelled navigation and explicit locking clears unsaved text', async ({page}) => {
  await createRoom(page); await newBrief(page);
  await page.getByLabel('My attempt', {exact: true}).fill('UNSAVED_PRIVATE_ATTEMPT_CANARY');
  const pending = page.waitForEvent('dialog');
  const navigation = page.getByRole('button', {name: /^Learn(?:\s|$)/}).click();
  const dialog = await pending;
  expect(dialog.message()).toMatch(/unsaved/i); await dialog.dismiss(); await navigation;
  await expect(page.getByLabel('My attempt', {exact: true})).toHaveValue('UNSAVED_PRIVATE_ATTEMPT_CANARY');
  await page.getByRole('button', {name: 'Lock room', exact: true}).click();
  await expect(page.getByRole('heading', {name: 'Unlock your room'})).toBeVisible();
  expect(await page.locator('body').innerText()).not.toContain('UNSAVED_PRIVATE_ATTEMPT_CANARY');
  await page.getByLabel('Passphrase', {exact: true}).fill(passphrase);
  await page.getByRole('button', {name: 'Unlock & start learning', exact: true}).click();
  await education(page); await openBrief(page);
  await expect(page.getByLabel('My attempt', {exact: true})).toHaveValue('');
});

test('sharing requires reviewed text and cancelling creates no file or external request', async ({page}) => {
  await createRoom(page); await newBrief(page);
  const downloads: string[] = [], externalRequests: string[] = [];
  page.on('download', download => downloads.push(download.suggestedFilename()));
  page.on('request', request => {const url = new URL(request.url()); if (url.protocol.startsWith('http') && !['127.0.0.1', 'localhost'].includes(url.hostname)) externalRequests.push(request.url());});
  await page.getByRole('button', {name: 'Share brief', exact: true}).click();
  const dialog = page.getByRole('dialog', {name: 'Review selected text', exact: true});
  await expect(dialog.getByRole('button', {name: 'Download selected text', exact: true})).toBeDisabled();
  await dialog.getByLabel('Intended recipient', {exact: true}).fill('A chosen colleague');
  await dialog.getByLabel('New file passphrase', {exact: true}).fill(filePassphrase);
  await dialog.getByLabel('Confirm file passphrase', {exact: true}).fill(filePassphrase);
  await dialog.getByRole('button', {name: 'Preview selected text', exact: true}).click();
  await expect(dialog.getByRole('button', {name: 'Download selected text', exact: true})).toBeDisabled();
  page.once('dialog',confirmation=>confirmation.accept());
  await dialog.getByRole('button', {name: 'Close dialog', exact: true}).click();
  await expect(dialog).toHaveCount(0);
  expect(downloads).toEqual([]); expect(externalRequests).toEqual([]);
});

test('new brief versions preserve attempts bound to their original task version', async ({page}) => {
  await createRoom(page); await newBrief(page); await saveAttempt(page, 'ANSWER_BOUND_TO_ORIGINAL_BRIEF');
  await page.getByRole('button', {name: 'Revise brief', exact: true}).click();
  await page.getByLabel('Practice task', {exact: true}).fill('A new task for the next brief version.');
  await page.getByRole('button', {name: 'Save brief', exact: true}).click();
  await openBrief(page, briefTitle, 2);
  await expect(page.getByLabel('My attempt', {exact: true})).toHaveValue('');
  await openBrief(page, briefTitle, 1);
  await expect(page.getByLabel('My attempt', {exact: true})).toHaveValue('ANSWER_BOUND_TO_ORIGINAL_BRIEF');
  await page.getByRole('button', {name: 'Prepare selected submission', exact: true}).click();
  const file = await selectedDownload(page, 'plain', 'Teacher of the original task');
  const decoded = JSON.parse(file.bytes.toString('utf8'));
  expect(decoded.payload.brief.version).toBe(1);
  expect(decoded.payload.brief.task).toBe('Name the forces and describe their directions.');
  expect(decoded.payload.answer).toBe('ANSWER_BOUND_TO_ORIGINAL_BRIEF');
});

test('imported-looking markup stays inert and the served page restricts remote execution', async ({page}) => {
  const response=await page.request.get('/');
  expect(response.ok()).toBe(true);
  const headers=response.headers();
  for(const rule of ["default-src 'none'","connect-src 'none'","object-src 'none'","frame-src 'none'","frame-ancestors 'none'"])expect(headers['content-security-policy']).toContain(rule);
  expect(headers['x-content-type-options']).toBe('nosniff');
  expect(headers['referrer-policy']).toBe('no-referrer');
  const external:string[]=[];page.on('request',request=>{const url=new URL(request.url());if(/^https?:$/.test(url.protocol)&&url.hostname!=='127.0.0.1')external.push(request.url());});
  await createRoom(page);
  const markup='<img src="https://example.invalid/pixel" onerror="document.body.dataset.executed=1">';
  await newBrief(page,markup);
  await expect(page.locator('.education-brief h2')).toHaveText(markup);
  expect(await page.locator('.education-brief img,.education-brief script,.education-brief iframe').count()).toBe(0);
  expect(await page.locator('body').getAttribute('data-executed')).toBeNull();
  await page.getByRole('button',{name:'Revise brief',exact:true}).click();
  await page.getByLabel('Source title',{exact:true}).fill('Untrusted link');
  await page.getByLabel('Source link',{exact:true}).fill('javascript:alert(1)');
  await page.getByRole('button',{name:'Save brief',exact:true}).click();
  await expect(page.getByRole('alert')).toContainText('http or https');
  await expect(page.getByLabel('Brief title',{exact:true})).toHaveValue(markup);
  expect(external).toEqual([]);
});
