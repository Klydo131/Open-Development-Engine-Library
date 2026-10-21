import {createRevision,type CatalogBundle,type JsonValue} from '../../../packages/core/src/index.ts';
import {EDUCATION_EXTENSION,emptyEducation,validateEducation,type EducationState} from '../../../packages/education/src/index.ts';

export function readEducation(bundle:CatalogBundle):EducationState{
 const value=bundle.catalog.extensions[EDUCATION_EXTENSION];
 return value===undefined?emptyEducation():validateEducation(value);
}
export function withEducation(bundle:CatalogBundle,state:EducationState):CatalogBundle{
 const next=validateEducation(state);
 return {...bundle,catalog:{...bundle.catalog,revision:createRevision(),modifiedAt:new Date().toISOString(),extensions:{...bundle.catalog.extensions,[EDUCATION_EXTENSION]:next as unknown as JsonValue}}};
}
