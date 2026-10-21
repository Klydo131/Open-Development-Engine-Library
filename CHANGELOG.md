# Changes

## Unreleased — 22 October 2026

- The project is now **Open Development Engine Library**. Existing package
  names, saved rooms and encrypted backup identifiers remain compatible.
- Catalog search rejects malformed filters with an error instead of silently
  ignoring them. JavaScript integrations should correct unknown fields and
  respect the documented [search option bounds](docs/SEARCH.md).
- Web builds include the project license and dependency notices. Keep these
  files with distributed assets; the bundle check verifies their contents.

The project remains an alpha. These changes do not establish production,
security, accessibility or regulatory certification.
