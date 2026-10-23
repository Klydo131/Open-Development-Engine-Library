import {useEffect,useId,useRef,useState} from 'react';
import './tutorial.css';

type TutorialRole='guest'|'learner'|'admin';
type Step=Readonly<{title:string;instructions:readonly string[]}>;
type Props={role:TutorialRole;demo:boolean};

const learnerSteps:readonly Step[]=[
  {title:'Sign in with your invited email',instructions:[
    'In a connected library, choose Sign in. If you need an account, choose Create an account and follow the email verification instructions before signing in.',
    'Use the same verified email address that your library invited. An invitation gives access to its study group; creating an account alone does not join a group or grant staff access.',
  ]},
  {title:'Find a course and open its materials',instructions:[
    'Choose Courses, read a course purpose, then choose Explore course. After signing in, choose a lesson in its outline. Use Reading size above if larger text helps.',
    'Read the lesson text at your own pace. Choose Download for an attachment or Open credited source for a link only when you want to open that material. A linked site has its own privacy practices.',
  ]},
  {title:'Join a group and make time to learn',instructions:[
    'If Study groups is available, open it and choose Join invitation. Use the code from your invitation while signed in with the invited email, then choose Accept invitation.',
    'Open your group to read its Discussion and share a message when you choose. Sessions lists shared study times in your device’s local time zone. Check that zone before making plans; scheduled sessions are not an audio or video call.',
  ]},
  {title:'Ask for a teacher',instructions:[
    'Open Study groups, then Teacher support. Describe what you want to learn and how a teacher could help, then choose Request a teacher. Share only the information needed for the request.',
    'An administrator reviews the request and can create a private teacher room. When your request says Private room ready, choose Open private room to discuss it with the assigned teacher. A request does not guarantee a response time.',
  ]},
  {title:'Know which space is private',instructions:[
    'Your personal private room is a separate encrypted library for your own notes and files. Its passphrase is different from your institution account password. An account email reset cannot unlock that library.',
    'Study groups and private teacher rooms are shared spaces on the library service. Their messages are not your encrypted personal vault: group members can read group discussions, and the requesting learner and assigned teacher can read their teacher room. Keep passwords, private room keys and sensitive personal notes out of messages.',
  ]},
  {title:'Ask for help and return when ready',instructions:[
    'Use Ask for help from a lesson, or open Support. Select the related course if useful, write a subject and message, and submit only when you are ready. Authorized library support staff can read that message; your private notes and files are not attached.',
    'Return to Support for a reply. You can pause your learning at any time. This guide records no completion or mastery; reopen Getting started whenever you need a reminder.',
  ]},
];

const adminSteps:readonly Step[]=[
  {title:'Use your assigned staff account',instructions:[
    'Sign in with the verified email account your institution assigned for teaching or curating. Staff roles are assigned by the library service administrator; choosing Create an account does not make someone an admin.',
    'The admin view includes New course and the Support inbox. If your expected tools are missing, ask your institution to check your assigned access. Demo role previews do not grant access to a connected library.',
  ]},
  {title:'Create and review a course',instructions:[
    'Choose New course and add a clear title, purpose and language. Add small lessons using written text, documents or PDFs, audio, video, images or source links. When file uploads are available, attach a supported file within the displayed limit; otherwise use a source link.',
    'Provide readable text, a transcript or an accessible description where needed. Credit the creator and record permission or content rights for each lesson. Save draft to prepare privately. Review the material, credits and rights, check the review statement, then choose Publish course when it is ready. Changes require a fresh review.',
  ]},
  {title:'Invite a study group and schedule a session',instructions:[
    'Open Study groups and expand Create a study group. Give it a title and purpose, then create it. Open the group and choose Members & invitations. Enter the learner’s email and choose Invite learner. Email delivery depends on the configured service; a local demo only offers a simulated invitation.',
    'Use Revoke invitation for a pending invitation that should no longer work. In Sessions, expand Schedule a session and enter its plan, local start time and duration. Confirm your device’s time zone. This schedules discussion time; it does not start an audio or video call.',
  ]},
  {title:'Respond to a teacher request',instructions:[
    'Open Study groups, then Teacher support to review Teacher requests. For a request you can support, expand Open a private teacher room, confirm its title and purpose, then choose Create private room.',
    'The administrator who creates the room becomes its assigned teacher. The requesting learner and assigned teacher can discuss there. A private teacher room is shared library content and is separate from either person’s encrypted personal vault.',
  ]},
  {title:'Care for discussions and access',instructions:[
    'Open a group’s Discussion to answer questions and remove messages that need moderation. Read removal confirmations carefully. Use the Support inbox to reply to submitted support requests, sharing only what the learner needs.',
    'In Members & invitations, check the intended email before inviting, revoke unwanted pending invitations, and use Remove member when group access should end. Learners do not receive the admin member email list. Removing access prevents future requests; it cannot erase copies already downloaded.',
  ]},
  {title:'Check which services are available',instructions:[
    'Read the library’s mode label before inviting people or publishing. Local demonstration accounts, courses, files, groups and support are temporary memory data. Refresh clears demo changes. No email is sent and no password is stored.',
    'A connected institution needs its account, email, file and group services configured for the features it offers. Check those services with your institution before relying on delivery or access. Close this guide to return to your work; reopening it does not mark anyone trained or assess learning.',
  ]},
];

