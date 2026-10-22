# Engine capacity

The current engine is a bounded snapshot engine for
small private libraries. It is not a large institutional repository, and its
validation caps are not guarantees of device memory use or response time.

## Current enforced limits

The source of truth is `CATALOG_LIMITS` in
[catalog.ts](../packages/core/src/catalog.ts). MiB means 1,048,576 bytes.

| Item | Maximum |
| --- | --- |
| Resources / asset descriptors | 1,000 each |
| Collections | 200 |
| Individual asset | 10 MiB |
| Aggregate raw asset content | 20 MiB |
| Serialized catalog metadata | 16 MiB |
| Portable bundle, encoded as UTF-8 JSON | 31 MiB |
| Individual namespaced extension | 12 MiB, depth 10, 50,000 visited nodes |
| Namespaces in one extensions object | 20 |

These limits apply together. A catalog with 16 MiB of metadata and 20 MiB of
content cannot fit a 31 MiB portable bundle. Use the synchronous public
`estimateCatalogBundleSize(bundle)` API to check the exact canonical portable
size before export, without encoding, copying or hashing asset bytes.

Its result contains `metadataBytes`, raw `contentBytes`, `encodedContentBytes`,
`framingBytes`, total `bundleBytes`, `limitBytes` and `withinLimit`. Framing
includes the outer JSON, content entry IDs and separators. It validates and
canonicalizes catalog metadata and requires exactly the declared content map
with matching byte lengths. The estimate does not verify hashes, detect malware,
reserve browser storage, or guarantee that a caller will not mutate the bundle
after measurement. Export still validates content integrity before returning.

## Validation boundaries

Catalog validation checks declared aggregate size before bundle asset decoding.
Import checks the input string and UTF-8 size before JSON parsing, then validates
the catalog, exact asset map, base64 length and canonical encoding, actual byte
lengths and SHA-256 hashes. The decoded bytes must match their descriptors.
These integrity checks do not identify malware or establish content ownership.

The sample does not scan files for malware. Hashes and file signatures do not
establish that content is safe to open. See
[OWASP's file-upload guidance](https://cheatsheetseries.owasp.org/cheatsheets/File_Upload_Cheat_Sheet.html)
for the separate controls required by a hosted upload service.

[catalog-vault.ts](../packages/core/src/catalog-vault.ts) validates the encrypted
header, fixed KDF parameters, salt, IV, and bounded canonical ciphertext before
password derivation. Decrypted bytes are capped again before bundle import.
Malformed inputs still consume some validation time and memory; bounded input
does not mean zero processing cost. A server accepting uploads needs its own
request limits, concurrency limits, authorization and isolation.

## Why raw content size understates memory use

Base64 represents each group of three bytes with four characters, with padding
for the final partial group. See [RFC 4648, section 4](https://www.rfc-editor.org/rfc/rfc4648.html#section-4).
Twenty MiB divided into two valid 10 MiB assets needs 27,962,032 base64 characters
before JSON and metadata. The exact result depends on each asset's padding.

Export first measures the canonical bundle and rejects a result above the
portable cap before cloning or hashing asset bytes. For a bundle within the cap,
export validates/clones asset bytes, verifies hashes, creates the base64 strings
and complete JSON, and checks the final byte size again. Encryption constructs the
complete UTF-8 plaintext, ciphertext and its base64 string. A 31 MiB bundle plus
the current 16-byte GCM tag produces up to 43,341,164 ciphertext characters,
before the outer envelope. These figures are derived from the current code and
encoding formula, not measurements of resident memory.

The [Web Cryptography specification](https://www.w3.org/TR/webcrypto/#SubtleCrypto-method-encrypt)
also specifies copying input bytes for encrypt/decrypt. Runtime strings, garbage
collection and browser implementation add uncertainty. No fixed peak-memory
multiplier is claimed. Valid large bundles still require potentially substantial
work and temporary allocation. Preflight avoids that work for bundles already
known to exceed the portable cap; it does not make large snapshots inexpensive.

## Decoder allocation

The shared decoder creates one byte array at the decoded length and copies character
codes directly. Asset decoding reuses it; strict canonical encoding, lengths,
hash checks and the vault format remain unchanged.

Whole JSON, plaintext and ciphertext copies still exist. This does not establish
large-library support or a fixed memory requirement on a particular device.

## Portable-size preflight

The exact portable-size preflight now counts UTF-8 metadata, JSON framing,
validated asset IDs and each asset's base64 padding without building encoded
assets. Seven targeted tests compare it with actual export for Unicode,
escaping, canonical metadata, empty content, 1,000 small assets and padding
boundaries. They verify the inclusive 31 MiB export limit and rejection at one
byte above it, before cloning, hashing or base64 encoding. Preflight does not
replace content validation, hashing or atomic storage checks.

No capacity limit or format changed with preflight. Physical-device
capacity and background-termination behavior remain unverified.
