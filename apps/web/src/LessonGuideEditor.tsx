import {LESSON_GUIDE_LIMITS,type TeachingGuide} from '../../../packages/portal/src/index.ts';

const fields:ReadonlyArray<{key:keyof TeachingGuide;label:string;rows:number}>=[
  {key:'goal',label:'Learning goal',rows:2},
  {key:'connection',label:'Familiar connection',rows:3},
  {key:'workedExample',label:'Worked example',rows:5},
  {key:'practice',label:'Practice task',rows:3},
  {key:'checkQuestion',label:'Check question',rows:3},
  {key:'checkExplanation',label:'Explanation to compare',rows:5},
];
const emptyGuide=():TeachingGuide=>({goal:'',connection:'',workedExample:'',practice:'',checkQuestion:'',checkExplanation:''});
export function LessonGuideEditor({value,lessonId,published,onChange}:{value?:TeachingGuide;lessonId:string;published:boolean;onChange:(value:TeachingGuide|undefined)=>void}){
  return <fieldset className="portal-guide-editor"><legend>Teaching guide</legend>
    <label className="portal-check"><input type="checkbox" name={`guide-enabled-${lessonId}`} checked={Boolean(value)} onChange={event=>onChange(event.currentTarget.checked?emptyGuide():undefined)}/>Add a teaching guide</label>
    <p className="portal-hint">Help learners follow a goal, an example, a practice task and an explanation. {published?'Complete the guide before publishing reviewed changes to this published course.':'Save an unfinished guide with Save draft.'} The familiar connection is optional. Turning this off removes the guide from your edits.</p>
    {value&&fields.map(field=><div className="portal-guide-field" key={field.key}><label htmlFor={`guide-${field.key}-${lessonId}`}>{field.label}</label><textarea id={`guide-${field.key}-${lessonId}`} name={`guide-${field.key}-${lessonId}`} value={value[field.key]} rows={field.rows} maxLength={LESSON_GUIDE_LIMITS[field.key]} onChange={event=>onChange({...value,[field.key]:event.currentTarget.value})}/></div>)}
    {value&&<p className="portal-hint">Keep the main teaching explanation, transcript or accessible description in Lesson text. The comparison explanation is visible to learners when they choose to reveal it; it is for practice, not a secure exam.</p>}
  </fieldset>;
}
