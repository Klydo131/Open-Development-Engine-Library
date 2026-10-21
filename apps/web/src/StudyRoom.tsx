import React,{useEffect,useLayoutEffect,useRef,useState} from 'react';
import {ArrowRight,LockKeyhole,X} from 'lucide-react';
import type {Attempt,Brief} from '../../../packages/education/src/index.ts';
import type {DraftGuard} from './useDraftGuard.ts';

type Props={brief:Brief;initial:Attempt;busy:boolean;drafts:DraftGuard;save:(attempt:Attempt,form:HTMLFormElement)=>Promise<boolean>;close:()=>void;lockRoom:()=>void;openLink:(url:string)=>void};
const steps=['Read','Try','Check','Plan'] as const;
export function StudyRoom({brief,initial,busy,drafts,save,close,lockRoom,openLink}:Props){
 const dialog=useRef<HTMLDialogElement>(null),form=useRef<HTMLFormElement|null>(null),heading=useRef<HTMLHeadingElement>(null),alive=useRef(true);
 const [step,setStep]=useState(0),[help,setHelp]=useState(false),[size,setSize]=useState('comfortable'),[spacious,setSpacious]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const register=React.useCallback((element:HTMLFormElement|null)=>{form.current=element;return drafts.register(element);},[drafts.register]);
 useEffect(()=>{alive.current=true;dialog.current?.showModal();return()=>{alive.current=false;dialog.current?.close();};},[]);
 useLayoutEffect(()=>{if(dialog.current?.open)heading.current?.focus();},[step]);
 function leave(){if(!form.current||drafts.confirmDiscard(form.current))close();}
 function move(next:number){setStep(next);setHelp(false);}
 async function submit(event:React.FormEvent<HTMLFormElement>){
  event.preventDefault();const element=event.currentTarget,data=new FormData(element);setError('');setNotice('');
  const attempt:Attempt={...initial,answer:String(data.get('answer')??''),question:String(data.get('question')??''),nextAction:String(data.get('nextAction')??''),...(data.get('reviewDate')?{reviewDate:String(data.get('reviewDate'))}:{reviewDate:undefined})};
  try{const ok=await save(attempt,element);if(alive.current){if(ok)setNotice(drafts.isDirty(element)?'Saved your submitted work. Newer text is still unsaved.':'Saved privately. You can keep studying or close this view.');else setError('Your work was not saved. Your text is still here; try again before closing.');}}catch(error){if(alive.current)setError(error instanceof Error?error.message:'Could not save this attempt.');}
 }
 const reference=<section className="study-reference" aria-label="Learning brief reference"><h3>Learning brief</h3><p>{brief.goal}</p>{brief.example&&<details><summary>Show a worked example</summary><p className="preserve-text">{brief.example}</p></details>}{brief.sources.map((source,index)=><div className="education-credit" key={index}><strong>{source.title}</strong><p>{source.creator||'Creator not recorded'} · {source.license||'Permission not recorded'}</p>{source.url&&<button type="button" className="text-button" onClick={()=>openLink(source.url)}>Open credited source<ArrowRight size={16}/></button>}</div>)}</section>;
 return <dialog ref={dialog} className={`study-room study-size-${size}${spacious?' study-spacious':''}`} aria-labelledby="study-room-title" onCancel={event=>{event.preventDefault();leave();}}>
  <header className="dialog-head"><h2 id="study-room-title">Study room</h2><div className="education-actions"><button type="button" className="text-button" onClick={lockRoom}>Lock room now<LockKeyhole size={16}/></button><button type="button" className="icon-button" aria-label="Close study room" onClick={leave}><X/></button></div></header>
  <div className="modal-body"><p>One small step at your pace. Get help or return to any step whenever you need.</p><p className="form-hint">Save before taking a break. Unsaved text is lost when the room locks. The sample is temporary.</p>
   <div className="study-preferences"><div className="study-reading-choice"><label htmlFor="study-reading-size">Reading size</label><select id="study-reading-size" value={size} onChange={event=>setSize(event.target.value)}><option value="comfortable">Comfortable</option><option value="large">Large</option><option value="largest">Extra large</option></select></div><label className="check-label"><input type="checkbox" checked={spacious} onChange={event=>setSpacious(event.target.checked)}/>More text spacing</label></div>
   <nav className="study-steps" aria-label="Study steps">{steps.map((label,index)=><button type="button" key={label} aria-current={step===index?'step':undefined} onClick={()=>move(index)}>{index+1}. {label}</button>)}</nav>
   <h2 ref={heading} tabIndex={-1} className="study-step-heading">{steps[step]} · {brief.title}</h2><p className="preserve-text study-task">{brief.task}</p>
   {step===0&&<p>Choose a small part to understand. Read the brief or your credited source. An example is available if it helps.</p>}
   {step===1&&<><p>Try explaining one idea or making one example. It is fine to need help. This is private practice, without a timer or score.</p><button type="button" className="button secondary" aria-expanded={help} onClick={()=>setHelp(!help)}>{help?'Hide learning brief':'Show learning brief or example'}</button></>}
   {step===2&&<p>Compare your attempt with the brief or source. What matches? What would you change? Edit your answer below; this does not automatically mark it correct.</p>}
   {step===3&&<p>Choose one manageable next action. An optional review date is your choice; it schedules no notification.</p>}
   {(step===0||step===2||help)&&reference}
   <form ref={register} onSubmit={event=>void submit(event)}>
    <div hidden={step===0} className="study-writing"><label htmlFor="study-answer">My study attempt</label><textarea id="study-answer" name="answer" rows={6} maxLength={20000} defaultValue={initial.answer} placeholder="Name one idea, give an example, or describe what is unclear."/><label htmlFor="study-question">A question or help I need</label><textarea id="study-question" name="question" rows={2} maxLength={5000} defaultValue={initial.question}/></div>
    <div hidden={step!==3} className="study-writing"><label htmlFor="study-next-action">My private next action</label><textarea id="study-next-action" name="nextAction" rows={3} maxLength={5000} defaultValue={initial.nextAction}/><label htmlFor="study-review-date">Review on</label><input id="study-review-date" name="reviewDate" type="date" defaultValue={initial.reviewDate}/></div>
    {error&&<p role="alert" className="notice error">{error}</p>}{notice&&<p role="status" className="notice">{notice}</p>}
    <div className="study-room-actions">{step>0&&<button type="button" className="button secondary" onClick={()=>move(step-1)}>Previous step</button>}{step<3&&<button type="button" className="button secondary" onClick={()=>move(step+1)}>Next step<ArrowRight size={16}/></button>}<button className="button" disabled={busy}>{busy?'Saving…':'Save private study'}</button></div>
   </form><p className="form-hint">Reading choices last only in this view. No age, ability label, study time or score is collected. Saving preserves an attempt revision in this private room; sharing is a separate selected-text review.</p>
  </div>
 </dialog>;
}
