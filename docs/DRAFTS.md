# Unsaved edits

The draft guard protects supported navigation; it is not draft
recovery or guaranteed browser-close protection.

## What the app does

Learning notes, recall fields, catalog details, new collections, new-source
forms and practice reflections are tracked while their forms remain open.
Switching rooms, leaving a lesson, selecting another catalog source or closing
a new-source dialog asks before discarding edits. Declining keeps the form and
its text. Choosing the same screen/source does not ask unnecessarily.

A successful save records only the values submitted for that save. If you type
more while encryption/storage is running, those newer edits remain unsaved.
Failed saves do not clear the warning. Saving one form does not mark another
form clean. Reverting a form to its saved values removes its warning.

The guard does not automatically save text, upload it, or create plaintext
localStorage/sessionStorage copies. Browser refresh/close warnings are enabled
only while tracked changes exist. Password/search forms are excluded. A source
file selection is compared by identity and metadata without reading its bytes.

Security locks always win: explicit locking, inactivity locking and pagehide
clear the private view and draft tracking without a discard prompt. Save before
locking. A save already committing may finish, but it cannot reopen the room.
Browser or device termination can discard unsaved edits without any event.

## Browser behavior

| Source | Finding relevant to this implementation |
| --- | --- |
| [MDN: beforeunload](https://developer.mozilla.org/en-US/docs/Web/API/Window/beforeunload_event) | Exit warnings depend on prior interaction and browser policy. Browser text is not customizable. Mobile termination may fire no event. Permanent listeners also affect Firefox's back/forward cache; attach only while dirty. |
| [WHATWG HTML: unloading documents](https://html.spec.whatwg.org/multipage/browsing-the-web.html#unloading-documents) | Prompting is part of browser-controlled navigation policy. A handler cannot provide a universal guarantee that a warning will appear. |
| [MDN: pagehide](https://developer.mozilla.org/en-US/docs/Web/API/Window/pagehide_event) | Page hiding works with back/forward caching, but mobile termination may omit it. It remains a privacy boundary when delivered, not a recovery mechanism. |
| [WebKit: storage policy](https://webkit.org/blog/14403/updates-to-storage-policy/) | Browser storage has quotas and eviction policies; persistence is an API/policy decision. Installed web-app presentation does not make stored data an independent backup. |
| [MDN: quotas and eviction](https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria) | Browser-managed storage can be constrained, denied, cleared or evicted. A persistence grant and a separate exported backup solve different problems. |

## Engineering boundary

The generic catalog and encrypted format are unchanged. Draft tracking belongs
to the web consumer because it depends on DOM forms, navigation and session
lifecycle. `drafts.ts` uses per-control baselines; `useDraftGuard.ts` handles
registration, supported exit warnings and local discard decisions. The engine
remains usable without React or a browser DOM.

New and removed catalog membership controls reconcile independently of edited
text. Save completion uses the captured submitted snapshot rather than reading
whatever values happen to exist after an async save. Detached forms and locks
retire their tracking. Snapshots stay in process memory; JavaScript cannot promise
immediate memory zeroization after references are released.

Draft observation uses document bubble listeners after React's root handlers
copy controlled input into state. This preserves
[synchronous controlled-input updates](https://react.dev/reference/react-dom/components/input#my-text-input-doesnt-update-when-i-type-into-it).
Password controls remain excluded from tracking snapshots.

## Verification limits

Tests exercise discarded/cancelled navigation, value reversion, same-name form
controls, dynamic memberships, file identity, independent forms, save races,
failed/stale saves, dialog close/Escape, reflection changes and lock/pagehide.
Synthetic browser checks compare persisted ciphertext before/after typing to
verify that draft tracking does not autosave. Browser-profile results do not
establish physical iPhone/iPad/Android or VoiceOver support.

Before public release, exercise actual browser-close, application switching,
background termination, back/forward cache, software keyboards, accessibility
and storage pressure on supported physical devices. Keep separate encrypted
backups. No universal device, security or legal certification is claimed.
