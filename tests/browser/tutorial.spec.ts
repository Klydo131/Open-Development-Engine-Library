import {test,expect,type Page} from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test.use({bypassCSP:true});
const navigation=(page:Page)=>page.getByRole('navigation',{name:'Learning library',exact:true});
const opener=(page:Page)=>page.getByRole('button',{name:'Getting started',exact:true});
const guide=(page:Page)=>page.locator('.portal-tutorial-panel');
async function start(page:Page){
  await page.goto('/portal.html');
  await expect(page.getByRole('heading',{name:'Choose something to explore',exact:true})).toBeVisible();
}
async function preview(page:Page,role:'learner'|'admin'){
  await page.getByRole('region',{name:'Demo account controls'}).getByRole('button',{name:`Preview ${role}`,exact:true}).click();
  await expect(navigation(page)).toContainText(role==='admin'?'Admin preview':'Learner preview');
}

test('a guest chooses the learner introduction without receiving staff controls',async({page})=>{
  await start(page);
  await expect(guide(page)).toHaveCount(0);
  await expect(opener(page)).toHaveAttribute('aria-expanded','false');
  await opener(page).click();
  await expect(guide(page).getByRole('heading',{name:'Getting started as a learner',exact:true})).toBeVisible();
  await expect(guide(page)).toContainText('creating an account does not grant admin access');
  await expect(guide(page)).toContainText('No email is sent and no password is stored');
  await expect(guide(page).getByRole('button',{name:/admin/i})).toHaveCount(0);
  await expect(navigation(page).getByRole('button',{name:'New course',exact:true})).toHaveCount(0);
  await preview(page,'learner');
  await expect(guide(page)).toHaveCount(0);
  await expect(opener(page)).toHaveAttribute('aria-expanded','false');
});

test('a learner can read, step back, close with Escape and reopen by keyboard without side effects',async({page})=>{
  await start(page);await preview(page,'learner');
  const requests:string[]=[];
  page.on('request',request=>requests.push(request.url()));
  const storageBefore=await page.evaluate(()=>({local:{...localStorage},session:{...sessionStorage}}));
  await opener(page).focus();await opener(page).press('Enter');
  await expect(guide(page).getByRole('heading',{name:'Sign in with your invited email',exact:true})).toBeFocused();
  await expect(guide(page).getByRole('button',{name:'Back',exact:true})).toBeDisabled();
  await guide(page).getByRole('button',{name:'Next',exact:true}).focus();
  await guide(page).getByRole('button',{name:'Next',exact:true}).press('Enter');
  await expect(guide(page).getByRole('heading',{name:'Find a course and open its materials',exact:true})).toBeFocused();
  await expect(guide(page)).toContainText('Step 2 of 6');
  await guide(page).getByRole('button',{name:'Back',exact:true}).focus();
  await guide(page).getByRole('button',{name:'Back',exact:true}).press('Enter');
  await expect(guide(page).getByRole('heading',{name:'Sign in with your invited email',exact:true})).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(guide(page)).toHaveCount(0);await expect(opener(page)).toBeFocused();
  await opener(page).press('Enter');
  await expect(guide(page)).toContainText('Step 1 of 6');
  for(let index=0;index<5;index++)await guide(page).getByRole('button',{name:'Next',exact:true}).click();
  await expect(guide(page).getByRole('heading',{name:'Ask for help and return when ready',exact:true})).toBeFocused();
  await expect(guide(page)).toContainText('records no completion or mastery');
  await guide(page).getByRole('button',{name:'Return to your work',exact:true}).click();
  await expect(opener(page)).toBeFocused();
  expect(await page.evaluate(()=>({local:{...localStorage},session:{...sessionStorage}}))).toEqual(storageBefore);
  expect(requests).toEqual([]);
});

