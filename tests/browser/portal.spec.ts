import {test, expect, type Page} from '@playwright/test';

const reviewLabel = 'I reviewed the text, source credits and permission to publish each lesson.';
const navigation = (page: Page) => page.getByRole('navigation', {name: 'Learning library', exact: true});
const demoControls = (page: Page) => page.getByRole('region', {name: 'Demo account controls', exact: true});

async function start(page: Page) {
  await page.goto('/portal.html');
  await expect(page.getByRole('heading', {name: 'Choose something to explore', exact: true})).toBeVisible();
  await expect(demoControls(page)).toContainText('No email is sent or password stored.');
}
async function preview(page: Page, role: 'learner' | 'admin') {
  await demoControls(page).getByRole('button', {name: `Preview ${role}`, exact: true}).click();
  await expect(navigation(page)).toContainText(role === 'admin' ? 'Admin preview' : 'Learner preview');
}
async function newCourse(page: Page, title = 'An original course to share') {
  await navigation(page).getByRole('button', {name: 'New course', exact: true}).click();
  await page.getByLabel('Course title', {exact: true}).fill(title);
  await page.getByLabel('Course purpose', {exact: true}).fill('Observe one familiar object and explain one useful idea.');
  await page.getByLabel('Lesson 1 title', {exact: true}).fill('A small original practice');
  await page.getByLabel('Lesson 1 text').fill('ORIGINAL_LESSON_CANARY. Read an idea. Try an example. Check it. Choose a next step.');
  await expect(page.getByLabel('Course title', {exact: true})).toHaveValue(title);
  await expect(page.getByLabel('Lesson 1 text')).toHaveValue('ORIGINAL_LESSON_CANARY. Read an idea. Try an example. Check it. Choose a next step.');
}

test('public course metadata reveals lesson materials only after the explicit learner preview', async ({page}) => {
  await start(page);
  await expect(navigation(page).getByRole('button', {name: 'Support', exact: true})).toHaveCount(0);
  await expect(navigation(page).getByRole('button', {name: 'New course', exact: true})).toHaveCount(0);
  await page.getByRole('button', {name: 'Explore Notice motion', exact: true}).click();
  await expect(page.getByRole('heading', {name: 'Notice motion', exact: true})).toBeVisible();
  const outline = page.getByRole('navigation', {name: 'Course lessons', exact: true});
  await expect(outline.getByRole('button')).toHaveCount(0);
  await expect(outline).toContainText('Sign in for lesson materials and support.');
  await expect(page.locator('.portal-material-text')).toHaveCount(0);
  expect(await page.locator('body').innerText()).not.toContain('A force is a push or pull.');
  await page.getByRole('button', {name: 'Preview this as a learner', exact: true}).click();
  await expect(navigation(page)).toContainText('Learner preview');
  await expect(page.getByRole('heading', {name: 'Notice motion', exact: true})).toBeVisible();
  await expect(outline.getByRole('button', {name: '1 A small push', exact: true})).toBeVisible();
  await expect(outline.getByRole('button', {name: '2 When forces balance', exact: true})).toBeVisible();
  await expect(page.locator('.portal-lesson .portal-material-text')).toContainText('A force is a push or pull.');
  await expect(page.locator('.portal-credit')).toContainText('Original Open Learning Rooms sample; CC BY 4.0.');
  await outline.getByRole('button', {name: '2 When forces balance', exact: true}).click();
  await expect(page.locator('.portal-lesson .portal-material-text')).toContainText('A book resting on a table has forces acting on it.');
  await expect(outline.getByRole('button', {name: '2 When forces balance', exact: true})).toHaveAttribute('aria-current', 'step');
  await page.getByRole('button', {name: 'Ask for help', exact: true}).click();
  await expect(page.getByRole('heading', {name: 'Your support', exact: true})).toBeVisible();
  await expect(page.getByLabel('Related course', {exact: true}).locator('option:checked')).toHaveText('Notice motion');
});

