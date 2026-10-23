import {useCallback,useEffect,useRef,useState,type FormEvent} from 'react';
import {ArrowLeft,CalendarDays,LockKeyhole,MessageCircle,Users} from 'lucide-react';
import type {GroupInvitation,GroupMember,GroupPost,GroupWorkspace,PortalUser,StudyGroup,StudySession,TeacherRequest} from '../../../packages/portal/src/index.ts';
import type {DraftGuard} from './useDraftGuard.ts';
import './groups.css';

type Props={workspace:GroupWorkspace;user:PortalUser;demo:boolean;busy:boolean;drafts:DraftGuard;run:(action:()=>Promise<void>,success?:()=>void)=>Promise<void>;previewInvitation?:(id:string)=>Readonly<{email:string;token:string}>;invitationToken?:string;onInvitationConsumed?:()=>void};
type Detail={groupId:string;posts:readonly GroupPost[];sessions:readonly StudySession[];invitations:readonly GroupInvitation[];members:readonly GroupMember[]};
type GroupTab='discussion'|'sessions'|'members';
type FormProps={busy:boolean;drafts:DraftGuard};
const message=(reason:unknown)=>reason instanceof Error?reason.message:'This action could not be completed. Please refresh and try again.';
const value=(form:HTMLFormElement,name:string)=>String(new FormData(form).get(name)??'');
const formatDate=(instant:string)=>new Intl.DateTimeFormat(undefined,{dateStyle:'medium',timeStyle:'short'}).format(new Date(instant));

