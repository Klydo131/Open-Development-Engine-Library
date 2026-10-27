import {test, expect, type Page} from '@playwright/test';

const reviewLabel='I reviewed the text, source credits and permission to publish each lesson.';
const navigation=(page:Page)=>page.getByRole('navigation',{name:'Learning library',exact:true});
const controls=(page:Page)=>page.getByRole('region',{name:'Demo account controls',exact:true});

async function start(page:Page,role:'learner'|'admin'){
  await page.goto('/portal.html');
  await controls(page).getByRole('button',{name:`Preview ${role}`,exact:true}).click();
  await expect(navigation(page)).toContainText(role==='admin'?'Admin preview':'Learner preview');
}

test('structured lessons support private explanation, optional comparison and guarded navigation',async({page})=>{
  const canary='LOCAL_LESSON_EXPLANATION_CANARY';
  const leakedRequests:string[]=[];
  page.on('request',request=>{if(request.url().includes(canary)||request.postData()?.includes(canary))leakedRequests.push(request.url());});
  await start(page,'learner');
  await page.getByRole('button',{name:'Explore Notice motion',exact:true}).click();
  for(const name of ['Learning goal','Connect what you know','Worked example','Practise','Check your understanding']){
    await expect(page.getByRole('heading',{name,exact:true})).toBeVisible();
  }
  const answer=page.getByLabel('Your explanation',{exact:true});
  const reveal=page.getByText('Show explanation',{exact:true});
  await expect(reveal.locator('..')).not.toHaveAttribute('open','');
  await answer.fill(canary);
  await reveal.focus();await reveal.press('Enter');
  await expect(reveal.locator('..')).toHaveAttribute('open','');
  await expect(answer).toHaveValue(canary);

  const second=page.getByRole('navigation',{name:'Course lessons',exact:true}).getByRole('button',{name:'2 When forces balance',exact:true});
  page.once('dialog',dialog=>dialog.dismiss());await second.click();
  await expect(answer).toHaveValue(canary);
  await expect(second).not.toHaveAttribute('aria-current','step');
  page.once('dialog',dialog=>dialog.accept());await second.click();
  await expect(second).toHaveAttribute('aria-current','step');
  await expect(page.getByLabel('Your explanation',{exact:true})).toHaveValue('');
  await expect(page.getByText('Show explanation',{exact:true}).locator('..')).not.toHaveAttribute('open','');
  await page.getByLabel('Your explanation',{exact:true}).fill(canary);
  page.once('dialog',dialog=>dialog.accept());
  await controls(page).getByRole('button',{name:'Preview admin',exact:true}).click();
  await expect(navigation(page)).toContainText('Admin preview');
  await navigation(page).getByRole('button',{name:'Support',exact:true}).click();
  await expect(page.getByText('No support requests yet.',{exact:true})).toBeVisible();
  expect(leakedRequests).toEqual([]);
  expect(await page.evaluate(value=>[localStorage,sessionStorage].some(store=>Object.keys(store).some(key=>store.getItem(key)?.includes(value))),canary)).toBe(false);
  await navigation(page).getByRole('button',{name:'Courses',exact:true}).click();
  await page.getByRole('button',{name:'Explore Notice motion',exact:true}).click();
  await expect(page.getByLabel('Your explanation',{exact:true})).toHaveValue('');
  await expect(page.getByText('Show explanation',{exact:true}).locator('..')).not.toHaveAttribute('open','');
});

test('admins can save partial teaching drafts and publish reviewed guides as escaped learner content',async({page})=>{
  const title='A class with an explained example';
  const literal='<img src=x onerror="window.lessonGuideInjected=true"> A narrated original example.';
  await start(page,'admin');
  await navigation(page).getByRole('button',{name:'New course',exact:true}).click();
  await page.getByLabel('Course title',{exact:true}).fill(title);
  await page.getByLabel('Course purpose',{exact:true}).fill('Explain one familiar observation, then apply the idea in another example.');
  await page.getByLabel('Lesson 1 title',{exact:true}).fill('An original guided lesson');
  await page.getByLabel('Lesson 1 text').fill('The explanation is separate from its example and the learner practice.');
  await page.getByLabel('Lesson 1 creator or source credit',{exact:true}).fill('Original test educator');
  await page.getByLabel('Lesson 1 content rights').fill('Original material, CC BY 4.0.');
  await page.getByLabel('Add a teaching guide',{exact:true}).check();
  await page.getByLabel('Learning goal',{exact:true}).fill('Explain an observation using a reason, not just a label.');
  await page.getByRole('button',{name:'Save draft',exact:true}).click();
  await expect(page.getByRole('status')).toContainText('Your course draft is saved.');
  await expect(page.getByLabel('Learning goal',{exact:true})).toHaveValue('Explain an observation using a reason, not just a label.');
  await navigation(page).getByRole('button',{name:'Courses',exact:true}).click();
  await controls(page).getByRole('button',{name:'Preview learner',exact:true}).click();
  await expect(page.getByRole('button',{name:`Explore ${title}`,exact:true})).toHaveCount(0);
  await controls(page).getByRole('button',{name:'Preview admin',exact:true}).click();
  await page.getByRole('button',{name:`Explore ${title}`,exact:true}).click();
  await page.getByRole('button',{name:'Edit course',exact:true}).click();
  await expect(page.getByLabel('Add a teaching guide',{exact:true})).toBeChecked();
  await expect(page.getByLabel('Worked example',{exact:true})).toHaveValue('');
  await page.getByLabel(reviewLabel,{exact:true}).check();
  await page.getByRole('button',{name:'Publish course',exact:true}).click();
  await expect(page.getByRole('alert')).toContainText(/guide|goal|example|practice|question|explanation/i);
  await page.getByLabel('Familiar connection',{exact:true}).fill('Think about an everyday observation you can describe without sharing personal information.');
  await page.getByLabel('Worked example',{exact:true}).fill(literal);
  await page.getByLabel('Practice task',{exact:true}).fill('Describe another fictional observation and explain one useful connection.');
  await page.getByLabel('Check question',{exact:true}).fill('Why does your reason support the explanation?');
  await page.getByLabel('Explanation to compare',{exact:true}).fill('Compare the evidence and the reason. A label alone does not explain the connection.');
  await expect(page.getByLabel(reviewLabel,{exact:true})).not.toBeChecked();
  await page.getByLabel(reviewLabel,{exact:true}).check();
  await page.getByRole('button',{name:'Publish course',exact:true}).click();
  await expect(page.getByRole('status')).toContainText('Your reviewed course is published.');
  await expect(page.locator('.portal-guide-editor')).toContainText('Complete the guide before publishing reviewed changes to this published course.');
  await expect(page.locator('.portal-guide-editor')).not.toContainText('Save an unfinished guide with Save draft.');
  await controls(page).getByRole('button',{name:'Preview learner',exact:true}).click();
  await page.getByRole('button',{name:`Explore ${title}`,exact:true}).click();
  await expect(page.getByRole('heading',{name:'Learning goal',exact:true})).toBeVisible();
  await expect(page.getByText(literal,{exact:true})).toBeVisible();
  await expect(page.locator('img[src="x"]')).toHaveCount(0);
  expect(await page.evaluate(()=>Object.hasOwn(window,'lessonGuideInjected'))).toBe(false);
  await expect(page.getByRole('button',{name:'Edit course',exact:true})).toHaveCount(0);
  await expect(page.getByLabel('Learning goal',{exact:true})).toHaveCount(0);
});
