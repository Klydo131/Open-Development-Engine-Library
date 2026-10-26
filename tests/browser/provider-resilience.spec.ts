import {test,expect,type Page} from '@playwright/test';
import type {GroupPost,SupportThread,TeacherRequest} from '../../packages/portal/src/index.ts';

const provider='https://portal-fixture.example';
const id='10000000-0000-0000-0000-000000000001';
const groupId='20000000-0000-0000-0000-000000000001';
const course={id:'30000000-0000-0000-0000-000000000001',revision:'30000000-0000-0000-0000-000000000002',title:'A resilient course',summary:'Keep learning during a help-service outage.',language:'en',status:'published',lessons:[{id:'30000000-0000-0000-0000-000000000003',title:'A useful lesson',text:'VERIFIED_LESSON_MATERIAL',sourceUrl:'',credit:'Original educator',rights:'CC BY 4.0',mediaType:'text'}]};
const group={id:groupId,revision:'20000000-0000-0000-0000-000000000002',title:'A resilient group',description:'A shared study space.',kind:'group',facilitatorId:id};
const nav=(page:Page)=>page.getByRole('navigation',{name:'Learning library',exact:true});

async function service(page:Page,role:'learner'|'admin',queuesReady=false){
  const state={supportDown:!queuesReady,teachersDown:!queuesReady,verificationFails:false,signedIn:false,role,posts:[] as GroupPost[],support:[] as SupportThread[],teachers:[] as TeacherRequest[]};
  if(queuesReady){
    state.support.push({id:'40000000-0000-0000-0000-000000000001',revision:'40000000-0000-0000-0000-000000000002',learnerId:id,subject:'A loaded support question',message:'A chosen question.',reply:'',status:'open'});
    state.teachers.push({id:'50000000-0000-0000-0000-000000000001',learnerId:id,subject:'A loaded teacher request',message:'Help with an original topic.',status:'open'});
  }
  const user={id,aud:'authenticated',role:'authenticated',email:`${role}@example.org`,email_confirmed_at:'2026-10-21T00:00:00Z',app_metadata:{provider:'email',providers:['email']},user_metadata:{},identities:[],created_at:'2026-10-21T00:00:00Z'};
  const part=(value:unknown)=>Buffer.from(JSON.stringify(value)).toString('base64url');
  const accessToken=`${part({alg:'HS256',typ:'JWT'})}.${part({sub:id,exp:Math.floor(Date.now()/1000)+3600,aud:'authenticated',role:'authenticated'})}.synthetic-signature`;
  await page.route(`${provider}/**`,async route=>{
    const request=route.request(),path=new URL(request.url()).pathname;
    const headers={'Content-Type':'application/json','Access-Control-Allow-Origin':'http://127.0.0.1:4179','Access-Control-Allow-Headers':'*','Access-Control-Allow-Methods':'GET,POST,OPTIONS'};
    if(request.method()==='OPTIONS'){await route.fulfill({status:204,headers});return;}
    let body:unknown;
    if(path==='/auth/v1/token'){state.signedIn=true;body={access_token:accessToken,refresh_token:'synthetic-refresh-token',token_type:'bearer',expires_in:3600,user};}
    else if(path==='/auth/v1/user'){
      if(state.verificationFails){await route.fulfill({status:401,headers,body:JSON.stringify({code:'bad_jwt',msg:'Synthetic expired account'})});return;}
      body=user;
    }else if(path==='/rest/v1/rpc/portal_role')body=state.role;
    else if(path==='/rest/v1/rpc/portal_list_courses')body=[{...course,lessons:state.signedIn?course.lessons:[]}];
    else if(path==='/rest/v1/rpc/portal_support'||path==='/rest/v1/rpc/portal_teacher_requests'){
      if(path.endsWith('portal_support')?state.supportDown:state.teachersDown){await route.fulfill({status:503,headers,body:JSON.stringify({code:'temporarily_unavailable',message:'Synthetic service outage'})});return;}
      body=path.endsWith('portal_support')?state.support:state.teachers;
    }else if(path==='/rest/v1/rpc/portal_groups')body=[group];
    else if(path==='/rest/v1/rpc/portal_group_posts')body=state.posts;
    else if(path==='/rest/v1/rpc/portal_add_group_post'){
      state.posts.push({id:'60000000-0000-0000-0000-000000000001',groupId,authorId:id,authorRole:state.role,body:request.postDataJSON().p_body,createdAt:'2026-10-26T00:00:00Z'});body=null;
    }else if(['/rest/v1/rpc/portal_group_sessions','/rest/v1/rpc/portal_group_invitations','/rest/v1/rpc/portal_group_members'].includes(path))body=[];
    else throw new Error(`Unexpected synthetic provider request: ${request.method()} ${path}`);
    await route.fulfill({status:200,headers,body:JSON.stringify(body)});
  });
  await page.goto('http://127.0.0.1:4179/portal.html');
  await nav(page).getByRole('button',{name:'Sign in',exact:true}).click();
  await page.getByLabel('Email address',{exact:true}).fill(user.email);
  await page.getByLabel('Account password',{exact:true}).fill('Synthetic browser account passphrase');
  await page.locator('.portal-auth').getByRole('button',{name:'Sign in',exact:true}).click();
  await expect(nav(page)).toContainText(user.email);
  return state;
}

