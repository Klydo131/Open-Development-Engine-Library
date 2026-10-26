import {useCallback,useEffect,useRef,useState,type FormEvent} from 'react';
import {ArrowLeft,ArrowRight,BookOpen,Check,MessageCircle,Plus,ShieldCheck} from 'lucide-react';
import {MEDIA_LIMITS,portalSourceUrl,validateCourse,type Course,type CoursePortal,type Material,type PortalAccount,type PortalMedia,type SupportThread} from '../../../packages/portal/src/index.ts';
import {useDraftGuard} from './useDraftGuard.ts';
import type {DemoCoursePortal} from './portal-demo.ts';
import './portal.css';
import {GroupPanel} from './GroupPanel.tsx';
import {PortalTutorial} from './PortalTutorial.tsx';
import {CourseDiscovery} from './CourseDiscovery.tsx';

type Props={portal:CoursePortal;back:()=>void;openLink:(url:string)=>void;invitationToken?:string;onInvitationConsumed?:()=>void};
type View='catalogue'|'course'|'auth'|'editor'|'support'|'groups';
type AuthMode='signin'|'signup'|'reset';
type Editor={course:Course;expected:string|null};
const blankMaterial=():Material=>({id:crypto.randomUUID(),title:'',text:'',sourceUrl:'',credit:'',rights:'',mediaType:'text'});
const blankCourse=():Course=>({id:crypto.randomUUID(),revision:crypto.randomUUID(),title:'',summary:'',language:'en',status:'draft',lessons:[blankMaterial()]});
const errorText=(error:unknown)=>error instanceof Error?error.message:'This action could not be completed. Please try again.';

