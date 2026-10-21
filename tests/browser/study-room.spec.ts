import {test, expect, type Page} from '@playwright/test';

const passphrase = 'a private guided study test room';
const title = 'Why a book stays still';
const example = 'Gravity and support balance for a book at rest.';
const room = (page: Page) => page.getByRole('dialog', {name: 'Study room', exact: true});

async function createRoom(page: Page) {
  await page.goto('/');
  await page.getByRole('button', {name: 'Create your room', exact: true}).click();
  await page.getByLabel('Passphrase', {exact: true}).fill(passphrase);
  await page.getByLabel('Confirm passphrase', {exact: true}).fill(passphrase);
  await page.getByRole('button', {name: 'Create & start learning', exact: true}).click();
  await expect(page.getByRole('heading', {name: 'Follow your curiosity.'})).toBeVisible();
  await page.getByRole('button', {name: 'Learning briefs', exact: true}).click();
  await page.getByRole('button', {name: 'New brief', exact: true}).click();
  await page.getByLabel('Brief title', {exact: true}).fill(title);
  await page.getByLabel('Learning goal', {exact: true}).fill('Explain balanced forces using a familiar object.');
  await page.getByLabel('Practice task', {exact: true}).fill('Name the forces on a book resting on a desk.');
  await page.getByLabel('Worked example', {exact: true}).fill(example);
  await page.getByLabel('Success checks', {exact: true}).fill('Name both forces\nDescribe their directions');
  await page.getByRole('button', {name: 'Save brief', exact: true}).click();
  await page.getByRole('button', {name: `Open brief ${title} v1`, exact: true}).click();
  await expect(page.getByLabel('My attempt', {exact: true})).toBeVisible();
}

async function openStudy(page: Page) {
  await page.getByRole('button', {name: 'Open guided study', exact: true}).click();
  await expect(room(page)).toBeVisible();
  await expect(room(page).getByRole('button', {name: '1. Read', exact: true})).toHaveAttribute('aria-current', 'step');
  return room(page);
}

async function unlockBrief(page: Page) {
  await page.getByLabel('Passphrase', {exact: true}).fill(passphrase);
  await page.getByRole('button', {name: 'Unlock & start learning', exact: true}).click();
  await page.getByRole('button', {name: 'Learning briefs', exact: true}).click();
  await page.getByRole('button', {name: `Open brief ${title} v1`, exact: true}).click();
}

test('guided steps copy the live private draft and preserve every field while examples remain learner-controlled', async ({page}) => {
  await createRoom(page);
  await page.getByLabel('My attempt', {exact: true}).fill('UNSAVED_STARTING_ANSWER');
  await page.getByLabel('Question for feedback', {exact: true}).fill('UNSAVED_STARTING_QUESTION');
  await page.getByLabel('My private next action', {exact: true}).fill('Draw the two forces.');
  await page.getByLabel('Review on', {exact: true}).fill('2026-11-02');
  const study = await openStudy(page);
  await expect(study.getByLabel('My study attempt', {exact: true})).toHaveValue('UNSAVED_STARTING_ANSWER');
  await expect(study.getByLabel('A question or help I need', {exact: true})).toHaveValue('UNSAVED_STARTING_QUESTION');
  await expect(study.getByText(example, {exact: true})).not.toBeVisible();
  await study.getByRole('button', {name: '2. Try', exact: true}).click();
  await expect(study.getByRole('region', {name: 'Learning brief reference', exact: true})).toHaveCount(0);
  await study.getByLabel('My study attempt', {exact: true}).fill('Gravity pulls down and support pushes up.');
  await study.getByLabel('A question or help I need', {exact: true}).fill('How can I compare their sizes?');
  await study.getByRole('button', {name: 'Show learning brief or example', exact: true}).click();
  await study.getByText('Show a worked example', {exact: true}).click();
  await expect(study.getByText(example, {exact: true})).toBeVisible();
  await study.getByRole('button', {name: '4. Plan', exact: true}).click();
  await expect(study.getByLabel('My private next action', {exact: true})).toHaveValue('Draw the two forces.');
  await expect(study.getByLabel('Review on', {exact: true})).toHaveValue('2026-11-02');
  await study.getByLabel('My private next action', {exact: true}).fill('Compare equal-length arrows with the source.');
  await study.getByLabel('Review on', {exact: true}).fill('2026-11-09');
  await study.getByRole('button', {name: '3. Check', exact: true}).click();
  await expect(study.getByRole('heading', {name: `Check · ${title}`, exact: true})).toBeFocused();
  await expect(study.getByLabel('My study attempt', {exact: true})).toHaveValue('Gravity pulls down and support pushes up.');
  await expect(study.getByLabel('A question or help I need', {exact: true})).toHaveValue('How can I compare their sizes?');
  await study.getByRole('button', {name: '1. Read', exact: true}).click();
  await study.getByRole('button', {name: '4. Plan', exact: true}).click();
  await expect(study.getByLabel('My private next action', {exact: true})).toHaveValue('Compare equal-length arrows with the source.');
  await expect(study.getByLabel('Review on', {exact: true})).toHaveValue('2026-11-09');
});

