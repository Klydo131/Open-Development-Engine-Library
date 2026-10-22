# Local catalog search

`searchCatalog(catalog, options)` searches validated resource metadata in memory.
It has no network, database, account or analytics dependency. It does not fetch
source URLs, extract media text, rank relevance, stem words or use an AI model.

```ts
import {searchCatalog} from '@open-learning-rooms/core';

const matches = searchCatalog(catalog, {
  query: 'motion force',
  kind: 'document',
  collectionId: 'physics-shelf',
  subject: 'Science',
  language: 'en-PH'
});
```

## Options and validation

Options must be a plain object containing only the following keys. Omitting the
argument, using `{}`, or setting an optional value to `undefined` leaves that
filter absent. Null values, unknown keys, invalid types, oversized text and
unsupported kinds throw before searching, even for an empty catalog or a missing
collection. The catalog itself must still pass its existing validator.

| Option | Accepted value and bound |
| --- | --- |
| `query` | String, at most 2,000 UTF-16 code units; empty or whitespace-only means no query tokens |
| `kind` | `link`, `document`, `audio`, `video`, `note` or `other` |
| `collectionId` | Existing catalog identifier syntax: 1–128 ASCII characters, initial letter/digit, then letters, digits, `.`, `_`, `:`, `-` |
| `subject` | String, at most 200 UTF-16 code units; whole normalized value match |
| `language` | String, at most 80 UTF-16 code units; whole normalized value match |

Text bounds apply to the original input before normalization and reject NUL.
JavaScript string length counts an astral character such as `😀` as two UTF-16
code units. Empty subject/language filters remain valid and match no stored
values. A syntactically valid but absent collection returns `[]`; malformed
options still throw rather than being hidden by that empty result. Language
values remain descriptive text, with no new registry validation.

This tightens the alpha JavaScript API: `{subjet: 'Science'}` previously ignored
the misspelled filter and could return every resource. It now throws. Callers
should catch validation errors and correct their options rather than treating
them as a successful search with zero matches. Valid existing options and
stored formats are unchanged.

## Matching and results

Comparison applies native Unicode NFKC normalization followed by lowercase.
Every whitespace-separated query token must occur somewhere in the combined
title, description, creators, languages and subjects. The additional filters
are combined with that query. Subject/language matching uses whole normalized
values, not prefixes. Query/subject/language input normalization happens once
per search, rather than once per candidate metadata value.

Results sort deterministically by normalized title and then resource ID. They
are detached resource snapshots; changing a returned object does not mutate the
input catalog. Search normalization does not rewrite stored metadata. It is not
locale-specific collation, transliteration, full Unicode case folding or proof
that different strings mean the same thing in every language.

## Privacy and permission boundary

Matching excludes source/license URLs, rights, timestamps, identifiers, asset
names/bytes and extensions. Private notes in an extension therefore do not
become query terms through this API.

Returned `Resource` objects still include their ordinary metadata and extension
values. Excluding a field from matching does not redact it from results. Search
does not establish consent, ownership, authorization or permission to distribute
a resource. A hosted consumer must enforce its own permissions and select the
fields it is allowed to return. Catalog changes and asset content remain
outside this read-only search operation.

## Evidence and sources

The focused regression tests cover malformed options against empty/populated
catalogs, missing-collection short circuits, exact bounds and boundary+1,
astral text, optional undefined values, Unicode matching, result detachment and
private-field exclusions. Run them with:

```sh
node --experimental-strip-types --test tests/search-options.test.ts tests/catalog.test.ts
```

Checked 22 October 2026 against primary sources:

- [TypeScript: erased types](https://www.typescriptlang.org/docs/handbook/2/basic-types.html#erased-types) explains why annotations do not supply runtime input checks.
- [ECMAScript: String.prototype.normalize](https://tc39.es/ecma262/multipage/text-processing.html#sec-string.prototype.normalize) specifies the native normalization forms.
- [Unicode Normalization Forms](https://www.unicode.org/reports/tr15/#Normalization_Forms) explains compatibility normalization's loss of distinctions. The engine uses it for comparisons while preserving original text.
