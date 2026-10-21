# Selected descriptive metadata

The core package exposes `resourceToDCMI(resource, selectedFields)`. It returns plain JSON whose keys are DCMI term URIs and whose values are arrays of strings. The caller chooses one resource and every included field; an empty selection returns `{}`. The mapper validates the complete resource, creates detached output and performs no storage or network operation.

```ts
import {resourceToDCMI} from '@open-learning-rooms/core';

const metadata = resourceToDCMI(chosenResource, [
  'title', 'creators', 'languages', 'rightsStatement', 'licenseUrl'
]);
```

This is a small descriptive mapping for developers. It is not an RDF or JSON-LD serialization, an archival transfer package, a complete DCMI application profile, or a claim of standards certification. The web application does not automatically publish this output.

| Explicit field | Output term suffix under `http://purl.org/dc/terms/` |
| --- | --- |
| `title` | `title` |
| `description` | `description` |
| `creators` | `creator` |
| `languages` | `language` |
| `subjects` | `subject` |
| `rightsStatement` | `rights` |
| `licenseUrl` | `license` |
| `sourceUrl` | `relation` |

Empty optional values are omitted. Unicode and descriptive language values follow existing catalog validation. The function does not invent controlled vocabulary identifiers or impose a new language-code requirement. Resource IDs, timestamps, asset references, file bytes and extension data are excluded.

Titles, descriptions, creator names, subjects and source URLs can still contain private information. This is field selection, not deidentification. A developer must let the owner review the exact selected text and intended destination before sharing; the mapper itself neither grants consent nor verifies a recipient.

Rights text remains distinct from a license-document URL. Copying metadata does not grant rights to reuse a resource. Missing rights data produces no permission statement. The engine's MIT license does not license items placed in a library.

The stored `provenance.sourceUrl` is mapped to the broad `relation` term. A URL alone does not establish that this resource was derived from another resource (`source`) or document changes in ownership and custody (`provenance`). Catalog timestamps are excluded because they track the catalog record, and need not be dates when the original work was created or modified.

The mapping decisions were checked against the official [DCMI Metadata Terms](https://www.dublincore.org/specifications/dublin-core/dcmi-terms/) on 2026-10-18, especially [relation](https://www.dublincore.org/specifications/dublin-core/dcmi-terms/#relation), [source](https://www.dublincore.org/specifications/dublin-core/dcmi-terms/#source), [provenance](https://www.dublincore.org/specifications/dublin-core/dcmi-terms/#provenance), [rights](https://www.dublincore.org/specifications/dublin-core/dcmi-terms/#rights) and [license](https://www.dublincore.org/specifications/dublin-core/dcmi-terms/#license).