test('guided saving preserves successive revisions and private plans through lock and unlock', async ({page}) => {
  await createRoom(page);
  await page.getByLabel('My attempt', {exact: true}).fill('ORIGINAL_PRIVATE_REVISION');
  await page.getByRole('button', {name: 'Save private attempt', exact: true}).click();
  await expect(page.getByRole('button', {name: 'Save new revision', exact: true})).toBeVisible();
  const study = await openStudy(page);
  await study.getByRole('button', {name: '2. Try', exact: true}).click();
  await study.getByLabel('My study attempt', {exact: true}).fill('SECOND_GUIDED_REVISION');
  await study.getByLabel('A question or help I need', {exact: true}).fill('Is the desk force upward?');
  await study.getByRole('button', {name: 'Save private study', exact: true}).click();
  await expect(study.getByRole('button', {name: 'Save private study', exact: true})).toBeEnabled();
  await expect(study.getByRole('status')).toContainText('Saved privately.');
  await study.getByLabel('My study attempt', {exact: true}).fill('THIRD_GUIDED_REVISION');
  await study.getByRole('button', {name: '4. Plan', exact: true}).click();
  await expect(study.getByRole('heading', {name: `Plan · ${title}`, exact: true})).toBeFocused();
  await study.getByLabel('My private next action', {exact: true}).fill('PRIVATE_GUIDED_PLAN');
  await study.getByLabel('Review on', {exact: true}).fill('2026-11-16');
  await expect(study.getByLabel('Review on', {exact: true})).toHaveValue('2026-11-16');
  await study.getByRole('button', {name: 'Save private study', exact: true}).click();
  await expect(study.getByRole('button', {name: 'Save private study', exact: true})).toBeEnabled();
  await expect(study.getByRole('status')).toContainText('Saved privately.');
  await study.getByRole('button', {name: 'Close study room', exact: true}).click();
  await expect(study).toHaveCount(0);
  await expect(page.getByLabel('My attempt', {exact: true})).toHaveValue('THIRD_GUIDED_REVISION');
  await page.getByRole('button', {name: 'Lock room', exact: true}).click();
  await expect(page.getByRole('heading', {name: 'Unlock your room'})).toBeVisible();
  expect(await page.locator('body').innerText()).not.toContain('GUIDED_REVISION');
  await unlockBrief(page);
  await expect(page.getByLabel('My attempt', {exact: true})).toHaveValue('THIRD_GUIDED_REVISION');
  await expect(page.getByLabel('Question for feedback', {exact: true})).toHaveValue('Is the desk force upward?');
  await expect(page.getByLabel('My private next action', {exact: true})).toHaveValue('PRIVATE_GUIDED_PLAN');
  await expect(page.getByLabel('Review on', {exact: true})).toHaveValue('2026-11-16');
  await page.getByText('Saved attempt history', {exact: true}).click();
  const history = page.locator('.education-history');
  await expect(history).toHaveCount(3);
  await expect(history.nth(0)).toContainText('ORIGINAL_PRIVATE_REVISION');
  await expect(history.nth(1)).toContainText('SECOND_GUIDED_REVISION');
  await expect(history.nth(2)).toContainText('THIRD_GUIDED_REVISION');
});

