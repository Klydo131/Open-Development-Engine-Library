import {validateResource, type Resource} from './catalog.ts';

export type DCMIField = 'title' | 'description' | 'creators' | 'languages' | 'subjects' | 'rightsStatement' | 'licenseUrl' | 'sourceUrl';
export type DCMITerm = `http://purl.org/dc/terms/${'title' | 'description' | 'creator' | 'language' | 'subject' | 'rights' | 'license' | 'relation'}`;
export type DCMIMetadata = Partial<Record<DCMITerm, string[]>>;
const allowed: readonly DCMIField[] = ['title', 'description', 'creators', 'languages', 'subjects', 'rightsStatement', 'licenseUrl', 'sourceUrl'];

/** Selected descriptive metadata only. This is plain JSON, not RDF or deidentification.
 * Source URLs express a relation; they do not establish derivation or custody history.
 */
export function resourceToDCMI(value: Resource, selectedFields: readonly DCMIField[]): DCMIMetadata {
  if (!Array.isArray(selectedFields) || selectedFields.length > allowed.length
    || Array.from(selectedFields).some(field => !allowed.includes(field)) || new Set(selectedFields).size !== selectedFields.length) {
    throw new Error('Choose distinct supported DCMI metadata fields.');
  }
  const resource = validateResource(value);
  const result: DCMIMetadata = {};
  const put = (term: DCMITerm, values: string[]) => { if (values.length) result[term] = values.slice(); };
  for (const field of selectedFields) {
    switch (field) {
      case 'title': put('http://purl.org/dc/terms/title', [resource.title]); break;
      case 'description': if (resource.description.trim()) put('http://purl.org/dc/terms/description', [resource.description]); break;
      case 'creators': put('http://purl.org/dc/terms/creator', resource.creators); break;
      case 'languages': put('http://purl.org/dc/terms/language', resource.languages); break;
      case 'subjects': put('http://purl.org/dc/terms/subject', resource.subjects); break;
      case 'rightsStatement': if (resource.rights.statement.trim()) put('http://purl.org/dc/terms/rights', [resource.rights.statement]); break;
      case 'licenseUrl': if (resource.rights.licenseUrl) put('http://purl.org/dc/terms/license', [resource.rights.licenseUrl]); break;
      case 'sourceUrl': if (resource.provenance.sourceUrl) put('http://purl.org/dc/terms/relation', [resource.provenance.sourceUrl]); break;
    }
  }
  return result;
}