test('admin guidance follows assigned access and disappears when the account role changes',async({page})=>{
  await start(page);await preview(page,'admin');await opener(page).click();
  await expect(guide(page).getByRole('heading',{name:'Getting started as an admin',exact:true})).toBeVisible();
  await expect(guide(page)).toContainText('Staff roles are assigned by the library service administrator');
  await guide(page).getByRole('button',{name:'Next',exact:true}).click();
  await expect(guide(page)).toContainText('record permission or content rights for each lesson');
  await guide(page).getByRole('button',{name:'Next',exact:true}).click();
  await expect(guide(page)).toContainText('Email delivery depends on the configured service');
  await expect(guide(page)).toContainText('Revoke invitation');
  await guide(page).getByRole('button',{name:'Next',exact:true}).click();
  await expect(guide(page)).toContainText('becomes its assigned teacher');
  await preview(page,'learner');
  await expect(guide(page)).toHaveCount(0);
  await opener(page).click();
  await expect(guide(page).getByRole('heading',{name:'Sign in with your invited email',exact:true})).toBeFocused();
  await expect(guide(page)).toContainText('Step 1 of 6');
  await expect(page.getByRole('heading',{name:'Getting started as an admin',exact:true})).toHaveCount(0);
  await navigation(page).getByRole('button',{name:'Sign out',exact:true}).click();
  await expect(guide(page)).toHaveCount(0);
});

test('opening and navigating help retains a support draft and its unsaved-edit protection',async({page})=>{
  await start(page);await preview(page,'learner');
  await navigation(page).getByRole('button',{name:'Support',exact:true}).click();
  await page.getByLabel('Subject',{exact:true}).fill('A question I am still writing');
  await page.getByLabel('Your message',{exact:true}).fill('UNSENT_TUTORIAL_DRAFT: Please keep this while I read help.');
  let confirmations=0;
  page.on('dialog',async dialog=>{confirmations++;await dialog.dismiss();});
  await opener(page).click();
  await guide(page).getByRole('button',{name:'Next',exact:true}).click();
  await guide(page).getByRole('button',{name:'Next',exact:true}).click();
  await guide(page).getByRole('button',{name:'Close guide',exact:true}).click();
  await opener(page).click();await page.keyboard.press('Escape');
  await expect(page.getByLabel('Subject',{exact:true})).toHaveValue('A question I am still writing');
  await expect(page.getByLabel('Your message',{exact:true})).toHaveValue('UNSENT_TUTORIAL_DRAFT: Please keep this while I read help.');
  expect(confirmations).toBe(0);
  await navigation(page).getByRole('button',{name:'Courses',exact:true}).click();
  expect(confirmations).toBe(1);
  await expect(page.getByLabel('Your message',{exact:true})).toHaveValue('UNSENT_TUTORIAL_DRAFT: Please keep this while I read help.');
  await expect(page.locator('.portal-support-thread')).toHaveCount(0);
});

test('both guides remain readable, keyboard accessible and within a narrow viewport',async({page})=>{
  await start(page);
  for(const role of ['learner','admin'] as const){
    await preview(page,role);await opener(page).click();
    for(const width of [320,768,1024,1440]){
      await page.setViewportSize({width,height:900});
      expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`${role} page reflows at ${width}`).toBe(true);
      expect(await guide(page).evaluate(element=>element.scrollWidth<=element.clientWidth+1),`${role} guide reflows at ${width}`).toBe(true);
    }
    const result=await new AxeBuilder({page}).include('.portal-tutorial').withTags(['wcag2a','wcag2aa','wcag21aa','wcag22aa']).analyze();
    expect(result.violations.map(violation=>({id:violation.id,nodes:violation.nodes.map(node=>node.target)}))).toEqual([]);
    for(const control of await guide(page).getByRole('button').all()){
      const bounds=await control.boundingBox();expect(bounds?.height).toBeGreaterThanOrEqual(44);
    }
    await guide(page).getByRole('button',{name:'Close guide',exact:true}).click();
  }
});
