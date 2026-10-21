export type DraftSnapshot=Map<Element,string>;
type Control=HTMLInputElement|HTMLTextAreaElement|HTMLSelectElement;
const fileIds=new WeakMap<object,number>();let nextFileId=0;
function controls(form:HTMLFormElement):Control[]{
 return Array.from(form.elements).filter((element):element is Control=>{
  const control=element as Control;if(!control.name||!['INPUT','TEXTAREA','SELECT'].includes(control.tagName))return false;
  return control.tagName!=='INPUT'||!['button','submit','reset','password','hidden','search','image'].includes((control as HTMLInputElement).type);
 });
}
function value(control:Control,defaults=false):string{
 if(control.tagName==='SELECT'){
  const select=control as HTMLSelectElement;const options=Array.from(select.options);let selected=options.filter(option=>defaults?option.defaultSelected:option.selected);
  if(defaults&&!selected.length&&!select.multiple&&options.length)selected=[options[0]];
  return JSON.stringify(selected.map(option=>option.value));
 }
 const input=control as HTMLInputElement;
 if(control.tagName==='INPUT'&&['checkbox','radio'].includes(input.type))return JSON.stringify([input.value,defaults?input.defaultChecked:input.checked]);
 if(control.tagName==='INPUT'&&input.type==='file'){
  if(defaults)return '[]';return JSON.stringify(Array.from(input.files??[]).map(file=>{let id=fileIds.get(file);if(!id){id=++nextFileId;fileIds.set(file,id);}return [id,file.name,file.size,file.type,file.lastModified];}));
 }
 return defaults?input.defaultValue:input.value;
}
/** Form baselines are memory-only and retire when their form leaves the document. */
export class DraftTracker{
 #forms=new Map<HTMLFormElement,DraftSnapshot>();
 capture(form:HTMLFormElement):DraftSnapshot{return new Map(controls(form).map(control=>[control,value(control)]));}
 register(form:HTMLFormElement):void{if(!this.#forms.has(form))this.#forms.set(form,this.capture(form));}
 unregister(form:HTMLFormElement):void{this.#forms.delete(form);}
 reset(form:HTMLFormElement):void{this.#forms.set(form,this.capture(form));}
 markSaved(form:HTMLFormElement,submitted:DraftSnapshot):void{if(this.#forms.has(form))this.#forms.set(form,new Map(submitted));}
 isDirty(form:HTMLFormElement):boolean{
  const baseline=this.#forms.get(form);if(!baseline)return false;const current=this.capture(form);
  for(const element of baseline.keys())if(!current.has(element))baseline.delete(element);
  for(const [element,currentValue] of current){if(!baseline.has(element))baseline.set(element,value(element as Control,true));if(baseline.get(element)!==currentValue)return true;}
  return false;
 }
 hasChanges(scope?:HTMLElement):boolean{
  let dirty=false;for(const form of this.#forms.keys()){
   if(!form.isConnected){this.#forms.delete(form);continue;}
   if((!scope||scope===form||scope.contains(form))&&this.isDirty(form))dirty=true;
  }return dirty;
 }
 clear():void{this.#forms.clear();}
}