/** Original course and support interface. Provider/server policy remains the authority. */
export function PortalPanel({portal,back,openLink,invitationToken,onInvitationConsumed}:Props){
  const drafts=useDraftGuard();
  const [account,setAccount]=useState<PortalAccount>({user:null,recovery:false});
  const [courses,setCourses]=useState<readonly Course[]>([]);
  const [threads,setThreads]=useState<readonly SupportThread[]>([]);
  const [supportUnavailable,setSupportUnavailable]=useState(false);
  const [view,setView]=useState<View>(invitationToken?'groups':'catalogue');
  const [selected,setSelected]=useState<string|null>(null);
  const [lessonId,setLessonId]=useState<string|null>(null);
  const [authMode,setAuthMode]=useState<AuthMode>('signin');
  const [editor,setEditor]=useState<Editor|null>(null);
  const [busy,setBusy]=useState(false);
  const [loading,setLoading]=useState(true);
  const [notice,setNotice]=useState('');
  const [error,setError]=useState('');
  const [reading,setReading]=useState<'standard'|'large'>('standard');
  const [editorChanged,setEditorChanged]=useState(false);
  const editorDirty=useRef(false),selectedRef=useRef(selected);
  selectedRef.current=selected;
  const trackEditor=useCallback((dirty:boolean)=>{editorDirty.current=dirty;setEditorChanged(dirty);},[]);
  const epoch=useRef(0),loadId=useRef(0),accountEvent=useRef(0),working=useRef(false),mounted=useRef(false);
  const accountRef=useRef(account);
  const chosen=courses.find(course=>course.id===selected);
  const admin=account.user?.role==='admin';
  const demo=portal.kind==='demo';

  const verifyAccount=useCallback(async(expected?:PortalAccount)=>{
    const token=epoch.current;
    try{
      const verified=await portal.account();
      if(expected&&(verified.user?.id!==expected.user?.id||verified.user?.role!==expected.user?.role||verified.recovery!==expected.recovery))throw new Error('Your account changed. Please sign in again.');
      return verified;
    }catch(reason){
      if(mounted.current&&token===epoch.current){epoch.current++;accountRef.current={user:null,recovery:false};setAccount(accountRef.current);setCourses([]);setThreads([]);setSupportUnavailable(false);setEditor(null);trackEditor(false);drafts.clear();setError(errorText(reason));setLoading(false);}
      throw reason;
    }
  },[portal,drafts.clear,trackEditor]);

  const reload=useCallback(async(knownAccount?:PortalAccount)=>{
    const request=++loadId.current,token=epoch.current;
    const next=knownAccount??await verifyAccount(accountRef.current.user?accountRef.current:undefined);
    const [nextCourses,nextThreads]=await Promise.all([portal.listCourses(),next.user?portal.getSupport().catch(async()=>{if(!mounted.current||request!==loadId.current||token!==epoch.current)return null;await verifyAccount(next);return null;}):Promise.resolve([])]);
    if(!mounted.current||request!==loadId.current||token!==epoch.current)return;
    accountRef.current=next;setAccount(next);setCourses(nextCourses);if(nextThreads!==null)setThreads(nextThreads);setSupportUnavailable(nextThreads===null);setLoading(false);
    setView(current=>current==='auth'&&next.user&&!next.recovery?(invitationToken&&portal.groups?'groups':selectedRef.current?'course':'catalogue'):current);
  },[portal,invitationToken,verifyAccount]);
  useEffect(()=>{
    mounted.current=true;
    const update=()=>{
      const event=++accountEvent.current;
      void portal.account().then(next=>{
        if(!mounted.current||event!==accountEvent.current)return;
        const previous=accountRef.current;
        if(previous.user?.id===next.user?.id&&previous.user?.role===next.user?.role&&previous.recovery===next.recovery){accountRef.current=next;setAccount(next);return;}
        epoch.current++;accountRef.current=next;setEditor(null);trackEditor(false);setCourses([]);setThreads([]);setSupportUnavailable(false);setLoading(true);setAccount(next);drafts.clear();
        return reload(next);
      }).catch(reason=>{if(mounted.current&&event===accountEvent.current){epoch.current++;accountRef.current={user:null,recovery:false};setAccount(accountRef.current);setCourses([]);setThreads([]);setEditor(null);trackEditor(false);drafts.clear();setError(errorText(reason));setLoading(false);}});
    };
    const unsubscribe=portal.onAccountChange(update);
    void reload().catch(reason=>{if(mounted.current){setError(errorText(reason));setLoading(false);}});
    return()=>{mounted.current=false;epoch.current++;loadId.current++;accountEvent.current++;unsubscribe();};
  },[portal,reload,drafts.clear,trackEditor]);
  useEffect(()=>{if(!editorChanged)return;const warn=(event:BeforeUnloadEvent)=>{event.preventDefault();event.returnValue=true;};window.addEventListener('beforeunload',warn);return()=>window.removeEventListener('beforeunload',warn);},[editorChanged]);
  const leave=()=>!working.current&&(drafts.dirty?drafts.confirmDiscard():!editorDirty.current||window.confirm('You have unsaved edits. Leave this screen and discard them?'));
  const go=(next:View)=>{if(!leave())return;setError('');setNotice('');setEditor(null);trackEditor(false);setView(next);};
  const run=async(action:()=>Promise<void>,success?:()=>void)=>{
    if(working.current)return;
    working.current=true;setBusy(true);setError('');setNotice('');
    const token=epoch.current;
    try{await action();if(mounted.current&&epoch.current===token){success?.();await reload();}}
    catch(reason){if(mounted.current&&epoch.current===token)setError(errorText(reason));}
    finally{working.current=false;if(mounted.current)setBusy(false);}
  };
  const openCourse=(id:string)=>{if(!leave())return;setSelected(id);setLessonId(null);setView('course');setError('');setNotice('');};
  const beginEdit=(course?:Course)=>{if(!leave())return;trackEditor(false);setEditor({course:structuredClone(course??blankCourse()),expected:course?.revision??null});setView('editor');setError('');setNotice('');};
  const previewRole=(role:'learner'|'admin',nextView?:View)=>{if(!leave()||!('setDemoRole' in portal))return;setView(current=>nextView??(current==='course'?'course':'catalogue'));setNotice('');setError('');(portal as DemoCoursePortal).setDemoRole(role);};
  const saveCourse=(course:Course,expected:string|null,form:HTMLFormElement)=>{
    const snapshot=drafts.capture(form);
    const token=epoch.current;
    return run(async()=>{const saved=await portal.saveCourse(validateCourse(course),expected);if(mounted.current&&epoch.current===token){setEditor({course:saved,expected:saved.revision});trackEditor(false);drafts.markSaved(form,snapshot);}},()=>setNotice(course.status==='published'?'Your reviewed course is published.':'Your course draft is saved.'));
  };
  const authenticate=(event:FormEvent<HTMLFormElement>)=>{
    event.preventDefault();const form=event.currentTarget,data=new FormData(form);
    const email=String(data.get('email')??''),password=String(data.get('password')??'');
    const snapshot=drafts.capture(form);
    void run(async()=>{
      if(account.recovery){if(password!==String(data.get('confirm')??''))throw new Error('The account passwords do not match.');await portal.updatePassword(password);}
      else if(authMode==='signup')await portal.signUp(email,password);
      else if(authMode==='reset')await portal.requestPasswordReset(email);
      else await portal.signIn(email,password);
      if(mounted.current){drafts.markSaved(form,snapshot);form.reset();drafts.reset(form);}
    },()=>setNotice(account.recovery?'Your account password was updated. Sign in again to continue.':authMode==='reset'?'If the account is eligible, check its email for recovery instructions.':authMode==='signup'?'Check your email for the next step. Email verification may be required before sign-in.':'You are signed in.'));
  };
  const uploadFile=(file:File,finish:(media:PortalMedia)=>void)=>run(async()=>{
    if(!portal.media)throw new Error('File uploads are not configured for this library.');
    if(file.size>MEDIA_LIMITS.fileBytes)throw new Error('Choose a file of 10 MiB or less.');
    const token=epoch.current,bytes=new Uint8Array(await file.arrayBuffer());
    if(!mounted.current||epoch.current!==token)return;
    const attachment=await portal.media.upload({name:file.name,bytes});
    if(mounted.current&&epoch.current===token)finish(attachment);
  });
  const downloadFile=(attachment:PortalMedia)=>void run(async()=>{
    if(!portal.media)throw new Error('File downloads are not configured for this library.');
    const token=epoch.current,result=await portal.media.download(attachment.id);
    if(!mounted.current||epoch.current!==token)return;
    const blob=new Blob([new Uint8Array(result.bytes)],{type:'application/octet-stream'}),url=URL.createObjectURL(blob);
    const link=document.createElement('a');link.href=url;link.download=result.media.name;link.click();setTimeout(()=>URL.revokeObjectURL(url),60000);
  });
  const selectedLesson=chosen?.lessons.find(lesson=>lesson.id===lessonId)??chosen?.lessons[0];
  const discovering=!loading&&!account.recovery&&view!=='auth'&&!(view==='editor'&&admin&&editor)&&!(view==='groups'&&account.user&&portal.groups)&&!(view==='support'&&account.user)&&!(view==='course'&&chosen);

  return <main className={`course-portal portal-reading-${reading}`}>
    <header className="portal-top"><button className="plain portal-wordmark" onClick={()=>go('catalogue')} disabled={busy} aria-label="Library home"><span className="portal-logo"><BookOpen size={24}/></span><span>Learning library<small>LEARN. CONNECT. GROW.</small></span></button><button className="text-button" onClick={()=>{if(leave())back();}} disabled={busy}><ArrowLeft size={17}/>Private rooms</button><span className="portal-provider">{demo?'Local demonstration':'Institution account'}</span></header>
    <div className="portal-body">

      {demo&&<section className="portal-demo" aria-label="Demo account controls"><p><strong>Try a local preview.</strong> Accounts, materials, groups and support are simulated in memory. Refreshing clears demo changes. No email is sent or password stored.</p><div className="portal-actions"><button className="button secondary" onClick={()=>previewRole('learner')} disabled={busy}>Preview learner</button><button className="button secondary" onClick={()=>previewRole('admin')} disabled={busy}>Preview admin</button></div></section>}
      <nav className="portal-nav" aria-label="Learning library"><button className={view==='catalogue'?'active':''} aria-current={view==='catalogue'?'page':undefined} onClick={()=>go('catalogue')} disabled={busy}>Courses</button>{account.user&&<button className={view==='support'?'active':''} aria-current={view==='support'?'page':undefined} onClick={()=>go('support')} disabled={busy}>Support</button>}{account.user&&portal.groups&&<button className={view==='groups'?'active':''} aria-current={view==='groups'?'page':undefined} onClick={()=>go('groups')} disabled={busy}>Study groups</button>}{admin&&<button onClick={()=>beginEdit()} disabled={busy}><Plus size={16}/>New course</button>}<div className="portal-account">{account.user?<><span>{demo?`${admin?'Admin':'Learner'} preview`:account.user.email}</span><button onClick={()=>{if(leave())void run(()=>portal.signOut(),()=>setView('catalogue'));}} disabled={busy}>Sign out</button></>:!demo&&<button onClick={()=>go('auth')} disabled={busy}>Sign in</button>}</div></nav>
      <div className="portal-tools"><PortalTutorial key={`${account.user?.id??'guest'}-${account.user?.role??'guest'}-${account.recovery}`} role={account.user?.role??'guest'} demo={demo}/><div className="portal-accessibility"><span><ShieldCheck size={15}/>No timer. Room to pause.</span><label htmlFor="portal-reading-size">Reading size</label><select id="portal-reading-size" value={reading} onChange={event=>setReading(event.currentTarget.value as typeof reading)}><option value="standard">Standard text</option><option value="large">Larger text</option></select></div></div>{!discovering&&<h1 className="portal-visually-hidden">Learning library</h1>}
      {error&&<p role="alert" className="notice error">{error}</p>}{notice&&<p role="status" className="notice">{notice}</p>}
      {loading?<p role="status">Loading the learning library…</p>:account.recovery||view==='auth'?<section className="portal-auth portal-card"><h2>{account.recovery?'Choose a new account password':authMode==='signup'?'Create an email account':authMode==='reset'?'Recover your account':'Welcome back'}</h2><p>Institution accounts provide courses and support. Your private room passphrase is separate: an email reset cannot unlock its encrypted library.</p>{demo?<p>Email accounts are not configured for this demonstration. Use a preview above.</p>:<><form ref={drafts.register} key={`${authMode}-${account.recovery}`} onSubmit={authenticate}><fieldset disabled={busy}>{!account.recovery&&<label>Email address<input type="email" name="email" autoComplete="email" maxLength={254} required/></label>}{(account.recovery||authMode!=='reset')&&<><label>{account.recovery?'New account password':'Account password'}<input type="password" name="password" minLength={account.recovery||authMode==='signup'?15:1} maxLength={128} autoComplete={account.recovery||authMode==='signup'?'new-password':'current-password'} required/></label>{(account.recovery||authMode==='signup')&&<p className="portal-hint">Use 15–128 characters. A password manager and pasted passphrases are welcome.</p>}{account.recovery&&<label>Confirm account password<input type="password" name="confirm" minLength={15} maxLength={128} autoComplete="new-password" required/></label>}</>}<button className="button" type="submit">{busy?'Working…':account.recovery?'Update account password':authMode==='signup'?'Create account':authMode==='reset'?'Request recovery email':'Sign in'}</button></fieldset></form>{!account.recovery&&<div className="portal-actions">{(['signin','signup','reset'] as const).filter(mode=>mode!==authMode).map(mode=><button key={mode} className="text-button" disabled={busy} onClick={()=>{if(leave()){setAuthMode(mode);setError('');setNotice('');}}}>{mode==='signin'?'Sign in':mode==='signup'?'Create an account':'Forgot your password?'}</button>)}</div>}</>}</section>
      :view==='editor'&&admin&&editor?<CourseEditor key={`${editor.course.id}-${editor.course.revision}`} editor={editor} busy={busy} register={drafts.register} save={saveCourse} uploads={Boolean(portal.media)} uploadFile={uploadFile} changed={()=>trackEditor(true)} cancel={()=>go('catalogue')}/>
      :view==='groups'&&account.user&&portal.groups?<GroupPanel key={`${account.user.id}-${account.user.role}`} workspace={portal.groups} user={account.user} verifyAccount={verifyAccount} demo={demo} busy={busy} drafts={drafts} run={run} previewInvitation={demo&&'previewInvitation' in portal?id=>(portal as DemoCoursePortal).previewInvitation(id):undefined} invitationToken={invitationToken} onInvitationConsumed={onInvitationConsumed}/>
      :view==='support'&&account.user?<section aria-labelledby="support-heading"><div className="portal-section-head"><div><h2 id="support-heading">{admin?'Support inbox':'Your support'}</h2><p>Share only the message you choose. Private notes, room files and learning history are not attached.</p></div><button className="button secondary" disabled={busy} onClick={()=>void run(async()=>{})}>Refresh support requests</button></div>{!admin&&<form className="portal-card" ref={drafts.register} onSubmit={event=>{event.preventDefault();const form=event.currentTarget,data=new FormData(form);const courseId=String(data.get('courseId')??'');void run(()=>portal.askSupport({subject:String(data.get('subject')??''),message:String(data.get('message')??''),...(courseId?{courseId}:{})}),()=>{form.reset();drafts.reset(form);setNotice('Your selected message was submitted for support.');});}}><fieldset disabled={busy}><h3>Ask for support</h3><div><label htmlFor="portal-support-course">Related course</label><select id="portal-support-course" name="courseId" defaultValue={selected??''}><option value="">General question</option>{courses.filter(course=>course.status==='published').map(course=><option value={course.id} key={course.id}>{course.title}</option>)}</select></div><label>Subject<input name="subject" maxLength={160} required/></label><label>Your message<textarea name="message" rows={5} maxLength={5000} required/></label><p className="portal-hint">Your message will be visible to authorized support staff for this institution. Do not include passwords or private room keys.</p><button className="button" type="submit" disabled={supportUnavailable}>Submit support request</button></fieldset></form>}{supportUnavailable?<div className="notice error" role="alert"><p>Support requests are temporarily unavailable. Your courses remain available.</p><button className="button secondary" disabled={busy} onClick={()=>void run(async()=>{})}>Retry support requests</button></div>:null}{threads.length===0?!supportUnavailable&&<p className="portal-empty">No support requests yet.</p>:<div className="portal-support-list">{threads.map(thread=><SupportCard key={`${thread.id}-${thread.revision}`} thread={thread} courseTitle={courses.find(course=>course.id===thread.courseId)?.title} admin={admin} busy={busy||supportUnavailable} register={drafts.register} reply={(text,form)=>{const snapshot=drafts.capture(form);void run(()=>portal.replySupport(thread.id,text,thread.revision),()=>{drafts.markSaved(form,snapshot);setNotice('Your support reply is saved.');});}}/>)}</div>}</section>
      :view==='course'&&chosen?<section aria-labelledby="course-heading"><button className="text-button" onClick={()=>go('catalogue')} disabled={busy}><ArrowLeft size={16}/>All courses</button><div className="portal-section-head"><div><span className="portal-tag">{chosen.status==='draft'?'Draft · admin only':!account.user?'Course preview':`${chosen.lessons.length} ${chosen.lessons.length===1?'lesson':'lessons'}`} · {chosen.language}</span><h2 id="course-heading">{chosen.title}</h2><p>{chosen.summary}</p></div>{admin&&<button className="button secondary" onClick={()=>beginEdit(chosen)} disabled={busy}>Edit course</button>}</div><div className="portal-course-layout"><nav aria-label="Course lessons" className="portal-outline"><h3>{account.user?'Take one step':'A place to begin'}</h3>{!account.user&&<p>Sign in for lesson materials and support.</p>}<ol>{chosen.lessons.map((lesson,index)=><li key={lesson.id}><button aria-current={selectedLesson?.id===lesson.id?'step':undefined} onClick={()=>{if(leave())setLessonId(lesson.id);}} disabled={busy}><span>{index+1}</span>{lesson.title}</button></li>)}</ol></nav><article className="portal-card portal-lesson">{!account.user?<><h3>Your place to begin</h3><p>The course purpose is public. Sign in to read lesson materials and ask your institution for support.</p>{demo?<button className="button" onClick={()=>previewRole('learner')}>Preview this as a learner<ArrowRight size={17}/></button>:<button className="button" onClick={()=>{setAuthMode('signin');go('auth');}}>Sign in to start<ArrowRight size={17}/></button>}</>:selectedLesson?<><span className="eyebrow">{selectedLesson.mediaType&&selectedLesson.mediaType!=='text'?`${selectedLesson.mediaType} · `:''}Read · Try · Check · Plan</span><h3>{selectedLesson.title}</h3><p className="portal-material-text">{selectedLesson.text||(selectedLesson.attachment?'Download the attached material below for this lesson.':selectedLesson.sourceUrl?'Use the credited source below for this lesson.':'This lesson is still being prepared.')}</p><div className="portal-credit"><p><strong>Creator or source:</strong> {selectedLesson.credit||'Not supplied'}</p><p><strong>Content rights:</strong> {selectedLesson.rights||'Not supplied; ask before reusing this material.'}</p>{selectedLesson.attachment&&<p><button className="button secondary" disabled={busy||!portal.media} onClick={()=>downloadFile(selectedLesson.attachment!)}>Download {selectedLesson.attachment.name}</button><span className="portal-hint"> · {Math.ceil(selectedLesson.attachment.size/1024)} KiB · opens as a downloaded file</span></p>}{selectedLesson.sourceUrl&&<button className="text-button" onClick={()=>openLink(selectedLesson.sourceUrl)}>Open credited source<ArrowRight size={16}/></button>}</div><p className="portal-hint">This is reading material, not an assessment of mastery. Keep your own notes in your private room.</p>{!admin&&<button className="button secondary" onClick={()=>go('support')}>Ask for help<MessageCircle size={16}/></button>}</>:<p>No lessons are available yet.</p>}</article></div></section>
      :<CourseDiscovery key={`${account.user?.id??'guest'}-${account.user?.role??'guest'}`} courses={courses} role={account.user?.role??null} demo={demo} busy={busy} groupsAvailable={Boolean(portal.groups)} openCourse={openCourse} startLearning={()=>demo?previewRole('learner'):go('auth')} openGroups={()=>account.user?go(portal.groups?'groups':'support'):demo?previewRole('learner','groups'):go('auth')}/>}
      <footer className="portal-footer"><p>Private room notes stay in their separate encrypted library. Institutional course and support data follow this deployment’s access and retention policy.</p><p>{demo?'Demo role controls are a local preview; real staff roles must be assigned and enforced by the server.':'Staff roles and permitted records are checked by the configured service. Contact the operator for account and privacy help.'}</p></footer>
    </div>
  </main>;
}

