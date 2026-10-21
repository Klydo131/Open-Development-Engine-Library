import {test,expect,type Page} from '@playwright/test';

const pass='a private draft room 2026';
const initialNotes='Synthetic notes already saved.';

async function observeDraftLifecycle(page:Page){
  await page.addInitScript(()=>{
    const listeners=new Set<EventListenerOrEventListenerObject>();
    const add=window.addEventListener.bind(window);
    const remove=window.removeEventListener.bind(window);
    window.addEventListener=((type:string,listener:EventListenerOrEventListenerObject|null,options?:boolean|AddEventListenerOptions)=>{
      if(type==='beforeunload'&&listener)listeners.add(listener);
      if(listener)return add(type,listener,options);
    }) as typeof window.addEventListener;
    window.removeEventListener=((type:string,listener:EventListenerOrEventListenerObject|null,options?:boolean|EventListenerOptions)=>{
      if(type==='beforeunload'&&listener)listeners.delete(listener);
      if(listener)return remove(type,listener,options);
    }) as typeof window.removeEventListener;
    Object.defineProperty(window,'__draftUnloadCount',{get:()=>listeners.size});
  });
}
async function draftListenerCount(page:Page){return page.evaluate(()=>(window as any).__draftUnloadCount as number);}
async function createRoom(page:Page){
  await page.goto('/');await page.getByRole('button',{name:'Create your room',exact:true}).click();
  await page.getByLabel('Passphrase',{exact:true}).fill(pass);await page.getByLabel('Confirm passphrase').fill(pass);
  await page.getByRole('button',{name:'Create & start learning'}).click();
  await expect(page.getByRole('heading',{name:'Follow your curiosity.'})).toBeVisible();
}
async function unlock(page:Page){
  await page.getByLabel('Passphrase',{exact:true}).fill(pass);await page.getByRole('button',{name:'Unlock & start learning'}).click();
  await expect(page.getByRole('heading',{name:'Follow your curiosity.'})).toBeVisible();
}
async function addNote(page:Page,title='Draft guard source'){
  await page.getByRole('button',{name:'Add a source',exact:true}).click();await page.getByLabel('My own note').check();
  await page.getByLabel('Title',{exact:true}).fill(title);await page.getByLabel('A thought to begin with').fill(initialNotes);
  await page.getByRole('button',{name:'Add to learning room'}).click();
  await expect(page.getByLabel('Learning notes')).toHaveValue(initialNotes);
}
async function chooseDiscard(page:Page,action:()=>Promise<unknown>,discard=false){
  const pending=page.waitForEvent('dialog');const started=action();const dialog=await pending;
  expect(dialog.type()).toBe('confirm');expect(dialog.message()).toMatch(/unsaved/i);
  if(discard)await dialog.accept();else await dialog.dismiss();await started;
}
async function saved(page:Page){
  return page.evaluate(()=>new Promise<string>((resolve,reject)=>{
    const request=indexedDB.open('open-learning-rooms');request.onsuccess=()=>{
      const db=request.result;const read=db.transaction('vaults').objectStore('vaults').get('library');
      read.onsuccess=()=>{resolve(JSON.stringify(read.result));db.close();};read.onerror=()=>reject(read.error);
    };request.onerror=()=>reject(request.error);
  }));
}

test('lesson drafts survive cancelled room, back and home navigation, and are discarded only by choice',async({page})=>{
  await createRoom(page);await addNote(page);const original=await saved(page);
  const notes=page.getByLabel('Learning notes');await notes.fill('A private draft that is not saved.');
  for(const action of [()=>page.getByRole('button',{name:'Catalog',exact:true}).click(),()=>page.getByRole('button',{name:'Back to your sources',exact:true}).click(),()=>page.getByRole('button',{name:'Home',exact:true}).click()]){
    await chooseDiscard(page,action);await expect(notes).toHaveValue('A private draft that is not saved.');
  }
  expect(await saved(page)).toEqual(original);
  await chooseDiscard(page,()=>page.getByRole('button',{name:'Catalog',exact:true}).click(),true);
  await expect(page.getByRole('heading',{name:'Make space for your ideas.'})).toBeVisible();
  await page.getByRole('button',{name:/^Learn(?:\s|$)/}).click();await page.locator('.source-card').first().click();
  await expect(notes).toHaveValue(initialNotes);await notes.fill('Another deliberate draft.');
  await chooseDiscard(page,()=>page.getByRole('button',{name:'Back to your sources',exact:true}).click(),true);
  await expect(page.getByRole('heading',{name:'Follow your curiosity.'})).toBeVisible();await page.locator('.source-card').first().click();
  await expect(notes).toHaveValue(initialNotes);await notes.fill('A last draft before going home.');
  await chooseDiscard(page,()=>page.getByRole('button',{name:'Home',exact:true}).click(),true);
  await expect(page.getByRole('heading',{name:/A little room/})).toBeVisible();
  await page.getByRole('button',{name:'Enter your room',exact:false}).click();await unlock(page);await page.locator('.source-card').first().click();await expect(notes).toHaveValue(initialNotes);
});

