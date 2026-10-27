import {portalId, validateCourse, validateSupportQuestion, validateSupportReply, type Course, type CoursePortal, type Material, type PortalAccount, type SupportThread, type TeachingGuide} from '../../../packages/portal/src/index.ts';
import {createDemoGroups} from './portal-demo-groups.ts';
import {createDemoMedia} from './portal-media-demo.ts';

export interface DemoCoursePortal extends CoursePortal {
  readonly kind: 'demo';
  /** A visible local preview only. Never use this method as authentication. */
  setDemoRole(role: 'learner'|'admin'|null): void;
  previewInvitation(id:string):Readonly<{email:string;token:string}>;
}

const original = 'Original Open Learning Rooms sample; CC BY 4.0.';
const material = (title:string,text:string,teaching:TeachingGuide):Material => ({id:crypto.randomUUID(),title,text,sourceUrl:'',credit:'Open Learning Rooms',rights:original,teaching});
function samples():Course[] {
  return [
    {id:crypto.randomUUID(),revision:crypto.randomUUID(),title:'Notice motion',summary:'Explore how a gentle push changes motion. Use observations, then explain your thinking in your own words.',language:'en',status:'published',lessons:[
      material('A small push','A force is a push or pull. A change in motion can be speeding up, slowing down or changing direction. When forces do not balance, the motion changes. A force does not always make an object move faster.',{
        goal:'Explain how a push or pull can change speed or direction.',
        connection:'Think about gently closing a drawer. What changes when you push it? Imagining the movement is enough; you do not need to move anything.',
        workedExample:'1. Imagine a ball already rolling.\n2. A gentle push from the side changes its direction.\n3. Its change in motion shows that the forces on it did not balance.',
        practice:'Imagine a toy car receiving a gentle push from one side. Sketch its possible path or describe what may change. Then choose a different everyday example.',
        checkQuestion:'A rolling ball slows down even when nobody touches it. Does that mean no forces are acting? Explain why or why not.',
        checkExplanation:'No. The surface and the air can exert forces on the ball. A net force opposite its motion can slow it down. Look for a change in speed or direction, rather than assuming every force makes something faster.',
      }),
      material('When forces balance','A book resting on a table has forces acting on it. Gravity pulls it down and the table supports it. When these forces balance, the book does not accelerate. Balanced forces can also act on an object moving at a steady speed in a straight line.',{
        goal:'Explain how an object can remain still while forces act on it.',
        connection:'Think about a book resting on a table. It looks still, but what keeps it from falling through the table?',
        workedExample:'1. Gravity pulls the book downward.\n2. The table pushes upward on the book.\n3. Equal forces in opposite directions balance, so the book does not accelerate.',
        practice:'Draw the book and two equal arrows in opposite directions, or describe the two forces in words. Explain why a still object can have forces acting on it.',
        checkQuestion:'If an object moves at a steady speed in a straight line, must the forces on it be unbalanced?',
        checkExplanation:'No. Its velocity is unchanged, so its acceleration is zero and the forces balance. In a real sliding example, an applied push may balance friction. Balanced forces do not require the object to be at rest.',
      }) ]},
    {id:crypto.randomUUID(),revision:crypto.randomUUID(),title:'Find a steady pulse',summary:'Notice an even musical pulse with a short, untimed practice. No instrument or recording is required.',language:'en',status:'published',lessons:[
      material('Listen, count, pause','A pulse is a steady reference for music. Rhythms can fit around that pulse. An even pulse has similar gaps between beats; the rhythm can use different patterns around them.',{
        goal:'Describe an even pulse and distinguish it from a rhythm pattern.',
        connection:'Imagine steady footsteps. You can notice the similar gaps without moving or making a sound.',
        workedExample:'1. Imagine four equally spaced beats: one, two, three, four.\n2. Keep that spacing steady.\n3. Imagine a rhythm with two short sounds inside one beat. The rhythm changed, while the underlying pulse stayed steady.',
        practice:'Count four beats at a comfortable pace, silently or aloud. Pause whenever you need. Imagine or write a short rhythm over the same even beats; no instrument or recording is required.',
        checkQuestion:'If a rhythm adds more sounds between the beats, does the pulse have to get faster? Explain your thinking.',
        checkExplanation:'No. More sounds can fit within the same spacing between beats. The rhythm pattern can become busier while the pulse stays steady. Try imagining the even beats separately from the sounds around them.',
      }) ]},
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
