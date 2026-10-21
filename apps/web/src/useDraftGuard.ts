import {useCallback,useEffect,useLayoutEffect,useMemo,useState} from 'react';
import {DraftTracker,type DraftSnapshot} from './drafts.ts';

export type DraftGuard = ReturnType<typeof useDraftGuard>;
/** Drafts remain in the mounted form and this private in-memory baseline only. */
export function useDraftGuard(){
 const tracker=useMemo(()=>new DraftTracker(),[]);
 const [dirty,setDirty]=useState(false);
 const refresh=useCallback(()=>setDirty(tracker.hasChanges()),[tracker]);
 useLayoutEffect(refresh);
 const register=useCallback((form:HTMLFormElement|null)=>{
  if(!form)return;
  tracker.register(form);
  return ()=>{tracker.unregister(form);refresh();};
 },[tracker,refresh]);
 useEffect(()=>{
  // Observe after React's root handlers have copied controlled input values into state.
  document.addEventListener('input',refresh);document.addEventListener('change',refresh);
  return ()=>{document.removeEventListener('input',refresh);document.removeEventListener('change',refresh);tracker.clear();};
 },[refresh,tracker]);
 useEffect(()=>{
  if(!dirty)return;
  const beforeUnload=(event:BeforeUnloadEvent)=>{if(tracker.hasChanges()){event.preventDefault();event.returnValue=true;}};
  window.addEventListener('beforeunload',beforeUnload);
  return ()=>window.removeEventListener('beforeunload',beforeUnload);
 },[dirty,tracker]);
 const confirmDiscard=useCallback((scope?:HTMLElement)=>!tracker.hasChanges(scope)||window.confirm('You have unsaved edits. Leave this screen and discard them?'),[tracker]);
 const capture=useCallback((form:HTMLFormElement)=>tracker.capture(form),[tracker]);
 const markSaved=useCallback((form:HTMLFormElement,submitted:DraftSnapshot)=>{if(form.isConnected)tracker.markSaved(form,submitted);refresh();},[tracker,refresh]);
 const reset=useCallback((form:HTMLFormElement)=>{if(form.isConnected)tracker.reset(form);refresh();},[tracker,refresh]);
 const matches=useCallback((form:HTMLFormElement,submitted:DraftSnapshot)=>{const current=tracker.capture(form);return current.size===submitted.size&&[...current].every(([element,value])=>submitted.get(element)===value);},[tracker]);
 const clear=useCallback(()=>{tracker.clear();setDirty(false);},[tracker]);
 const isDirty=useCallback((form:HTMLFormElement)=>tracker.isDirty(form),[tracker]);
 return {dirty,register,refresh,confirmDiscard,capture,markSaved,reset,clear,isDirty,matches};
}