test('cancelling guided edits confirms only that view and keeps the earlier unsaved attempt intact', async ({page}) => {
  await createRoom(page);
  await page.getByLabel('My attempt', {exact: true}).fill('EARLIER_UNSAVED_ANSWER');
  await page.getByLabel('Question for feedback', {exact: true}).fill('EARLIER_UNSAVED_QUESTION');
  await page.getByLabel('My private next action', {exact: true}).fill('EARLIER_UNSAVED_ACTION');
  await page.getByLabel('Review on', {exact: true}).fill('2026-11-23');
  const study = await openStudy(page);
  await study.getByRole('button', {name: '2. Try', exact: true}).click();
  await study.getByLabel('My study attempt', {exact: true}).fill('GUIDED_EDIT_TO_DISCARD');
  page.once('dialog', async confirmation => {
    expect(confirmation.message()).toContain('unsaved edits');
    await confirmation.dismiss();
  });
  await study.getByRole('button', {name: 'Close study room', exact: true}).click();
  await expect(study).toBeVisible();
  await expect(study.getByLabel('My study attempt', {exact: true})).toHaveValue('GUIDED_EDIT_TO_DISCARD');
  page.once('dialog', confirmation => confirmation.accept());
  await study.getByRole('button', {name: 'Close study room', exact: true}).click();
  await expect(study).toHaveCount(0);
  await expect(page.getByLabel('My attempt', {exact: true})).toHaveValue('EARLIER_UNSAVED_ANSWER');
  await expect(page.getByLabel('Question for feedback', {exact: true})).toHaveValue('EARLIER_UNSAVED_QUESTION');
  await expect(page.getByLabel('My private next action', {exact: true})).toHaveValue('EARLIER_UNSAVED_ACTION');
  await expect(page.getByLabel('Review on', {exact: true})).toHaveValue('2026-11-23');
  await expect(page.locator('.draft-note')).toBeVisible();
});

test('locking directly from guided study removes all unsaved plaintext without a discard prompt', async ({page}) => {
  await createRoom(page);
  await page.getByLabel('My attempt', {exact: true}).fill('SAVED_BASELINE_FOR_LOCK');
  await page.getByRole('button', {name: 'Save private attempt', exact: true}).click();
  await expect(page.getByRole('button', {name: 'Save new revision', exact: true})).toBeVisible();
  await page.getByLabel('My attempt', {exact: true}).fill('BACKGROUND_UNSAVED_SECRET');
  const study = await openStudy(page);
  await study.getByRole('button', {name: '2. Try', exact: true}).click();
  await study.getByLabel('My study attempt', {exact: true}).fill('GUIDED_UNSAVED_SECRET');
  const prompts: string[] = [];
  page.on('dialog', async confirmation => {prompts.push(confirmation.message()); await confirmation.dismiss();});
  await study.getByRole('button', {name: 'Lock room now', exact: true}).click();
  await expect(page.getByRole('heading', {name: 'Unlock your room'})).toBeVisible();
  await expect(study).toHaveCount(0);
  const fields = await page.locator('input,textarea').evaluateAll(elements => elements.map(element => (element as HTMLInputElement).value));
  expect(fields).not.toContain('BACKGROUND_UNSAVED_SECRET');
  expect(fields).not.toContain('GUIDED_UNSAVED_SECRET');
  expect(prompts).toEqual([]);
  await unlockBrief(page);
  await expect(page.getByLabel('My attempt', {exact: true})).toHaveValue('SAVED_BASELINE_FOR_LOCK');
});

test('idle warning stays actionable above guided study and continuing preserves its live draft and focus', async ({page}) => {
  await page.clock.install({time: new Date('2026-10-20T00:00:00Z')});
  await createRoom(page);
  const study = await openStudy(page);
  await study.getByRole('button', {name: '2. Try', exact: true}).click();
  const answer = study.getByLabel('My study attempt', {exact: true});
  await answer.fill('A guided draft stays private during the warning.');
  await page.clock.pauseAt(await page.evaluate(() => Date.now() + 100));
  await answer.press('ArrowLeft');
  await page.clock.fastForward(270_000);
  const warning = page.getByRole('dialog', {name: 'Still studying?', exact: true});
  await expect(warning).toBeVisible();
  await expect(page.locator('dialog[open]')).toHaveCount(2);
  await expect(warning.getByRole('button', {name: 'Continue studying', exact: true})).toBeFocused();
  await page.clock.runFor(29_000);
  await expect(warning).toBeVisible();
  await warning.getByRole('button', {name: 'Continue studying', exact: true}).click();
  await expect(warning).toHaveCount(0);
  await expect(study).toBeVisible();
  await expect(answer).toHaveValue('A guided draft stays private during the warning.');
  await expect(answer).toBeFocused();
  await expect(study.getByRole('button', {name: '2. Try', exact: true})).toHaveAttribute('aria-current', 'step');
});