test('chosen learner support text reaches the admin and the saved reply returns to that learner', async ({page}) => {
  await start(page); await preview(page, 'learner');
  await navigation(page).getByRole('button', {name: 'Support', exact: true}).click();
  await page.getByLabel('Related course', {exact: true}).selectOption({label: 'Notice motion'});
  await page.getByLabel('Subject', {exact: true}).fill('A question about the upward force');
  await page.getByLabel('Your message', {exact: true}).fill('SELECTED_SUPPORT_TEXT: How does the table support the book?');
  await page.getByRole('button', {name: 'Submit support request', exact: true}).click();
  await expect(page.getByRole('status')).toContainText('Your selected message was submitted for support.');
  await expect(page.getByLabel('Your message', {exact: true})).toHaveValue('');
  await expect(page.locator('.portal-support-thread')).toHaveCount(1);
  await expect(page.locator('.portal-support-thread')).toContainText('SELECTED_SUPPORT_TEXT');
  await expect(page.locator('input[type="file"]')).toHaveCount(0);
  await preview(page, 'admin');
  await navigation(page).getByRole('button', {name: 'Support', exact: true}).click();
  await expect(page.getByRole('heading', {name: 'Support inbox', exact: true})).toBeVisible();
  await expect(page.locator('.portal-support-thread')).toContainText('SELECTED_SUPPORT_TEXT');
  await page.getByLabel('Reply to A question about the upward force', {exact: true}).fill('Look for the upward contact force. Draw it opposite gravity.');
  await page.getByRole('button', {name: 'Save support reply', exact: true}).click();
  await expect(page.getByRole('status')).toContainText('Your support reply is saved.');
  await preview(page, 'learner');
  await navigation(page).getByRole('button', {name: 'Support', exact: true}).click();
  await expect(page.locator('.portal-support-thread')).toContainText('Reply available');
  await expect(page.locator('.portal-support-reply')).toContainText('Look for the upward contact force. Draw it opposite gravity.');
  await expect(page.getByRole('button', {name: 'Save support reply', exact: true})).toHaveCount(0);
  await navigation(page).getByRole('button', {name: 'Sign out', exact: true}).click();
  await expect(page.getByRole('heading', {name: 'Choose something to explore', exact: true})).toBeVisible();
  expect(await page.locator('body').innerText()).not.toContain('SELECTED_SUPPORT_TEXT');
});

test('drafts stay out of the learner catalogue and publishing requires credits, rights and a fresh review', async ({page}) => {
  const title = 'A reviewed original course';
  await start(page); await preview(page, 'admin'); await newCourse(page, title);
  await page.getByRole('button', {name: 'Publish course', exact: true}).click();
  await expect(page.getByRole('alert')).toContainText('Review the course');
  await page.getByLabel(reviewLabel, {exact: true}).check();
  await page.getByRole('button', {name: 'Publish course', exact: true}).click();
  await expect(page.getByRole('alert')).toContainText('creator credit and content rights');
  await page.getByRole('button', {name: 'Save draft', exact: true}).click();
  await expect(page.getByRole('status')).toContainText('Your course draft is saved.');
  await navigation(page).getByRole('button', {name: 'Courses', exact: true}).click();
  const draftCard = page.locator('.portal-course-card').filter({has: page.getByRole('heading', {name: title, exact: true})});
  await expect(draftCard).toContainText('Draft · admin only');
  await preview(page, 'learner');
  await expect(page.getByRole('button', {name: `Explore ${title}`, exact: true})).toHaveCount(0);
  expect(await page.locator('body').innerText()).not.toContain('ORIGINAL_LESSON_CANARY');
  await preview(page, 'admin');
  await page.getByRole('button', {name: `Explore ${title}`, exact: true}).click();
  await page.getByRole('button', {name: 'Edit course', exact: true}).click();
  await page.getByLabel('Lesson 1 creator or source credit', {exact: true}).fill('Original test educator');
  await page.getByLabel('Lesson 1 content rights').fill('Original material, CC BY 4.0.');
  await page.getByLabel(reviewLabel, {exact: true}).check();
  await page.getByLabel('Lesson 1 text').fill('ORIGINAL_LESSON_CANARY. A final reviewed revision with a small practice.');
  await expect(page.getByLabel(reviewLabel, {exact: true})).not.toBeChecked();
  await page.getByRole('button', {name: 'Publish course', exact: true}).click();
  await expect(page.getByRole('alert')).toContainText('Review the course');
  await page.getByLabel(reviewLabel, {exact: true}).check();
  await page.getByRole('button', {name: 'Publish course', exact: true}).click();
  await expect(page.getByRole('status')).toContainText('Your reviewed course is published.');
  await preview(page, 'learner');
  await page.getByRole('button', {name: `Explore ${title}`, exact: true}).click();
  await expect(page.locator('.portal-lesson .portal-material-text')).toContainText('A final reviewed revision');
  await expect(page.locator('.portal-credit')).toContainText('Original test educator');
  await expect(page.locator('.portal-credit')).toContainText('Original material, CC BY 4.0.');
});