type EditorProps={editor:Editor;busy:boolean;register:(form:HTMLFormElement|null)=>void|(()=>void);save:(course:Course,expected:string|null,form:HTMLFormElement)=>Promise<void>;changed:()=>void;cancel:()=>void;uploads:boolean;uploadFile:(file:File,finish:(media:PortalMedia)=>void)=>Promise<void>};
function CourseEditor({editor,busy,register,save,changed,cancel,uploads,uploadFile}:EditorProps){
  const [course,setCourse]=useState(editor.course),[reviewed,setReviewed]=useState(false),[error,setError]=useState('');
  const change=(values:Partial<Course>)=>{setCourse(current=>({...current,...values}));setReviewed(false);changed();};
  const lessonChange=(id:string,values:Partial<Material>)=>change({lessons:course.lessons.map(lesson=>lesson.id===id?{...lesson,...values}:lesson)});
  const publish=(form:HTMLFormElement,status:Course['status'])=>{
    try{setError('');if(status==='published'&&(!reviewed||!course.lessons.length||course.lessons.some(lesson=>(!lesson.text.trim()&&!lesson.sourceUrl&&!lesson.attachment)||!lesson.credit.trim()||!lesson.rights.trim())))throw new Error('Review the course and add lesson text, an attached file or a source link, creator credit and content rights before publishing.');const checked=validateCourse({...course,status,lessons:course.lessons.map(lesson=>({...lesson,sourceUrl:portalSourceUrl(lesson.sourceUrl)}))});void save(checked,editor.expected,form);}
    catch(reason){setError(errorText(reason));}
  };
  return <section className="portal-editor"><h2>{editor.expected?'Edit course':'Create a course'}</h2><p>Write a clear goal and small practice steps. Use your own material, or content you have permission to share. Course content has its own rights, separate from this software’s license.</p>{error&&<p className="notice error" role="alert">{error}</p>}<form ref={register} onSubmit={event=>{event.preventDefault();publish(event.currentTarget,course.status==='published'?'published':'draft');}}><fieldset disabled={busy}><label>Course title<input name="courseTitle" value={course.title} onChange={event=>change({title:event.currentTarget.value})} maxLength={160} required/></label><label>Course purpose<textarea name="summary" value={course.summary} onChange={event=>change({summary:event.currentTarget.value})} maxLength={2000} rows={3} required/></label><label>Course language<input name="language" value={course.language} onChange={event=>change({language:event.currentTarget.value})} maxLength={35} pattern="[A-Za-z]{2,8}(-[A-Za-z0-9]{1,8})*" required/><span className="portal-hint">A language tag such as en, fil or en-GB.</span></label>{course.lessons.map((lesson,index)=><fieldset className="portal-material-editor" key={lesson.id}><legend>Lesson {index+1}</legend><label>Lesson {index+1} title<input name={`title-${lesson.id}`} value={lesson.title} onChange={event=>lessonChange(lesson.id,{title:event.currentTarget.value})} maxLength={160} required/></label><label>Lesson {index+1} material type<select name={`media-${lesson.id}`} value={lesson.mediaType??'text'} onChange={event=>lessonChange(lesson.id,{mediaType:event.currentTarget.value as Material['mediaType']})}><option value="text">Written lesson</option><option value="document">Document or PDF</option><option value="audio">Audio</option><option value="video">Video</option><option value="image">Image</option><option value="link">Website or reference</option></select></label><label>Lesson {index+1} text<textarea name={`text-${lesson.id}`} value={lesson.text} onChange={event=>lessonChange(lesson.id,{text:event.currentTarget.value})} rows={9} maxLength={20000}/><span className="portal-hint">Try Read → Try → Check → Plan. Offer an example and a way to pause or ask for help. Add plain text, a transcript or an accessible description. Linked media opens only when a learner chooses it.</span></label><label>Lesson {index+1} source link (optional)<input name={`source-${lesson.id}`} type="url" value={lesson.sourceUrl} onChange={event=>lessonChange(lesson.id,{sourceUrl:event.currentTarget.value})} maxLength={2048} required={!lesson.attachment&&lesson.mediaType!==undefined&&lesson.mediaType!=='text'}/><span className="portal-hint">For linked documents, audio and video, provide a source URL and permission details. A source link is optional when you attach a file below.</span></label>{uploads?<div className="portal-attachment-editor"><label>Lesson {index+1} upload file<input type="file" name={`file-${lesson.id}`} accept=".pdf,.mp3,.wav,.m4a,.mp4,.webm,.png,.jpg,.jpeg" onChange={event=>{const input=event.currentTarget,file=input.files?.[0];if(!file)return;void uploadFile(file,attachment=>{lessonChange(lesson.id,{attachment,mediaType:attachment.mediaType});input.value='';});}}/></label><p className="portal-hint">PDF, MP3, WAV, M4A, MP4, WebM, PNG or JPEG; up to 10 MiB. An uploaded file stays unpublished until you save this course. Downloaded files should be checked before opening.</p>{lesson.attachment&&<div className="portal-actions"><span>{lesson.attachment.name} · {Math.ceil(lesson.attachment.size/1024)} KiB</span><button type="button" className="text-button danger" onClick={()=>{change({lessons:course.lessons.map(item=>{if(item.id!==lesson.id)return item;const next={...item};delete next.attachment;return next;})});}}>Remove file from lesson {index+1}</button></div>}</div>:<p className="portal-hint">File uploads are not configured; add a source link.</p>}<label>Lesson {index+1} creator or source credit<input name={`credit-${lesson.id}`} value={lesson.credit} onChange={event=>lessonChange(lesson.id,{credit:event.currentTarget.value})} maxLength={500}/></label><label>Lesson {index+1} content rights<input name={`rights-${lesson.id}`} value={lesson.rights} onChange={event=>lessonChange(lesson.id,{rights:event.currentTarget.value})} maxLength={500}/><span className="portal-hint">For example, your own material under CC BY 4.0, with the required attribution. Do not assume free access means permission to copy.</span></label><button type="button" className="text-button danger" onClick={()=>{if(window.confirm('Remove this lesson from the current draft?'))change({lessons:course.lessons.filter(item=>item.id!==lesson.id)});}}>Remove lesson {index+1}</button></fieldset>)}<button className="button secondary" type="button" onClick={()=>change({lessons:[...course.lessons,blankMaterial()]})} disabled={course.lessons.length>=50}><Plus size={16}/>Add lesson</button><label className="portal-check"><input type="checkbox" name="reviewed" checked={reviewed} onChange={event=>setReviewed(event.currentTarget.checked)}/><span>I reviewed the text, source credits and permission to publish each lesson.</span></label><div className="portal-actions">{course.status==='draft'&&<button className="button secondary" type="submit">Save draft</button>}<button className="button" type="button" onClick={event=>{const form=event.currentTarget.form;if(form?.reportValidity())publish(form,'published');}}>{course.status==='published'?'Publish reviewed changes':'Publish course'}<Check size={17}/></button><button type="button" className="text-button" onClick={cancel}>Close editor</button></div>{busy&&<p role="status">Saving this course…</p>}</fieldset></form></section>;
}

function SupportCard({thread,courseTitle,admin,busy,register,reply}:{thread:SupportThread;courseTitle?:string;admin:boolean;busy:boolean;register:EditorProps['register'];reply:(text:string,form:HTMLFormElement)=>void}){
  return <article className="portal-card portal-support-thread"><span className="portal-tag">{thread.status==='answered'?'Reply available':'Awaiting support'}{courseTitle?` · ${courseTitle}`:''}</span><h3>{thread.subject}</h3><p className="portal-material-text">{thread.message}</p>{thread.reply&&<section className="portal-support-reply"><h4>Support reply</h4><p className="portal-material-text">{thread.reply}</p></section>}{admin&&<form ref={register} onSubmit={event=>{event.preventDefault();reply(String(new FormData(event.currentTarget).get('reply')??''),event.currentTarget);}}><fieldset disabled={busy}><label>Reply to {thread.subject}<textarea name="reply" rows={4} maxLength={5000} defaultValue={thread.reply} required/></label><button className="button secondary" type="submit">Save support reply</button></fieldset></form>}</article>;
}
