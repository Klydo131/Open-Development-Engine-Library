import { createAsset, createCatalog, createResource, createRevision, hashContent, sealCatalog, unsealCatalog, validateBundle, validateCatalogEnvelope, validateEnvelope, validateLibrary, unseal, fromBase64, toBase64, inspectFile, type CatalogBundle, type CatalogEnvelope, type Envelope, type Library, type Lesson, type JsonValue, type Resource, type VaultSession } from '../../../packages/core/src/index.ts';

export const LEARNING_NAMESPACE = 'org.openlearningrooms.learning';
export type AppEnvelope = Envelope | CatalogEnvelope;
export function validateAppEnvelope(value:unknown):AppEnvelope {
  return (value as {format?:unknown})?.format==='open-library-catalog-vault' ? validateCatalogEnvelope(value) : validateEnvelope(value);
}
export function revisionOf(value:AppEnvelope):string {return value.format==='open-library-catalog-vault'?value.revision:value.iv;}
function extension(value:unknown):Record<string,unknown> {
  return value!==null&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,unknown>:{};
}
async function resourceId(value:string):Promise<string> {
  return /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(value)&&value.length<=128&&!/[\r\n]/.test(value) ? value : `legacy-${(await hashContent(new TextEncoder().encode(value))).slice(0,48)}`;
}
export function learningResource(bundle:CatalogBundle,id:string):Resource|undefined {
  return bundle.catalog.resources.find(r=>extension(r.extensions[LEARNING_NAMESPACE]).lessonId===id || r.id===id);
}
/** The learning client preserves generic metadata and other applications' extensions. */
export async function libraryToBundle(input:Library, previous?:CatalogBundle):Promise<CatalogBundle> {
  const library=validateLibrary(input);
  const catalog=previous?structuredClone(previous.catalog):createCatalog();
  const content=new Map(previous?.content??[]);
  const resources:Resource[]=[];
  const assets=[...catalog.assets];
  for(const lesson of library.lessons){
    const old=previous?learningResource(previous,lesson.id):undefined;
    const id=old?.id??await resourceId(lesson.id);
    let assetIds=old?[...old.assetIds]:[];
    if(lesson.attachment){
      const bytes=fromBase64(lesson.attachment.data);
      const unchanged=assetIds.find(assetId=>{const descriptor=assets.find(a=>a.id===assetId);const existing=content.get(assetId);return descriptor?.name===lesson.attachment!.name&&descriptor.mime===lesson.attachment!.mime&&existing&&toBase64(existing)===lesson.attachment!.data;});
      if(unchanged){ /* Preserve other referenced assets as well. */ }
      else {const asset=await createAsset(bytes,{id:`asset-${crypto.randomUUID()}`,name:lesson.attachment.name,mime:lesson.attachment.mime});assets.push(asset);content.set(asset.id,bytes);assetIds=[asset.id,...assetIds.slice(1)];}
    }
    const priorLearning=extension(old?.extensions[LEARNING_NAMESPACE]);
    const kind=old?.kind??(lesson.kind==='pdf'?'document':lesson.kind);
    resources.push(createResource({...old,id,title:lesson.title,kind,subjects:old&&!Object.keys(priorLearning).length?old.subjects:lesson.tags,provenance:lesson.url?{sourceUrl:lesson.url}:old?.provenance??{},assetIds,createdAt:old?.createdAt??new Date(lesson.createdAt).toISOString(),modifiedAt:new Date().toISOString(),extensions:{...old?.extensions,[LEARNING_NAMESPACE]:{...priorLearning,version:1,lessonId:lesson.id,createdAt:lesson.createdAt,notes:lesson.notes,question:lesson.question,answer:lesson.answer,learned:lesson.learned} as JsonValue}}));
  }
  const kept=new Set(resources.map(r=>r.id));
  const used=new Set(resources.flatMap(r=>r.assetIds));
  const removedAssets=new Set(previous?.catalog.resources.filter(r=>!kept.has(r.id)).flatMap(r=>r.assetIds).filter(id=>!used.has(id))??[]);
  for(const id of removedAssets)content.delete(id);
  const next:CatalogBundle={catalog:{...catalog,revision:createRevision(),modifiedAt:new Date().toISOString(),resources,assets:assets.filter(a=>!removedAssets.has(a.id)),collections:catalog.collections.map(c=>({...c,resourceIds:c.resourceIds.filter(id=>kept.has(id))})),extensions:{...catalog.extensions,[LEARNING_NAMESPACE]:{...extension(catalog.extensions[LEARNING_NAMESPACE]),version:1,practices:library.practices,recommendations:library.recommendations} as unknown as JsonValue}},content};
  return validateBundle(next);
}
export function bundleToLibrary(bundle:CatalogBundle):Library {
  const app=extension(bundle.catalog.extensions[LEARNING_NAMESPACE]);
  if(app.version!==undefined&&app.version!==1)throw new Error('This learning extension version is not supported. The saved catalog has not been changed.');
  const lessons:Lesson[]=bundle.catalog.resources.map(resource=>{
    const data=extension(resource.extensions[LEARNING_NAMESPACE]);
    if(data.version!==undefined&&data.version!==1)throw new Error('This lesson extension version is not supported.');
    const source=resource.provenance.sourceUrl??'';
    let kind:Lesson['kind']=resource.kind==='link'||resource.kind==='video'?resource.kind:'note';
    let attachment:Lesson['attachment'];
    const asset=bundle.catalog.assets.find(a=>a.id===resource.assetIds[0]);const bytes=asset?bundle.content.get(asset.id):undefined;
    if(asset&&bytes&&['document','audio'].includes(resource.kind)){
      try{const info=inspectFile(asset.name,bytes);kind=info.kind;attachment={name:asset.name,mime:info.mime,data:toBase64(bytes)};}catch{ /* The demo does not render unsupported content. It remains in the catalog. */ }
    }
    if((kind==='link'||kind==='video')&&!source)kind='note';
    return {id:typeof data.lessonId==='string'?data.lessonId:resource.id,title:resource.title,kind,url:source,tags:resource.subjects,notes:typeof data.notes==='string'?data.notes:'',question:typeof data.question==='string'?data.question:'',answer:typeof data.answer==='string'?data.answer:'',learned:typeof data.learned==='boolean'?data.learned:false,createdAt:typeof data.createdAt==='string'?data.createdAt:resource.createdAt,...(attachment?{attachment}:{})};
  });
  try{return validateLibrary({version:1,lessons,practices:app.practices??[],recommendations:app.recommendations??false});}
  catch{throw new Error('This catalog exceeds the learning demo’s supported fields or 200-source limit. Use the engine API; the saved library has not been changed.');}
}
export async function openLearningVault(input:unknown,passphrase:string):Promise<{library:Library;bundle:CatalogBundle;session:VaultSession;migrated:boolean}> {
  const envelope=validateAppEnvelope(input);
  if(envelope.format==='open-library-catalog-vault'){
    const opened=await unsealCatalog(envelope,passphrase);
    return {...opened,library:bundleToLibrary(opened.bundle),migrated:false};
  }
  const opened=await unseal(envelope,passphrase);
  return {...opened,bundle:await libraryToBundle(opened.library),migrated:true};
}
export async function sealLearningVault(library:Library,session:VaultSession,previous?:CatalogBundle):Promise<{envelope:CatalogEnvelope;bundle:CatalogBundle}> {
  const bundle=await libraryToBundle(library,previous);
  return {envelope:await sealCatalog(bundle,session),bundle};
}
