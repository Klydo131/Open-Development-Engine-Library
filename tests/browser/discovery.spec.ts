import {test, expect, type Locator, type Page} from '@playwright/test';

const catalogue = (page: Page) => page.getByRole('region', {name: 'Choose something to explore', exact: true});
const search = (page: Page) => page.getByLabel('Search courses', {exact: true});
const language = (page: Page) => page.getByRole('combobox', {name: 'Course language filter', exact: true});
const explore = (page: Page, title: string) => page.getByRole('button', {name: `Explore ${title}`, exact: true});
const resultCount = (page: Page) => catalogue(page).getByRole('status');

async function start(page: Page) {
  await page.goto('/portal.html');
  await expect(page.getByRole('heading', {level: 1, name: 'A little curiosity. A world to discover.', exact: true})).toBeVisible();
  await expect(explore(page, 'Notice motion')).toBeVisible();
  await expect(explore(page, 'Find a steady pulse')).toBeVisible();
}

async function tabTo(page: Page, target: Locator, key: 'Tab' | 'Shift+Tab' = 'Tab') {
  for (let step = 0; step < 40; step++) {
    if (await target.evaluate(element => element === document.activeElement)) return;
    await page.keyboard.press(key);
  }
  await expect(target, 'The control is reachable with the keyboard').toBeFocused();
}

test('guest discovery presents real courses and available languages without claiming an account', async ({page}) => {
  await start(page);
  await expect(resultCount(page)).toContainText(/2\s+courses\b/i);
  await expect(language(page).locator('option')).toHaveCount(2);
  await expect(language(page).locator('option:checked')).toHaveText('All languages');
  await language(page).selectOption('en');
  await expect(explore(page, 'Notice motion')).toBeVisible();
  await expect(explore(page, 'Find a steady pulse')).toBeVisible();
  await expect(resultCount(page)).toContainText(/2\s+courses\b/i);
  const controls = page.getByRole('region', {name: 'Demo account controls', exact: true});
  await expect(controls).toContainText('No email is sent or password stored.');
  await expect(controls.getByRole('button', {name: 'Preview learner', exact: true})).toBeVisible();
  await expect(controls.getByRole('button', {name: 'Preview admin', exact: true})).toBeVisible();
  await expect(page.getByRole('button', {name: 'Sign in', exact: true})).toHaveCount(0);
  const personalRoom = page.getByRole('link', {name: 'Discover your personal room', exact: true});
  await expect(personalRoom).toHaveAttribute('href', '/');
  await personalRoom.click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole('button', {name: 'Create your room', exact: true})).toBeVisible();
});

test('course search matches title and summary without case or surrounding-space sensitivity', async ({page}) => {
  await start(page);
  await search(page).fill('  nOtIcE MoTiOn  ');
  await expect(explore(page, 'Notice motion')).toBeVisible();
  await expect(explore(page, 'Find a steady pulse')).toHaveCount(0);
  await expect(resultCount(page)).toContainText(/1\s+course\b/i);
  await search(page).fill('NO INSTRUMENT');
  await expect(explore(page, 'Notice motion')).toHaveCount(0);
  await expect(explore(page, 'Find a steady pulse')).toBeVisible();
  await expect(resultCount(page)).toContainText(/1\s+course\b/i);
  await language(page).selectOption('en');
  await expect(explore(page, 'Find a steady pulse')).toBeVisible();
  await expect(resultCount(page)).toContainText(/1\s+course\b/i);
});

test('an unmatched search explains the empty result and Clear filters restores the catalogue', async ({page}) => {
  await start(page);
  await language(page).selectOption('en');
  await search(page).fill('a course that does not exist');
  await expect(explore(page, 'Notice motion')).toHaveCount(0);
  await expect(explore(page, 'Find a steady pulse')).toHaveCount(0);
  await expect(resultCount(page)).toContainText(/0\s+courses\b/i);
  await expect(catalogue(page)).toContainText('No courses match these filters.');
  await catalogue(page).getByRole('button', {name: 'Clear filters', exact: true}).click();
  await expect(search(page)).toHaveValue('');
  await expect(language(page).locator('option:checked')).toHaveText('All languages');
  await expect(explore(page, 'Notice motion')).toBeVisible();
  await expect(explore(page, 'Find a steady pulse')).toBeVisible();
  await expect(resultCount(page)).toContainText(/2\s+courses\b/i);
});