/** Read-only guidance. Keep the surrounding work mounted while a guide is open. */
export function PortalTutorial({role,demo}:Props){
  const [open,setOpen]=useState(false),[index,setIndex]=useState(0);
  const trigger=useRef<HTMLButtonElement>(null),heading=useRef<HTMLHeadingElement>(null);
  const id=useId(),steps=role==='admin'?adminSteps:learnerSteps,step=steps[index];
  const title=role==='admin'?'Getting started as an admin':'Getting started as a learner';
  const close=()=>{setOpen(false);trigger.current?.focus();};
  useEffect(()=>{if(open)heading.current?.focus();},[open,index]);

  return <div className="portal-tutorial" onKeyDown={event=>{
    if(open&&event.key==='Escape'){event.preventDefault();event.stopPropagation();close();}
  }}>
    <button ref={trigger} type="button" className="button secondary" aria-expanded={open} aria-controls={`${id}-guide`} onClick={()=>{
      if(open)close();else{setIndex(0);setOpen(true);}
    }}>Getting started</button>
    {open&&<section id={`${id}-guide`} className="portal-tutorial-panel" aria-labelledby={`${id}-title`}>
      <header className="portal-tutorial-header"><h2 id={`${id}-title`}>{title}</h2><button type="button" className="text-button" onClick={close}>Close guide</button></header>
      <p className="portal-tutorial-context">{demo
        ?'This is a local demonstration. Changes last only until refresh. No email is sent and no password is stored. Explore with the visible preview controls; the sign-in instructions apply to a connected institution.'
        :'You are using an institution library. Your institution manages account access and the services available here.'}</p>
      {role==='guest'&&<p>You can browse course summaries before signing in. Staff tools require access assigned by your institution; creating an account does not grant admin access.</p>}
      <p id={`${id}-position`} className="portal-tutorial-position">Step {index+1} of {steps.length}</p>
      <h3 ref={heading} tabIndex={-1} aria-describedby={`${id}-position`}>{step.title}</h3>
      <ol className="portal-tutorial-instructions">{step.instructions.map(instruction=><li key={instruction}>{instruction}</li>)}</ol>
      <p className="portal-tutorial-note">Reading this guide submits nothing. You can close it at any time and keep your current draft.</p>
      <div className="portal-tutorial-actions"><button type="button" className="button secondary" disabled={index===0} onClick={()=>setIndex(current=>current-1)}>Back</button>{index<steps.length-1?<button type="button" className="button" onClick={()=>setIndex(current=>current+1)}>Next</button>:<button type="button" className="button" onClick={close}>Return to your work</button>}</div>
    </section>}
  </div>;
}