test('saving or reverting a lesson draft removes the unload listener and allows navigation without a prompt',async({page})=>{
  await observeDraftLifecycle(page);await createRoom(page);await addNote(page);await expect.poll(()=>draftListenerCount(page)).toBe(0);
  const notes=page.getByLabel('Learning notes');await notes.fill('A changed note.');await expect.poll(()=>draftListenerCount(page)).toBe(1);
  await notes.fill(initialNotes);await expect.poll(()=>draftListenerCount(page)).toBe(0);
  await notes.fill('A successfully saved note.');await expect.poll(()=>draftListenerCount(page)).toBe(1);
  await page.getByRole('button',{name:'Save learning notes',exact:true}).click();await expect(page.getByRole('status')).toContainText('Saved');
  await expect.poll(()=>draftListenerCount(page)).toBe(0);
  const prompts:string[]=[];page.on('dialog',async dialog=>{prompts.push(dialog.message());await dialog.dismiss();});
  await page.getByRole('button',{name:'Catalog',exact:true}).click();await expect(page.getByRole('heading',{name:'Make space for your ideas.'})).toBeVisible();
  expect(prompts).toEqual([]);await page.getByRole('button',{name:/^Learn(?:\s|$)/}).click();await page.locator('.source-card').first().click();await expect(notes).toHaveValue('A successfully saved note.');
});

test('a stale tab save failure keeps the lesson draft dirty and leaves the latest saved copy intact',async({page,context})=>{
  await createRoom(page);await addNote(page);const second=await context.newPage();await second.goto('/');await second.getByRole('button',{name:'Enter your room',exact:false}).click();await unlock(second);await second.locator('.source-card').first().click();
  await page.getByLabel('Learning notes').fill('A newer note saved by the first tab.');await page.getByRole('button',{name:'Save learning notes',exact:true}).click();await expect(page.getByRole('status')).toContainText('Saved');const newest=await saved(page);
  await second.getByLabel('Learning notes').fill('A stale tab draft that still needs care.');await second.getByRole('button',{name:'Save learning notes',exact:true}).click();await expect(second.getByRole('alert')).toContainText('another tab');
  await chooseDiscard(second,()=>second.getByRole('button',{name:'Catalog',exact:true}).click());await expect(second.getByLabel('Learning notes')).toHaveValue('A stale tab draft that still needs care.');
  expect(await saved(second)).toEqual(newest);
});

test('typing during a pending save remains an unsaved draft after that save completes',async({page})=>{
  await observeDraftLifecycle(page);
  await page.addInitScript(()=>{
    const encrypt=crypto.subtle.encrypt.bind(crypto.subtle);
    Object.defineProperty(crypto.subtle,'encrypt',{configurable:true,value:async(...args:Parameters<SubtleCrypto['encrypt']>)=>{
      if((window as any).__holdDraftSave)await new Promise<void>(resolve=>{(window as any).__releaseDraftSave=resolve;(window as any).__draftSaveBlocked=true;});
      return encrypt(...args);
    }});
  });
  await createRoom(page);await addNote(page);await page.evaluate(()=>{(window as any).__holdDraftSave=true;});
  await page.getByLabel('Learning notes').fill('The note captured by this save.');await page.getByRole('button',{name:'Save learning notes',exact:true}).click();await page.waitForFunction(()=>(window as any).__draftSaveBlocked===true);
  await page.getByLabel('Learning notes').fill('More thoughts typed while the save was running.');
  await page.evaluate(()=>{(window as any).__holdDraftSave=false;(window as any).__releaseDraftSave();});await expect(page.getByRole('status')).toContainText('Saved');
  await expect(page.getByLabel('Learning notes')).toHaveValue('More thoughts typed while the save was running.');await expect.poll(()=>draftListenerCount(page)).toBe(1);
  await chooseDiscard(page,()=>page.getByRole('button',{name:'Catalog',exact:true}).click());await expect(page.getByLabel('Learning notes')).toHaveValue('More thoughts typed while the save was running.');
  await page.getByRole('button',{name:'Save learning notes',exact:true}).click();await expect.poll(()=>draftListenerCount(page)).toBe(0);
  await page.getByRole('button',{name:'Back to your sources',exact:true}).click();await page.locator('.source-card').first().click();await expect(page.getByLabel('Learning notes')).toHaveValue('More thoughts typed while the save was running.');
});