for(const role of ['learner','admin'] as const){
  test(`${role} keeps course and group access during help outages and can retry`,async({page})=>{
    const state=await service(page,role);
    await page.getByRole('button',{name:'Explore A resilient course',exact:true}).click();
    await expect(page.locator('.portal-lesson')).toContainText('VERIFIED_LESSON_MATERIAL');
    await nav(page).getByRole('button',{name:'Support',exact:true}).click();
    await expect(page.getByRole('alert')).toContainText('Support requests are temporarily unavailable. Your courses remain available.');
    await expect(page.getByText('No support requests yet.',{exact:true})).toHaveCount(0);
    state.supportDown=false;
    await page.getByRole('button',{name:'Retry support requests',exact:true}).click();
    await expect(page.getByText('No support requests yet.',{exact:true})).toBeVisible();
    if(role==='learner'){
      await page.getByLabel('Subject',{exact:true}).fill('A question in progress');
      await page.getByLabel('Your message',{exact:true}).fill('Keep this unsent question while retrying.');
      state.supportDown=true;
      await page.getByRole('button',{name:'Refresh support requests',exact:true}).click();
      await expect(page.getByRole('alert')).toContainText('Support requests are temporarily unavailable.');
      await expect(page.getByRole('button',{name:'Submit support request',exact:true})).toBeDisabled();
      state.supportDown=false;
      await page.getByRole('button',{name:'Retry support requests',exact:true}).click();
      await expect(page.getByLabel('Your message',{exact:true})).toHaveValue('Keep this unsent question while retrying.');
      page.once('dialog',dialog=>dialog.accept());
    }
    await nav(page).getByRole('button',{name:'Study groups',exact:true}).click();
    await page.getByRole('button',{name:'Open A resilient group',exact:true}).click();
    await expect(page.getByRole('heading',{name:'Discussion',exact:true})).toBeVisible();
    await expect(page.getByLabel('Your discussion message',{exact:true})).toBeVisible();
    await page.getByLabel('Your discussion message',{exact:true}).fill('A shared idea remains visible after saving.');
    await page.getByRole('button',{name:'Share message',exact:true}).click();
    await expect(page.locator('.group-posts')).toContainText('A shared idea remains visible after saving.');
    await expect(page.getByLabel('Your discussion message',{exact:true})).toHaveValue('');
    await page.getByRole('button',{name:'Teacher support',exact:true}).click();
    await expect(page.getByRole('alert')).toContainText('Teacher requests are temporarily unavailable. Your study groups remain available.');
    await expect(page.getByText('No teacher requests yet.',{exact:true})).toHaveCount(0);
    state.teachersDown=false;
    await page.getByRole('button',{name:'Retry teacher requests',exact:true}).click();
    await expect(page.getByText('No teacher requests yet.',{exact:true})).toBeVisible();
    if(role==='learner'){
      await page.getByLabel('What would you like to learn?',{exact:true}).fill('An unfinished topic');
      await page.getByLabel('How can a teacher help?',{exact:true}).fill('Keep this private request draft while retrying.');
      state.teachersDown=true;
      await page.getByRole('button',{name:'Refresh teacher requests',exact:true}).click();
      await expect(page.getByRole('alert')).toContainText('Teacher requests are temporarily unavailable.');
      await expect(page.getByRole('button',{name:'Request a teacher',exact:true})).toBeDisabled();
      state.teachersDown=false;
      await page.getByRole('button',{name:'Retry teacher requests',exact:true}).click();
      await expect(page.getByLabel('How can a teacher help?',{exact:true})).toHaveValue('Keep this private request draft while retrying.');
    }
  });
}

