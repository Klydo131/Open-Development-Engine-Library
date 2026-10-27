import type {TeachingGuide} from '../../../packages/portal/src/index.ts';
import type {DraftGuard} from './useDraftGuard.ts';

export function LessonStudyGuide({guide,text,register,busy}:{guide:TeachingGuide;text:string;register:DraftGuard['register'];busy:boolean}){
  return <div className="portal-study-guide">
    <section className="portal-guide-goal"><h4>Learning goal</h4><p className="portal-guide-text">{guide.goal}</p></section>
    {guide.connection.trim()&&<section><h4>Connect what you know</h4><p className="portal-guide-text">{guide.connection}</p></section>}
    <section><h4>Explanation</h4><p className="portal-material-text">{text||'Use the credited material below alongside this guide.'}</p></section>
    <section><h4>Worked example</h4><p className="portal-guide-text">{guide.workedExample}</p></section>
    <section><h4>Practise</h4><p className="portal-guide-text">{guide.practice}</p><p className="portal-hint">You can think, sketch elsewhere, or explain aloud. Choose a way that works for you.</p></section>
    <section><h4>Check your understanding</h4><p className="portal-guide-text">{guide.checkQuestion}</p>
      <form ref={register} aria-label="Private lesson practice" onSubmit={event=>event.preventDefault()}>
        <fieldset disabled={busy}><label>Your explanation<textarea name="lesson-explanation" rows={4} maxLength={5000} autoComplete="off" aria-describedby="lesson-practice-privacy"/></label></fieldset>
        <p className="portal-hint" id="lesson-practice-privacy">Your response stays on this screen. The library does not save or submit it. Copy it elsewhere if you want to keep it.</p>
      </form>
      <details className="portal-guide-feedback"><summary>Show explanation</summary><p className="portal-guide-text">{guide.checkExplanation}</p><p className="portal-hint">Compare the reasoning and revise your response if it helps. This practice has no score.</p></details>
      <p className="portal-hint">Need another explanation? Choose Ask for help below and decide what to share.</p>
    </section>
  </div>;
}
