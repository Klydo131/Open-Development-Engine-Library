import {portalId, validateCourse, validateSupportQuestion, validateSupportReply, type Course, type CoursePortal, type Material, type PortalAccount, type SupportThread} from '../../../packages/portal/src/index.ts';
import {createDemoGroups} from './portal-demo-groups.ts';
import {createDemoMedia} from './portal-media-demo.ts';

export interface DemoCoursePortal extends CoursePortal {
  readonly kind: 'demo';
  /** A visible local preview only. Never use this method as authentication. */
  setDemoRole(role: 'learner'|'admin'|null): void;
  previewInvitation(id:string):Readonly<{email:string;token:string}>;
}

const original = 'Original Open Learning Rooms sample; CC BY 4.0.';
const material = (title:string,text:string):Material => ({id:crypto.randomUUID(),title,text,sourceUrl:'',credit:'Open Learning Rooms',rights:original});
function samples():Course[] {
  return [
    {id:crypto.randomUUID(),revision:crypto.randomUUID(),title:'Notice motion',summary:'Explore how a gentle push changes motion. Use observations, then explain your thinking in your own words.',language:'en',status:'published',lessons:[
      material('A small push','Read\nA force is a push or pull. A change in motion can be speeding up, slowing down or changing direction.\n\nTry\nOn a clear table, gently push a lightweight object. Stop if it could fall. What changed? You can also imagine the example instead.\n\nCheck\nDescribe the change without saying that a force always makes an object move faster.\n\nPlan\nChoose another everyday example. Explain it to someone or sketch it for yourself.'),
      material('When forces balance','Read\nA book resting on a table has forces acting on it. Gravity pulls it down and the table supports it. When these forces balance, the book does not accelerate.\n\nTry\nDraw two arrows for the forces on the book.\n\nCheck\nDo your arrows show opposite directions? Why can an object have forces acting on it while staying still?\n\nPlan\nWrite one question you would like help with.') ]},
    {id:crypto.randomUUID(),revision:crypto.randomUUID(),title:'Find a steady pulse',summary:'Notice an even musical pulse with a short, untimed practice. No instrument or recording is required.',language:'en',status:'published',lessons:[
      material('Listen, count, pause','Read\nA pulse is a steady reference for music. Rhythms can fit around that pulse.\n\nTry\nCount one, two, three, four at a comfortable pace. If comfortable, tap along; imagining or looking at written counts works too. Pause whenever you need.\n\nCheck\nWere the gaps between your counts similar? Try again slowly without judging the first attempt.\n\nPlan\nDescribe one way you could keep a pulse during a familiar song. No recording needs to be uploaded.') ]},
  ];
}
const snapshot = <T>(value:T):T => structuredClone(value);

/** Disposable local demonstration. It sends no email and stores no passwords. */
export function createDemoPortal(options:{learnerId?:string}={}):DemoCoursePortal {
  const learnerId=portalId(options.learnerId??crypto.randomUUID());
  const adminId=crypto.randomUUID();
  let current:PortalAccount={user:null,recovery:false};
  let courses=samples();
  const threads:SupportThread[]=[];
  const listeners=new Set<()=>void>();
  const requireUser=()=>{if(!current.user)throw new Error('Choose a demo learner or admin preview first.');return current.user;};
  const requireAdmin=()=>{const user=requireUser();if(user.role!=='admin')throw new Error('Only an assigned admin can manage materials.');return user;};
  const noEmail=async()=>{throw new Error('Email accounts are not configured in this local demo. Choose a preview instead.');};
  const groups=createDemoGroups(requireUser,{learnerId,adminId});
  const media=createDemoMedia(()=>current,async id=>current.user?.role==='admin'||((await groups.workspace.listGroups()).length>0&&courses.some(course=>course.status==='published'&&course.lessons.some(lesson=>lesson.attachment?.id===id))));
  return {
    kind:'demo',
    groups:groups.workspace,
    media,
    previewInvitation:groups.previewInvitation,
    async account(){return snapshot(current);},
    onAccountChange(listener){listeners.add(listener);return()=>{listeners.delete(listener);};},
    setDemoRole(role){if(role!==null&&role!=='learner'&&role!=='admin')throw new Error('Choose an available demo preview.');current={user:role?{id:role==='admin'?adminId:learnerId,email:role==='admin'?'admin@example.invalid':'learner@example.invalid',role}:null,recovery:false};for(const listener of listeners)listener();},
    signUp:noEmail,signIn:noEmail,requestPasswordReset:noEmail,updatePassword:noEmail,
    async signOut(){this.setDemoRole(null);},
    async listCourses(){const member=Boolean(current.user&&(current.user.role==='admin'||(await groups.workspace.listGroups()).length));return snapshot(courses.filter(course=>course.status==='published'||current.user?.role==='admin').map(course=>member?course:{...course,lessons:[]}));},
    async saveCourse(input,expectedRevision){
      requireAdmin();
      const checked=validateCourse(input);
      if(checked.lessons.some(lesson=>lesson.attachment&&!media.has(lesson.attachment)))throw new Error('Upload the library file before attaching it to a lesson.');
      if(checked.status==='published'&&(!checked.lessons.length||checked.lessons.some(lesson=>(!lesson.text.trim()&&!lesson.sourceUrl&&!lesson.attachment)||!lesson.credit.trim()||!lesson.rights.trim())))throw new Error('Add lesson text, an attachment or a source link, creator credit and content rights before publishing.');
      const existing=courses.find(course=>course.id===checked.id);
      if(existing?existing.revision!==expectedRevision:expectedRevision!==null)throw new Error('This course changed elsewhere. Reopen it before saving. Your edits are still here.');
      if(!existing&&courses.length>=100)throw new Error('This demo supports up to 100 courses.');
      const next={...checked,revision:crypto.randomUUID()};
      courses=existing?courses.map(course=>course.id===next.id?next:course):[...courses,next];
      return snapshot(next);
    },
    async getSupport(){const user=requireUser();return snapshot(threads.filter(thread=>user.role==='admin'||thread.learnerId===user.id));},
    async askSupport(input){
      const user=requireUser();
      if(user.role!=='learner')throw new Error('Use the learner preview to ask for support.');
      const checked=validateSupportQuestion(input);
      const subject=checked.subject.trim(),message=checked.message.trim();
      if(checked.courseId&&!courses.some(course=>course.id===checked.courseId&&course.status==='published'))throw new Error('Choose an available published course.');
      if(threads.length>=100)throw new Error('This demo supports up to 100 support requests.');
      threads.push({id:crypto.randomUUID(),learnerId:user.id,...(checked.courseId?{courseId:checked.courseId}:{}),subject,message,reply:'',status:'open',revision:crypto.randomUUID()});
    },
    async replySupport(id,reply,expectedRevision){
      requireAdmin();
      const thread=threads.find(value=>value.id===id);
      if(!thread||thread.revision!==expectedRevision)throw new Error('This request changed elsewhere. Reopen it before replying. Your reply is still here.');
      const clean=validateSupportReply(reply).trim();
      threads.splice(threads.indexOf(thread),1,{...thread,reply:clean,status:'answered',revision:crypto.randomUUID()});
    },
  };
}