export function GroupPanel({workspace,user,demo,busy,drafts,run,previewInvitation,invitationToken,onInvitationConsumed}:Props){
 const [groups,setGroups]=useState<readonly StudyGroup[]>([]),[requests,setRequests]=useState<readonly TeacherRequest[]>([]);
 const [screen,setScreen]=useState(invitationToken?'join':'overview'),[tab,setTab]=useState<GroupTab>('discussion');
 const [detail,setDetail]=useState<Detail|null>(null),[loading,setLoading]=useState(true),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const [preview,setPreview]=useState<Readonly<{email:string;token:string}>|null>(null);
 const alive=useRef(false),load=useRef(0),selected=useRef(screen);
 selected.current=screen;
 const admin=user.role==='admin',group=groups.find(item=>item.id===screen);
 const refresh=useCallback(async(groupId?:string)=>{
  const request=++load.current;
  try{
   const [nextGroups,nextRequests]=await Promise.all([workspace.listGroups(),workspace.listTeacherRequests()]);
   const nextGroup=nextGroups.find(item=>item.id===groupId);
   const nextDetail=nextGroup?await Promise.all([workspace.listPosts(nextGroup.id),workspace.listSessions(nextGroup.id),admin&&nextGroup.kind==='group'?workspace.listInvitations(nextGroup.id):Promise.resolve([]),admin&&nextGroup.kind==='group'?workspace.listMembers(nextGroup.id):Promise.resolve([])]):null;
   if(!alive.current||request!==load.current)return;
   setGroups(nextGroups);setRequests(nextRequests);
   setDetail(nextGroup&&nextDetail?{groupId:nextGroup.id,posts:nextDetail[0],sessions:nextDetail[1],invitations:nextDetail[2],members:nextDetail[3]}:null);
   if(groupId&&!nextGroup)setScreen('overview');
   setLoading(false);
  }catch(reason){if(alive.current&&request===load.current){setGroups([]);setRequests([]);setDetail(null);setLoading(false);setError(message(reason));}throw reason;}
 },[workspace,admin]);
 useEffect(()=>{alive.current=true;void refresh().catch(()=>{});return()=>{alive.current=false;load.current++;};},[refresh]);
 const navigate=(next:string,nextTab:GroupTab='discussion')=>{
  if(busy||!drafts.confirmDiscard())return;
  setScreen(next);selected.current=next;setTab(nextTab);setPreview(null);setError('');setNotice('');setDetail(null);
  const id=groups.some(item=>item.id===next)?next:undefined;setLoading(Boolean(id));void refresh(id).catch(()=>{});
 };
 const perform=(action:()=>Promise<void>,success:string,form?:HTMLFormElement)=>{
  const snapshot=form?drafts.capture(form):null,screenAtStart=selected.current;
  void run(async()=>{
   await action();if(!alive.current)return;
   if(form&&snapshot&&drafts.matches(form,snapshot)){form.reset();drafts.reset(form);}
   if(selected.current===screenAtStart)await refresh(groups.some(item=>item.id===screenAtStart)?screenAtStart:undefined);
  },()=>{if(alive.current)setNotice(success);});
 };
 const createGroup=(event:FormEvent<HTMLFormElement>)=>{
  event.preventDefault();const form=event.currentTarget;
  perform(async()=>{await workspace.saveGroup({id:crypto.randomUUID(),revision:crypto.randomUUID(),title:value(form,'title'),description:value(form,'description'),kind:'group',facilitatorId:user.id},null);},'Your study group is ready.',form);
 };
 const accept=(event:FormEvent<HTMLFormElement>)=>{
  event.preventDefault();const form=event.currentTarget;
  perform(async()=>{const joined=await workspace.acceptInvitation(value(form,'token'));if(alive.current){onInvitationConsumed?.();setScreen(joined.id);selected.current=joined.id;await refresh(joined.id);}},'You joined the study group.',form);
 };
 return <section className="group-workspace" aria-labelledby="groups-heading">
  <div className="portal-section-head"><div><h2 id="groups-heading">Study together</h2><p>Discuss a question, make time to learn and ask a teacher for support.</p></div><Users size={28}/></div>
  <nav className="group-navigation" aria-label="Study spaces"><button aria-current={screen==='overview'?'page':undefined} onClick={()=>navigate('overview')} disabled={busy}>Your groups</button><button aria-current={screen==='teachers'?'page':undefined} onClick={()=>navigate('teachers')} disabled={busy}>Teacher support</button>{!admin&&<button aria-current={screen==='join'?'page':undefined} onClick={()=>navigate('join')} disabled={busy}>Join invitation</button>}</nav>
  {error&&<p role="alert" className="notice error">{error}</p>}{notice&&<p role="status" className="notice">{notice}</p>}
  {loading?<p role="status">Loading study spaces…</p>:screen==='overview'?<>
   {groups.length===0?<p className="portal-empty">No study spaces yet. {admin?'Create a group below or open a requested teacher room.':'Use an invitation from your library or request a teacher.'}</p>:<ul className="group-list">{groups.map(item=><li key={item.id}><div>{item.kind==='private'?<LockKeyhole size={20}/>:<Users size={20}/>}<span className="portal-tag">{item.kind==='private'?'Private teacher room':'Study group'}</span></div><h3>{item.title}</h3><p>{item.description}</p><button className="text-button" onClick={()=>navigate(item.id)} disabled={busy}>Open {item.title}</button></li>)}</ul>}
   {admin&&<details className="group-create"><summary>Create a study group</summary><form ref={drafts.register} onSubmit={createGroup}><fieldset disabled={busy}><label>Group title<input name="title" maxLength={160} required/></label><label>Group purpose<textarea name="description" rows={3} maxLength={2000} required/></label><button type="submit" className="button">Create group</button></fieldset></form></details>}
  </>:screen==='teachers'?<TeacherSupport requests={requests} admin={admin} busy={busy} drafts={drafts} request={(subject,text,form)=>perform(()=>workspace.requestTeacher({subject,message:text}),'Your teacher request is ready for review.',form)} create={(request,title,description,form)=>perform(async()=>{await workspace.createPrivateRoom(request.id,title,description);},'The private teacher room is ready.',form)} open={id=>navigate(id)}/>
  :screen==='join'?<section className="portal-card group-join"><h3>Join your study group</h3><p>Use the invitation code from your email. Sign in with the email address that was invited.</p>{demo&&<p className="portal-hint">This is a local simulation. Use a code from a simulated invitation; no email is sent.</p>}<form ref={drafts.register} onSubmit={accept}><fieldset disabled={busy}><label>Invitation code<input name="token" defaultValue={invitationToken??''} maxLength={256} autoComplete="off" spellCheck={false} required/></label><button className="button" type="submit">Accept invitation</button></fieldset></form></section>
  :group?<>
   <button className="text-button" onClick={()=>navigate('overview')} disabled={busy}><ArrowLeft size={16}/>All study spaces</button>
   <div className="group-heading"><span className="portal-tag">{group.kind==='private'?'Private teacher room · learner and assigned teacher':'Members-only study group'}</span><h3>{group.title}</h3><p>{group.description}</p></div>
   <nav className="group-navigation" aria-label="Study space sections">{(['discussion','sessions',...(admin&&group.kind==='group'?['members'] as const:[])] as const).map(item=><button key={item} aria-current={tab===item?'page':undefined} disabled={busy} onClick={()=>{if(drafts.confirmDiscard()){setTab(item);setPreview(null);}}}>{item==='discussion'?'Discussion':item==='sessions'?'Sessions':'Members & invitations'}</button>)}<button disabled={busy} onClick={()=>{if(drafts.confirmDiscard()){setDetail(null);setLoading(true);void refresh(group.id).catch(()=>{});}}}>Refresh</button></nav>
   {detail?.groupId!==group.id?<p role="status">Loading this study space…</p>:tab==='discussion'?<Discussion posts={detail.posts} user={user} busy={busy} drafts={drafts} post={(text,form)=>perform(()=>workspace.addPost(group.id,text),'Your message is shared with this room.',form)} remove={post=>{if(window.confirm('Remove this message from the discussion?'))perform(()=>workspace.removePost(group.id,post.id),'The message was removed.');}}/>
   :tab==='sessions'?<Sessions sessions={detail.sessions} group={group} admin={admin} busy={busy} drafts={drafts} save={(session,form)=>perform(async()=>{await workspace.saveSession(session,null);},'Your study session is scheduled.',form)}/>
   :<Members invitations={detail.invitations} members={detail.members} busy={busy} drafts={drafts} invite={(email,form)=>perform(async()=>{await workspace.inviteLearner(group.id,email);},demo?'The simulated invitation is ready. No email was sent.':'The invitation was created. Email delivery depends on the configured service.',form)} revoke={invitation=>{setPreview(null);perform(()=>workspace.revokeInvitation(group.id,invitation.id),'The invitation was revoked.');}} remove={member=>{if(window.confirm('Remove this member’s access to this group?'))perform(()=>workspace.removeMember(group.id,member.userId),'The member’s group access was removed.');}} preview={preview} showPreview={previewInvitation?id=>{try{setPreview(previewInvitation(id));}catch(reason){setError(message(reason));setPreview(null);}}:undefined}/>
   }
  </>:<p className="portal-empty">This study space is no longer available. Choose another group.</p>}
 </section>;
}