test('staff reply and private-room drafts survive a verified help-service outage',async({page})=>{
  const state=await service(page,'admin',true);
  await nav(page).getByRole('button',{name:'Support',exact:true}).click();
  const reply=page.getByLabel('Reply to A loaded support question',{exact:true});
  await reply.fill('An unsent staff reply.');
  state.supportDown=true;
  await page.getByRole('button',{name:'Refresh support requests',exact:true}).click();
  await expect(page.getByRole('alert')).toContainText('Support requests are temporarily unavailable.');
  await expect(reply).toBeDisabled();await expect(reply).toHaveValue('An unsent staff reply.');
  state.supportDown=false;
  await page.getByRole('button',{name:'Retry support requests',exact:true}).click();
  await expect(reply).toBeEnabled();await expect(reply).toHaveValue('An unsent staff reply.');
  page.once('dialog',dialog=>dialog.accept());
  await nav(page).getByRole('button',{name:'Study groups',exact:true}).click();
  await page.getByRole('button',{name:'Teacher support',exact:true}).click();
  await page.getByText('Open a private teacher room',{exact:true}).click();
  const title=page.getByLabel('Private room title',{exact:true}),purpose=page.getByRole('textbox',{name:'Private room purpose',exact:true});
  await title.fill('A title still being prepared');await purpose.fill('An unsent purpose for the private room.');
  state.teachersDown=true;
  await page.getByRole('button',{name:'Refresh teacher requests',exact:true}).click();
  await expect(page.getByRole('alert')).toContainText('Teacher requests are temporarily unavailable.');
  await expect(title).toBeDisabled();await expect(purpose).toHaveValue('An unsent purpose for the private room.');
  state.teachersDown=false;
  await page.getByRole('button',{name:'Retry teacher requests',exact:true}).click();
  await expect(title).toBeEnabled();await expect(title).toHaveValue('A title still being prepared');
  await expect(purpose).toHaveValue('An unsent purpose for the private room.');
});

for(const failure of ['account verification fails','the staff role changes'] as const){
test(`help retry clears privileged state when ${failure}`,async({page})=>{
  const state=await service(page,'admin',true);
  await expect(nav(page).getByRole('button',{name:'New course',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Explore A resilient course',exact:true}).click();
  await expect(page.locator('.portal-lesson')).toContainText('VERIFIED_LESSON_MATERIAL');
  await nav(page).getByRole('button',{name:'Support',exact:true}).click();
  await expect(page.locator('.portal-support-thread')).toContainText('A chosen question.');
  state.supportDown=true;
  if(failure==='account verification fails')state.verificationFails=true;
  else state.role='learner';
  await page.getByRole('button',{name:'Refresh support requests',exact:true}).click();
  await expect(nav(page).getByRole('button',{name:'Sign in',exact:true})).toBeVisible();
  await expect(nav(page).getByRole('button',{name:'New course',exact:true})).toHaveCount(0);
  await expect(nav(page).getByRole('button',{name:'Support',exact:true})).toHaveCount(0);
  await expect(page.locator('body')).not.toContainText('VERIFIED_LESSON_MATERIAL');
  await expect(page.locator('body')).not.toContainText('A chosen question.');
});
}