test('language filtering uses real course metadata and removes private draft languages for learners', async ({page}) => {
  await start(page);
  const controls = page.getByRole('region', {name: 'Demo account controls', exact: true});
  const navigation = page.getByRole('navigation', {name: 'Learning library', exact: true});
  await controls.getByRole('button', {name: 'Preview admin', exact: true}).click();
  await navigation.getByRole('button', {name: 'New course', exact: true}).click();
  await page.getByLabel('Course title', {exact: true}).fill('Synthetic Filipino practice');
  await page.getByLabel('Course purpose', {exact: true}).fill('A synthetic course used only to check language filtering.');
  await page.getByRole('textbox', {name: /^Course language/}).fill('fil');
  await page.getByLabel('Lesson 1 title', {exact: true}).fill('A synthetic first lesson');
  await page.getByLabel('Lesson 1 text').fill('Original synthetic text for a private language-filtering check.');
  await page.getByRole('button', {name: 'Save draft', exact: true}).click();
  await expect(page.getByRole('status')).toContainText('Your course draft is saved.');
  await navigation.getByRole('button', {name: 'Courses', exact: true}).click();
  await expect(language(page).locator('option')).toHaveCount(3);
  await language(page).selectOption('fil');
  await expect(explore(page, 'Synthetic Filipino practice')).toBeVisible();
  await expect(explore(page, 'Notice motion')).toHaveCount(0);
  await expect(explore(page, 'Find a steady pulse')).toHaveCount(0);
  await expect(resultCount(page)).toContainText(/1\s+course\b/i);
  await language(page).selectOption('en');
  await expect(explore(page, 'Synthetic Filipino practice')).toHaveCount(0);
  await expect(explore(page, 'Notice motion')).toBeVisible();
  await expect(explore(page, 'Find a steady pulse')).toBeVisible();
  await controls.getByRole('button', {name: 'Preview learner', exact: true}).click();
  await expect(language(page).locator('option')).toHaveCount(2);
  await expect(language(page).locator('option[value="fil"]')).toHaveCount(0);
  await expect(explore(page, 'Synthetic Filipino practice')).toHaveCount(0);
});

test('a valid unbroken draft title stays readable at 320 pixels and disappears with its admin session', async ({page}) => {
  await page.setViewportSize({width: 320, height: 800});
  await start(page);
  const title = 'A'.repeat(160);
  const controls = page.getByRole('region', {name: 'Demo account controls', exact: true});
  const navigation = page.getByRole('navigation', {name: 'Learning library', exact: true});
  await controls.getByRole('button', {name: 'Preview admin', exact: true}).click();
  await navigation.getByRole('button', {name: 'New course', exact: true}).click();
  await page.getByLabel('Course title', {exact: true}).fill(title);
  await page.getByLabel('Course purpose', {exact: true}).fill('Synthetic material for checking long-title reflow.');
  await page.getByLabel('Lesson 1 title', {exact: true}).fill('First synthetic lesson');
  await page.getByLabel('Lesson 1 text').fill('Original synthetic text for a draft course.');
  await page.getByRole('button', {name: 'Save draft', exact: true}).click();
  await expect(page.getByRole('status')).toContainText('Your course draft is saved.');
  await navigation.getByRole('button', {name: 'Courses', exact: true}).click();
  const heading = catalogue(page).getByRole('heading', {level: 3, name: title, exact: true});
  await expect(heading).toBeVisible();
  expect(await heading.evaluate(element => element.scrollWidth <= element.clientWidth), 'The whole valid course title fits without clipping').toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'A long course title keeps 320px page reflow').toBe(true);
  await explore(page, title).click();
  await expect(page.getByRole('heading', {level: 2, name: title, exact: true})).toBeVisible();
  await controls.getByRole('button', {name: 'Preview learner', exact: true}).click();
  await expect(page.getByRole('heading', {level: 1})).toHaveCount(1);
  await expect(page.getByRole('heading', {level: 1, name: 'Where will curiosity take you today?', exact: true})).toBeVisible();
  await expect(page.getByRole('heading', {name: title, exact: true})).toHaveCount(0);
  await expect(explore(page, title)).toHaveCount(0);
});