function Discussion({posts,user,busy,drafts,post,remove}:FormProps&{posts:readonly GroupPost[];user:PortalUser;post:(text:string,form:HTMLFormElement)=>void;remove:(post:GroupPost)=>void}){
 return <section aria-labelledby="discussion-heading"><h4 id="discussion-heading">Discussion</h4><p className="portal-hint">Messages are shared with this room’s members. Keep passwords, sensitive details and private room keys out of discussions.</p>{posts.length===0?<p className="portal-empty">Start with a question or one thing you learned.</p>:<ol className="group-posts">{posts.map(item=><li key={item.id}><article><div className="group-post-meta"><strong>{item.authorId===user.id?'You':item.authorRole==='admin'?'Teacher':'Learner'}</strong><time dateTime={item.createdAt}>{formatDate(item.createdAt)}</time></div><p className="portal-material-text">{item.body}</p>{(item.authorId===user.id||user.role==='admin')&&<button className="text-button danger" disabled={busy} onClick={()=>remove(item)} aria-label={`Remove message ${item.body.slice(0,60)}`}>Remove message</button>}</article></li>)}</ol>}<form className="portal-card" ref={drafts.register} onSubmit={event=>{event.preventDefault();post(value(event.currentTarget,'body'),event.currentTarget);}}><fieldset disabled={busy}><label>Your discussion message<textarea name="body" rows={4} maxLength={2000} required/></label><button className="button" type="submit"><MessageCircle size={16}/>Share message</button></fieldset></form></section>;
}