test('cancelled navigation retains unsaved course and support text until an explicit discard', async ({page}) => {
  await start(page); await preview(page, 'admin'); await newCourse(page, 'UNSAVED_COURSE_TITLE');
  page.once('dialog', async confirmation => {expect(confirmation.message()).toContain('unsaved edits'); await confirmation.dismiss();});
  await navigation(page).getByRole('button', {name: 'Courses', exact: true}).click();
  await expect(page.getByLabel('Course title', {exact: true})).toHaveValue('UNSAVED_COURSE_TITLE');
  await expect(page.getByLabel('Lesson 1 text')).toHaveValue(/ORIGINAL_LESSON_CANARY/);
  page.once('dialog', confirmation => confirmation.accept());
  await page.getByRole('button', {name: 'Close editor', exact: true}).click();
  await expect(page.getByRole('button', {name: 'Explore UNSAVED_COURSE_TITLE', exact: true})).toHaveCount(0);
  await preview(page, 'learner');
  await navigation(page).getByRole('button', {name: 'Support', exact: true}).click();
  await page.getByLabel('Subject', {exact: true}).fill('UNSENT_SUPPORT_SUBJECT');
  await page.getByLabel('Your message', {exact: true}).fill('UNSENT_SUPPORT_MESSAGE');
  page.once('dialog', confirmation => confirmation.dismiss());
  await navigation(page).getByRole('button', {name: 'Courses', exact: true}).click();
  await expect(page.getByLabel('Your message', {exact: true})).toHaveValue('UNSENT_SUPPORT_MESSAGE');
  page.once('dialog', confirmation => confirmation.accept());
  await demoControls(page).getByRole('button', {name: 'Preview admin', exact: true}).click();
  await expect(navigation(page)).toContainText('Admin preview');
  await navigation(page).getByRole('button', {name: 'Support', exact: true}).click();
  await expect(page.getByText('No support requests yet.', {exact: true})).toBeVisible();
  expect(await page.locator('body').innerText()).not.toContain('UNSENT_SUPPORT_MESSAGE');
});

test('the local preview makes no email claim or external request and refresh clears simulated support', async ({page}) => {
  const externalRequests: string[] = [];
  page.on('request', request => {
    const url = new URL(request.url());
    if (/^https?:$/.test(url.protocol) && url.origin !== 'http://127.0.0.1:4178') externalRequests.push(request.url());
  });
  await page.goto('/portal.html?code=DISPOSABLE_CALLBACK_CODE#access_token=DISPOSABLE_CALLBACK_TOKEN');
  await expect(page.getByText('Local demonstration', {exact: true})).toBeVisible();
  await expect(page).toHaveURL('http://127.0.0.1:4178/portal.html');
  await expect(page.locator('input[type="email"],input[type="password"]')).toHaveCount(0);
  await expect(page.getByRole('button', {name: 'Sign in', exact: true})).toHaveCount(0);
  await expect(page.getByRole('button', {name: 'Create account', exact: true})).toHaveCount(0);
  await expect(page.getByRole('button', {name: 'Request recovery email', exact: true})).toHaveCount(0);
  await preview(page, 'learner');
  await navigation(page).getByRole('button', {name: 'Support', exact: true}).click();
  await page.getByLabel('Subject', {exact: true}).fill('DISPOSABLE_DEMO_REQUEST');
  await page.getByLabel('Your message', {exact: true}).fill('This chosen demo message is never emailed.');
  await page.getByRole('button', {name: 'Submit support request', exact: true}).click();
  await expect(page.locator('.portal-support-thread')).toContainText('DISPOSABLE_DEMO_REQUEST');
  await page.reload();
  await expect(page.getByRole('heading', {name: 'Choose something to explore', exact: true})).toBeVisible();
  await expect(navigation(page).getByRole('button', {name: 'Support', exact: true})).toHaveCount(0);
  await preview(page, 'admin');
  await navigation(page).getByRole('button', {name: 'Support', exact: true}).click();
  await expect(page.getByText('No support requests yet.', {exact: true})).toBeVisible();
  expect(externalRequests).toEqual([]);
});