test('a discovered course opens its actual preview and keeps lesson materials behind learner preview', async ({page}) => {
  await start(page);
  await search(page).fill('gentle push');
  await explore(page, 'Notice motion').click();
  await expect(page.getByRole('heading', {name: 'Notice motion', exact: true})).toBeVisible();
  const lessons = page.getByRole('navigation', {name: 'Course lessons', exact: true});
  await expect(lessons.getByRole('button')).toHaveCount(0);
  await expect(lessons).toContainText('Sign in for lesson materials and support.');
  await expect(page.locator('.portal-material-text')).toHaveCount(0);
  await page.getByRole('button', {name: 'Preview this as a learner', exact: true}).click();
  await expect(lessons.getByRole('button', {name: '1 A small push', exact: true})).toBeVisible();
  await expect(page.locator('.portal-lesson .portal-material-text')).toContainText('A force is a push or pull.');
});

test('Larger text increases discovery summary size and keeps narrow-screen reflow', async ({page}) => {
  await start(page);
  const summary = page.locator('.portal-course-card').filter({has: page.getByRole('heading', {name: 'Notice motion', exact: true})}).locator('p');
  const standardSize = await summary.evaluate(element => Number.parseFloat(getComputedStyle(element).fontSize));
  await page.getByLabel('Reading size', {exact: true}).selectOption('large');
  await expect.poll(() => summary.evaluate(element => Number.parseFloat(getComputedStyle(element).fontSize))).toBeGreaterThan(standardSize);
  for (const width of [320, 390, 768, 1280]) {
    await page.setViewportSize({width, height: 800});
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `Larger discovery text reflows at ${width}px`).toBe(true);
  }
});

test('discovery reflows at 320 pixels and its search, course and personal room remain keyboard reachable', async ({page}) => {
  await page.setViewportSize({width: 320, height: 800});
  await start(page);
  for (const width of [320, 390, 768, 1280]) {
    await page.setViewportSize({width, height: 800});
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `Discovery reflows at ${width}px`).toBe(true);
  }
  await page.setViewportSize({width: 320, height: 800});
  await tabTo(page, page.getByRole('button', {name: 'Explore courses', exact: true}));
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', {name: 'Choose something to explore', exact: true})).toBeInViewport();
  await tabTo(page, search(page));
  await page.keyboard.type('steady pulse');
  await expect(resultCount(page)).toContainText(/1\s+course\b/i);
  await tabTo(page, language(page));
  await expect(language(page)).toBeFocused();
  await tabTo(page, explore(page, 'Find a steady pulse'));
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', {name: 'Find a steady pulse', exact: true})).toBeVisible();
  await tabTo(page, page.getByRole('button', {name: 'Private rooms', exact: true}), 'Shift+Tab');
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole('button', {name: 'Create your room', exact: true})).toBeVisible();
});

test('local discovery, filtering and course previews make no external requests', async ({page, baseURL}) => {
  const origin = new URL(baseURL!).origin;
  const externalRequests: string[] = [];
  page.on('request', request => {
    const url = new URL(request.url());
    if (/^https?:$/.test(url.protocol) && url.origin !== origin) externalRequests.push(request.url());
  });
  await page.route(/^https?:\/\//, route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
  await start(page);
  await search(page).fill('pulse');
  await language(page).selectOption('en');
  await explore(page, 'Find a steady pulse').click();
  await expect(page.getByRole('heading', {name: 'Find a steady pulse', exact: true})).toBeVisible();
  await page.getByRole('button', {name: 'All courses', exact: true}).click();
  await expect(search(page)).toBeVisible();
  expect(externalRequests).toEqual([]);
});
