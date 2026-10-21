# Apple and accessibility testing

The web app targets modern browsers with Web Crypto, IndexedDB, ES2022 and
dialog support. The build currently targets Safari 16 syntax. That build
target is not a complete browser support promise.

Playwright provides desktop WebKit, iPhone and iPad profiles, alongside Chromium
and Firefox. These profiles test browser behavior and viewport settings in the
available environment. They are not physical Apple hardware or a complete
copy of released Safari.

## Automated checks

Build first, then run:

```sh
pnpm exec playwright install
pnpm build
pnpm test:e2e
```

The configured test server is `http://127.0.0.1:4178`.
Use the browser suite to exercise create, add source, recall, practice, lock,
unlock, encrypted export/restore, damaged imports and concurrent tabs.
Use explicit waits for the completed save state before navigating or asserting
persistence. A test should not rely on a fixed encryption duration.

Review narrow viewport reflow, accessible names, focus behavior, keyboard
operation and contrast. Automated accessibility results cover the rendered
states tested; passing them is not a WCAG certification.

## Physical-device release evidence

Physical Apple hardware is **unverified**. Before claiming support, record
device model, OS version, Safari version where available, date and result for:

| Surface | Checks |
| --- | --- |
| iPhone Safari | Portrait/landscape, software keyboard, labels, touch targets, scroll and zoom |
| iPad Safari | Split view, portrait/landscape, touch and hardware keyboard, dialog focus |
| macOS Safari | Keyboard-only flow, focus restoration, downloads, audio and multiple tabs |
| VoiceOver | Landmarks, labels, dialog entry/exit, status and error announcements |
| Files integration | Import/export JSON backup, PDF and supported audio; open saved backup again |
| Storage | Normal browsing, private browsing behavior, quota errors, clearing site data |
| Lifecycle | Five-minute idle lock, background/foreground, page hide, reload and lock during work |

Repeat the saved-state checks after a browser restart. Confirm restored notes,
collection assignments and practice progress survive. Keep a separate backup
before clearing site data.

Audio format support depends on the browser and the actual codec; a filename
or file-signature check cannot guarantee playback. Document unsupported media
rather than silently uploading it for conversion.

The web app currently provides no tested native experience for Apple Watch,
Apple TV or Apple Vision Pro. Installation as a native app or an offline PWA
has not been established. Define and test those targets separately before
advertising support for them.

Automated coverage includes desktop Chromium/Firefox/WebKit, iPhone/iPad-sized WebKit, Android-sized Chromium and Chromium tablet layouts. These are browser/emulation checks, not physical-device certification. See docs/TESTING.md.