function Sessions({sessions,group,admin,busy,drafts,save}:FormProps&{sessions:readonly StudySession[];group:StudyGroup;admin:boolean;save:(session:StudySession,form:HTMLFormElement)=>void}){
 const [error,setError]=useState('');
 const schedule=(event:FormEvent<HTMLFormElement>)=>{
  event.preventDefault();const form=event.currentTarget,start=new Date(value(form,'startsAt'));
  if(!Number.isFinite(start.getTime())){setError('Choose a valid local date and time.');return;}setError('');
  save({id:crypto.randomUUID(),revision:crypto.randomUUID(),groupId:group.id,title:value(form,'title'),description:value(form,'description'),startsAt:start.toISOString(),durationMinutes:Number(value(form,'duration'))},form);
 };
 return <section aria-labelledby="sessions-heading"><h4 id="sessions-heading">Scheduled sessions</h4><p className="portal-hint">Times appear in your device’s time zone: {Intl.DateTimeFormat().resolvedOptions().timeZone}. Sessions provide a shared study time and discussion space.</p>{sessions.length===0?<p className="portal-empty">No sessions are scheduled yet.</p>:<ul className="group-sessions">{sessions.map(session=><li key={session.id}><CalendarDays size={20}/><div><h5>{session.title}</h5><p><time dateTime={session.startsAt}>{formatDate(session.startsAt)}</time> · {session.durationMinutes} minutes</p><p className="portal-material-text">{session.description}</p></div></li>)}</ul>}{admin&&<details className="group-create"><summary>Schedule a session</summary>{error&&<p className="notice error" role="alert">{error}</p>}<form ref={drafts.register} onSubmit={schedule}><fieldset disabled={busy}><label>Session title<input name="title" maxLength={160} required/></label><label>Session plan<textarea name="description" rows={3} maxLength={2000} required/></label><div className="group-form-row"><label>Start in your local time<input type="datetime-local" name="startsAt" required/></label><label>Duration in minutes<input type="number" name="duration" min={1} max={1440} step={1} defaultValue={30} required/></label></div><button className="button" type="submit">Schedule session</button></fieldset></form></details>}</section>;
}

