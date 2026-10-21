# Third-party notices

Open Development Engine Library — inventory reviewed 22 October 2026.

The project's original source is licensed separately in [LICENSE](LICENSE).
This repository distributes its source, dependency declarations and lockfile;
it does not vendor dependency source, installed packages or generated web assets.
Dependencies retain their own licenses. Imported library materials retain their
owners' rights and are not licensed by this document.

## Runtime dependency inventory

This is the complete installed production dependency graph reported by
`pnpm licenses list --prod --json` for the checked lockfile: four direct
dependencies and nine transitive packages. Package versions and the full notices
below were checked against the installed package metadata and license files.
Line endings are normalized; matching notices are reproduced once for the
packages explicitly grouped together.

The inventory is deliberately broader than an individual browser entry:
tree shaking and dynamic loading can omit or defer some packages. The optional
portal's SDK is separate from the provider-neutral engine packages. A package's
presence here does not imply a configured online service or enabled feature.

| Package and exact-version package page | Version | Declared license / additional notice |
| --- | --- | --- |
| [@supabase/auth-js](https://www.npmjs.com/package/@supabase/auth-js/v/2.118.0) | 2.118.0 | MIT |
| [@supabase/functions-js](https://www.npmjs.com/package/@supabase/functions-js/v/2.118.0) | 2.118.0 | MIT |
| [@supabase/phoenix](https://www.npmjs.com/package/@supabase/phoenix/v/0.4.5) | 0.4.5 | MIT |
| [@supabase/postgrest-js](https://www.npmjs.com/package/@supabase/postgrest-js/v/2.118.0) | 2.118.0 | MIT |
| [@supabase/realtime-js](https://www.npmjs.com/package/@supabase/realtime-js/v/2.118.0) | 2.118.0 | MIT |
| [@supabase/storage-js](https://www.npmjs.com/package/@supabase/storage-js/v/2.118.0) | 2.118.0 | MIT |
| [@supabase/supabase-js](https://www.npmjs.com/package/@supabase/supabase-js/v/2.118.0) | 2.118.0 | MIT |
| [iceberg-js](https://www.npmjs.com/package/iceberg-js/v/0.8.1) | 0.8.1 | MIT |
| [lucide-react](https://www.npmjs.com/package/lucide-react/v/1.45.0) | 1.45.0 | ISC; MIT for the listed Feather-derived icons |
| [react](https://www.npmjs.com/package/react/v/19.3.0) | 19.3.0 | MIT |
| [react-dom](https://www.npmjs.com/package/react-dom/v/19.3.0) | 19.3.0 | MIT |
| [scheduler](https://www.npmjs.com/package/scheduler/v/0.28.0) | 0.28.0 | MIT |
| [tslib](https://www.npmjs.com/package/tslib/v/2.8.1) | 2.8.1 | 0BSD |

When distributing the built web application, include this document with the
generated assets and make the notices available to recipients. Preserve license
comments retained by the build. The web build emits this document as
`THIRD_PARTY_NOTICES.md` and the project's license as `LICENSE` beside its
entries. `pnpm check:bundle` rejects missing or changed copies. Keep those files
with the assets when copying or deploying the output directory.

## React, React DOM and Scheduler — MIT

Applies to react 19.3.0, react-dom 19.3.0 and scheduler 0.28.0; their installed
LICENSE files match. [Upstream license](https://github.com/react/react/blob/v19.3.0/LICENSE).

```text
MIT License

Copyright (c) Meta Platforms, Inc. and affiliates.

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

## Supabase JavaScript packages — MIT

Applies to @supabase/supabase-js, @supabase/auth-js, @supabase/functions-js,
@supabase/postgrest-js, @supabase/realtime-js and @supabase/storage-js, all 2.118.0;
their installed LICENSE files match.
[Upstream license](https://github.com/supabase/supabase-js/blob/v2.118.0/LICENSE).

```text
MIT License

Copyright (c) 2020 Supabase

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

## Supabase Phoenix 0.4.5 — MIT

[Upstream license](https://github.com/supabase/phoenix/blob/main/LICENSE.md).
The text below comes from the installed 0.4.5 package, rather than an assumed
current branch revision.

```text
# MIT License

Copyright (c) 2014 Chris McCord

Permission is hereby granted, free of charge, to any person obtaining
a copy of this software and associated documentation files (the
"Software"), to deal in the Software without restriction, including
without limitation the rights to use, copy, modify, merge, publish,
distribute, sublicense, and/or sell copies of the Software, and to
permit persons to whom the Software is furnished to do so, subject to
the following conditions:

The above copyright notice and this permission notice shall be
included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND,
EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND
NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE
LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION
OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION
WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
```

## iceberg-js 0.8.1 — MIT

[Upstream license](https://github.com/supabase/iceberg-js/blob/main/LICENSE).
The text below comes from the installed 0.8.1 package.

```text
MIT License

Copyright (c) 2025 Supabase

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

## Lucide React 1.45.0 — ISC and Feather-derived MIT notices

The package metadata declares ISC. Its shipped LICENSE additionally identifies
Feather-derived icons and supplies their MIT notice. Both are retained in full,
including the upstream list, without assuming which icons a future build uses.
[Upstream license](https://github.com/lucide-icons/lucide/blob/main/LICENSE).

```text
ISC License

Copyright (c) 2026 Lucide Icons and Contributors

Permission to use, copy, modify, and/or distribute this software for any
purpose with or without fee is hereby granted, provided that the above
copyright notice and this permission notice appear in all copies.

THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES
WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF
MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR
ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES
WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN
ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF
OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.

---

The following Lucide icons are derived from the Feather project:

airplay, alert-circle, alert-octagon, alert-triangle, aperture, arrow-down-circle, arrow-down-left, arrow-down-right, arrow-down, arrow-left-circle, arrow-left, arrow-right-circle, arrow-right, arrow-up-circle, arrow-up-left, arrow-up-right, arrow-up, at-sign, calendar, cast, check, chevron-down, chevron-left, chevron-right, chevron-up, chevrons-down, chevrons-left, chevrons-right, chevrons-up, circle, clipboard, clock, code, columns, command, compass, corner-down-left, corner-down-right, corner-left-down, corner-left-up, corner-right-down, corner-right-up, corner-up-left, corner-up-right, crosshair, database, divide-circle, divide-square, dollar-sign, download, external-link, feather, frown, hash, headphones, help-circle, info, italic, key, layout, life-buoy, link-2, link, loader, lock, log-in, log-out, maximize, meh, minimize, minimize-2, minus-circle, minus-square, minus, monitor, moon, more-horizontal, more-vertical, move, music, navigation-2, navigation, octagon, pause-circle, percent, plus-circle, plus-square, plus, power, radio, rss, search, server, share, shopping-bag, sidebar, smartphone, smile, square, table-2, tablet, target, terminal, trash-2, trash, triangle, tv, type, upload, x-circle, x-octagon, x-square, x, zoom-in, zoom-out

The MIT License (MIT) (for the icons listed above)

Copyright (c) 2013-present Cole Bemis

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

## tslib 2.8.1 — 0BSD

[Upstream license](https://github.com/microsoft/tslib/blob/v2.8.1/LICENSE.txt).
The accompanying CopyrightNotice.txt repeats these terms in a comment wrapper.

```text
Copyright (c) Microsoft Corporation.

Permission to use, copy, modify, and/or distribute this software for any
purpose with or without fee is hereby granted.

THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES WITH
REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF MERCHANTABILITY
AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR ANY SPECIAL, DIRECT,
INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES WHATSOEVER RESULTING FROM
LOSS OF USE, DATA OR PROFITS, WHETHER IN AN ACTION OF CONTRACT, NEGLIGENCE OR
OTHER TORTIOUS ACTION, ARISING OUT OF OR IN CONNECTION WITH THE USE OR
PERFORMANCE OF THIS SOFTWARE.
```

## Build-generated helpers

Vite 8.3.3 and its resolved Rolldown 1.2.14 are build dependencies, outside the
13-package production graph. The notices below are also retained for generated
runtime helpers and copied build fragments. This does not imply that the browser
bundle redistributes the entire build toolchain or its native binaries.

### Vite core — MIT

This is the core-license section of the installed Vite LICENSE.md.
[Upstream core license](https://github.com/vitejs/vite/blob/v8.3.3/LICENSE).
Redistribution of Vite itself also requires reviewing its full bundled-dependency
license document; that larger tooling inventory is outside this runtime notice.

```text
MIT License

Copyright (c) 2019-present, VoidZero Inc. and Vite contributors

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

### Rolldown — MIT and accompanying third-party notices

[Upstream license](https://github.com/rolldown/rolldown/blob/v1.2.14/LICENSE) and
[third-party notices](https://github.com/rolldown/rolldown/blob/v1.2.14/THIRD-PARTY-LICENSE).
These are the installed 1.2.14 package's LICENSE and THIRD-PARTY-LICENSE texts.

```text
MIT License

Copyright (c) 2024-present VoidZero Inc. & Contributors

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

end of terms and conditions

The licenses of externally maintained libraries from which parts of the Software is derived are listed [here](https://github.com/rolldown/rolldown/blob/main/THIRD-PARTY-LICENSE).
```

```text
The MIT License (MIT)

Copyright (c) 2017 [these people](https://github.com/rollup/rollup/graphs/contributors)

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

---

MIT License

Copyright (c) 2020 Evan Wallace

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

## Development tools and redistribution boundaries

TypeScript, Playwright, PGlite, axe, linting tools, browser binaries and their
dependencies support development and testing. They are not included in the
production graph above, and this source repository does not redistribute their
installed packages or binaries. Installing them obtains their own license and
notice files; the root project's MIT license does not replace those terms.

If distributing installed dependencies, development containers, test browsers,
tool executables or a modified toolchain, review and retain the corresponding
upstream LICENSE, NOTICE and bundled third-party materials for those artifacts.
This document is not a complete development-tool license inventory, a legal
audit, a trademark permission, or a claim of compliance in every jurisdiction.
Recheck the actual distribution whenever dependencies or build output change.