test('catalog selection preserves an edited source when discarding is cancelled',async({page})=>{
  await page.goto('/');await page.getByRole('button',{name:'Explore a sample',exact:false}).click();await expect(page.getByRole('heading',{name:'Follow your curiosity.'})).toBeVisible();await page.getByRole('button',{name:'Catalog',exact:true}).click();
  const rows=page.locator('.catalog-row');const first=await rows.nth(0).locator('strong').innerText();const second=await rows.nth(1).locator('strong').innerText();
  await rows.nth(0).click();await page.getByLabel('Source title',{exact:true}).fill('A catalog title still in progress.');
  await chooseDiscard(page,()=>rows.nth(1).click());await expect(page.getByLabel('Source title',{exact:true})).toHaveValue('A catalog title still in progress.');await expect(rows.nth(0)).toHaveClass(/selected/);
  await chooseDiscard(page,()=>rows.nth(1).click(),true);await expect(page.getByLabel('Source title',{exact:true})).toHaveValue(second);await rows.nth(0).click();await expect(page.getByLabel('Source title',{exact:true})).toHaveValue(first);
});

test('closing a partly written new source asks before discarding it, including Escape',async({page})=>{
  await createRoom(page);await page.getByRole('button',{name:'Add a source',exact:true}).click();await page.getByLabel('Title',{exact:true}).fill('A source I am still choosing.');
  await chooseDiscard(page,()=>page.getByRole('button',{name:'Close dialog',exact:true}).click());await expect(page.getByRole('dialog').getByLabel('Title',{exact:true})).toHaveValue('A source I am still choosing.');
  await chooseDiscard(page,()=>page.keyboard.press('Escape'));await expect(page.getByRole('dialog').getByLabel('Title',{exact:true})).toHaveValue('A source I am still choosing.');
  await chooseDiscard(page,()=>page.getByRole('button',{name:'Close dialog',exact:true}).click(),true);await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByRole('button',{name:'Add a source',exact:true}).click();await expect(page.getByLabel('Title',{exact:true})).toHaveValue('');
  const prompts:string[]=[];page.on('dialog',async dialog=>{prompts.push(dialog.message());await dialog.dismiss();});await page.getByRole('button',{name:'Close dialog',exact:true}).click();await expect(page.getByRole('dialog')).toHaveCount(0);expect(prompts).toEqual([]);
});

test('practice reflection drafts survive cancelled navigation and disappear only after confirmed discard',async({page})=>{
  await createRoom(page);await addNote(page);await page.getByRole('button',{name:'Practice this lesson',exact:true}).click();await expect(page.getByRole('heading',{name:'Make something of it.'})).toBeVisible();
  await page.getByLabel('What did you discover?').fill('An unfinished reflection on the practice.');await chooseDiscard(page,()=>page.getByRole('button',{name:/^Learn(?:\s|$)/}).click());await expect(page.getByLabel('What did you discover?')).toHaveValue('An unfinished reflection on the practice.');
  await chooseDiscard(page,()=>page.getByRole('button',{name:/^Learn(?:\s|$)/}).click(),true);await expect(page.getByRole('heading',{name:'Follow your curiosity.'})).toBeVisible();await page.getByRole('button',{name:/^Apply/}).click();await expect(page.getByLabel('What did you discover?')).toHaveValue('');
});

test('explicit locking and pagehide bypass draft prompts and clear private form values',async({page})=>{
  await observeDraftLifecycle(page);await createRoom(page);await addNote(page);
  const prompts:string[]=[];page.on('dialog',async dialog=>{prompts.push(dialog.message());await dialog.dismiss();});
  for(const mode of ['explicit','pagehide']){
    const secret=`Synthetic private ${mode} draft.`;await page.getByLabel('Learning notes').fill(secret);await expect.poll(()=>draftListenerCount(page)).toBe(1);
    if(mode==='explicit')await page.getByRole('button',{name:'Lock room',exact:true}).click();else await page.evaluate(()=>window.dispatchEvent(new Event('pagehide')));
    await expect(page.getByRole('heading',{name:'Unlock your room'})).toBeVisible();await expect(page.getByLabel('Learning notes')).toHaveCount(0);await expect.poll(()=>draftListenerCount(page)).toBe(0);
    expect(await page.locator('body').innerText()).not.toContain(secret);expect(await page.locator('textarea').evaluateAll(elements=>elements.map(element=>(element as HTMLTextAreaElement).value))).not.toContain(secret);
    await unlock(page);await page.locator('.source-card').first().click();await expect(page.getByLabel('Learning notes')).toHaveValue(initialNotes);
  }
  expect(prompts).toEqual([]);
});