function Members({invitations,members,busy,drafts,invite,revoke,remove,preview,showPreview}:FormProps&{invitations:readonly GroupInvitation[];members:readonly GroupMember[];invite:(email:string,form:HTMLFormElement)=>void;revoke:(invitation:GroupInvitation)=>void;remove:(member:GroupMember)=>void;preview:Readonly<{email:string;token:string}>|null;showPreview?:(id:string)=>void}){
 return <section aria-labelledby="members-heading"><h4 id="members-heading">Members & invitations</h4><p className="portal-hint">Email addresses are visible to authorized administrators here. Learners see discussion roles, not a member email list.</p><form className="portal-card" ref={drafts.register} onSubmit={event=>{event.preventDefault();invite(value(event.currentTarget,'email'),event.currentTarget);}}><fieldset disabled={busy}><label>Learner email<input type="email" name="email" autoComplete="off" maxLength={254} required/></label><button className="button" type="submit">Invite learner</button></fieldset></form><h5>Pending and past invitations</h5>{invitations.length===0?<p>No invitations yet.</p>:<ul className="group-access-list">{invitations.map(item=><li key={item.id}><div><strong>{item.email}</strong><span>{item.status} · expires {formatDate(item.expiresAt)}</span></div>{item.status==='pending'&&<div className="portal-actions">{showPreview&&<button className="text-button" disabled={busy} onClick={()=>showPreview(item.id)}>View simulated email</button>}<button className="text-button danger" disabled={busy} onClick={()=>revoke(item)}>Revoke invitation</button></div>}</li>)}</ul>}{preview&&<aside className="group-invitation-preview" aria-label="Simulated invitation"><h5>Simulated invitation</h5><p>No email was sent. In this local preview, use the code as the invited learner.</p><p>To: {preview.email}</p><label>Simulated invitation code<input readOnly value={preview.token} onFocus={event=>event.currentTarget.select()} autoComplete="off"/></label></aside>}<h5>Current learners</h5>{members.length===0?<p>No learners have joined yet.</p>:<ul className="group-access-list">{members.map(member=><li key={member.userId}><span>{member.email}</span><button className="text-button danger" disabled={busy} onClick={()=>remove(member)}>Remove member</button></li>)}</ul>}<p className="portal-hint">Removing access prevents future requests. It cannot erase a copy someone has already downloaded.</p></section>;
}

function TeacherSupport({requests,admin,busy,drafts,request,create,open}:FormProps&{requests:readonly TeacherRequest[];admin:boolean;request:(subject:string,message:string,form:HTMLFormElement)=>void;create:(request:TeacherRequest,title:string,description:string,form:HTMLFormElement)=>void;open:(id:string)=>void}){
 return <section aria-labelledby="teacher-heading"><h3 id="teacher-heading">{admin?'Teacher requests':'Ask a teacher'}</h3><p>{admin?'Open a private room for a learner who requested help. You become the assigned teacher.':'Tell your library what you would like help with. An administrator can open a private room with an assigned teacher.'}</p>{!admin&&<form className="portal-card" ref={drafts.register} onSubmit={event=>{event.preventDefault();const form=event.currentTarget;request(value(form,'subject'),value(form,'message'),form);}}><fieldset disabled={busy}><label>What would you like to learn?<input name="subject" maxLength={160} required/></label><label>How can a teacher help?<textarea name="message" rows={4} maxLength={2000} required/></label><p className="portal-hint">Only share the help you need. Your encrypted notes and files are not attached. Authorized library staff can review this request.</p><button className="button" type="submit">Request a teacher</button></fieldset></form>}<h4>{admin?'Requests to review':'Your requests'}</h4>{requests.length===0?<p className="portal-empty">No teacher requests yet.</p>:<ul className="group-requests">{requests.map(item=><li key={item.id} className="portal-card"><span className="portal-tag">{item.status==='assigned'?'Private room ready':'Awaiting a teacher'}</span><h5>{item.subject}</h5><p className="portal-material-text">{item.message}</p>{item.roomId?<button className="button secondary" onClick={()=>open(item.roomId!)} disabled={busy}>Open private room</button>:admin&&<details className="group-create"><summary>Open a private teacher room</summary><form ref={drafts.register} onSubmit={event=>{event.preventDefault();const form=event.currentTarget;create(item,value(form,'title'),value(form,'description'),form);}}><fieldset disabled={busy}><label>Private room title<input name="title" maxLength={160} defaultValue={item.subject} required/></label><label>Private room purpose<textarea name="description" rows={3} maxLength={2000} defaultValue="A private space for the learner and assigned teacher to discuss this request." required/></label><button className="button" type="submit">Create private room</button></fieldset></form></details>}</li>)}</ul>}</section>;
}
