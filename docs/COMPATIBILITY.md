# Browser and platform compatibility

The application uses web standards rather than an OS-specific client. Target
current maintained Chrome/Edge, Firefox and Safari on desktop, mobile and tablet
systems, including Windows, macOS, Linux, ChromeOS, iOS/iPadOS and Android.
This is a target and test policy, not a guarantee for every browser, OS version,
embedded webview, wearable or television.

The build targets Safari 16 syntax. Runtime features include ES2022, Web Crypto,
IndexedDB, File/Blob APIs and native dialogs. Serve over HTTPS; localhost is for
development. Syntax targeting does not polyfill missing APIs. Browser storage,
permissions, private browsing, codecs and file-handling behavior vary. Keep a
recoverable backup and test these behaviors on the intended supported devices.
The client requires no Python, Rust, Java or Node installation.

The automated browser suite covers desktop Chromium, Firefox and WebKit;
iPhone/iPad-sized WebKit; Android-sized Chromium; and a Chromium tablet layout.
Keyboard, responsive layout, persistence and accessibility checks form part of
the release gates. Emulation does not certify physical devices, OS-specific
Safari behavior or assistive technology. See [testing](TESTING.md) and the
[physical Apple device checklist](APPLE-TESTING.md).

The separate maintenance-tooling matrix tests the runtime-policy contract on
Linux, Windows and macOS for both supported Node minimums. It does not certify
the entire backend on every host. Backend operators must additionally verify
their PostgreSQL, identity, storage, scanner and deployment integrations.