test('creating a collection preserves unsaved catalog details and reconciles new membership controls',async({page})=>{
 await page.goto('/');await page.getByRole('button',{name:'Explore a sample'}).click();await page.getByRole('button',{name:'Catalog',exact:true}).click();await page.locator('.catalog-row').first().click();await page.getByLabel('Source title',{exact:true}).fill('Catalog detail still in progress');await page.getByLabel('New collection').fill('A new shelf');await page.getByRole('button',{name:'Create collection',exact:true}).click();await expect(page.getByRole('status')).toContainText(/Updated|Saved/);await expect(page.getByLabel('Source title',{exact:true})).toHaveValue('Catalog detail still in progress');await chooseDiscard(page,()=>page.getByRole('button',{name:/^Learn(?:\s|$)/}).click());await page.getByRole('button',{name:'Save source details',exact:true}).click();await expect(page.getByRole('status')).toContainText(/Updated|Saved/);
 const prompts:string[]=[];page.on('dialog',async dialog=>{prompts.push(dialog.message());await dialog.accept();});await page.getByRole('button',{name:'Remove collection A new shelf',exact:true}).click();await expect(page.getByLabel('A new shelf',{exact:true})).toHaveCount(0);await page.getByRole('button',{name:/^Learn(?:\s|$)/}).click();await expect(page.getByRole('heading',{name:'Follow your curiosity.'})).toBeVisible();expect(prompts).toHaveLength(1);expect(prompts[0]).toContain('Remove this collection');
});

test('new collection text typed during a save remains a draft instead of being reset',async({page})=>{
 await page.addInitScript(()=>{const original=crypto.subtle.encrypt.bind(crypto.subtle);Object.defineProperty(crypto.subtle,'encrypt',{configurable:true,value:async(...args:Parameters<SubtleCrypto['encrypt']>)=>{if((window as any).__holdCollection)await new Promise<void>(resolve=>{(window as any).__releaseCollection=resolve;(window as any).__collectionBlocked=true;});return original(...args);}});});
 await createRoom(page);await page.getByRole('button',{name:'Catalog',exact:true}).click();await page.getByLabel('New collection').fill('First submitted collection');await page.evaluate(()=>{(window as any).__holdCollection=true;});await page.getByRole('button',{name:'Create collection',exact:true}).click();await page.waitForFunction(()=>(window as any).__collectionBlocked===true);await page.getByLabel('New collection').fill('Next collection in progress');await page.evaluate(()=>{(window as any).__holdCollection=false;(window as any).__releaseCollection();});await expect(page.getByRole('status')).toContainText('Saved');await expect(page.getByLabel('New collection')).toHaveValue('Next collection in progress');await chooseDiscard(page,()=>page.getByRole('button',{name:/^Learn(?:\s|$)/}).click());await expect(page.getByLabel('New collection')).toHaveValue('Next collection in progress');
});

test('new-source edits typed during a save stay in the dialog until explicitly discarded',async({page})=>{
 await page.addInitScript(()=>{const original=crypto.subtle.encrypt.bind(crypto.subtle);Object.defineProperty(crypto.subtle,'encrypt',{configurable:true,value:async(...args:Parameters<SubtleCrypto['encrypt']>)=>{if((window as any).__holdSource)await new Promise<void>(resolve=>{(window as any).__releaseSource=resolve;(window as any).__sourceBlocked=true;});return original(...args);}});});
 await createRoom(page);await page.getByRole('button',{name:'Add a source',exact:true}).click();await page.getByLabel('My own note').check();await page.getByLabel('Title',{exact:true}).fill('The submitted source');await page.evaluate(()=>{(window as any).__holdSource=true;});await page.getByRole('button',{name:'Add to learning room'}).click();await page.waitForFunction(()=>(window as any).__sourceBlocked===true);await page.getByLabel('Title',{exact:true}).fill('A newer source idea');await page.evaluate(()=>{(window as any).__holdSource=false;(window as any).__releaseSource();});const dialog=page.getByRole('dialog',{name:'Make room for a new source'});await expect(dialog.getByRole('status')).toContainText('Source saved');await expect(dialog.getByLabel('Title',{exact:true})).toHaveValue('A newer source idea');await chooseDiscard(page,()=>dialog.getByRole('button',{name:'Close dialog'}).click());await expect(dialog.getByLabel('Title',{exact:true})).toHaveValue('A newer source idea');await chooseDiscard(page,()=>dialog.getByRole('button',{name:'Close dialog'}).click(),true);await expect(page.getByRole('heading',{name:'The submitted source',exact:true})).toBeVisible();
});
