# Recovery and passphrase control

In **Your library**, choose **Change passphrase**. Enter the current passphrase,
choose a different passphrase of 12–512 characters, and confirm it. Successful
saving uses fresh encryption and preserves your sources, collections, files,
notes and practice history. Export a fresh encrypted backup afterward.

Previously downloaded backups still need their original passphrases. Keep those
passphrases while you need the backups. An older v1 recovery copy retained in this
browser is removed in the same transaction as a successful passphrase change;
export it first if you need it. No account reset or forgotten-passphrase recovery
service is introduced.

A stale tab cannot change the passphrase over newer saved work. Reopen the latest
copy first. If an unsaved recovery backup is offered, export it before locking
and reopening; changing the saved passphrase does not merge unsaved work.

## Check a backup before restoring

Choose **Check a backup** in Your library, or select a backup on the entry page.
Enter its passphrase and choose **Check backup only**. Enter/Return also checks
rather than restoring. A successful check reports source, collection and file
counts. It leaves the current room and saved library unchanged. This can help
verify a saved backup before moving browsers or clearing browser data.

Restoring is a separate action: enter the backup passphrase again and choose
**Unlock & restore**. Existing saved data requires confirmation before replacement.
A check validates authenticated decryption, structure, bounded references and
saved asset hashes. It is not a malware scan or a media-playback guarantee.

Locking clears private dialogs and results. Delayed decryption cannot reopen a
locked room. An IndexedDB write already committing may finish during a lock;
its new private session is never reopened automatically. If a passphrase change
completed, use the new passphrase next time.

## Engine integration

```ts
import {rekeyCatalog} from '@open-learning-rooms/core';

const previous = await store.read();
if (!previous) throw new Error('No saved catalog.');
const prepared = await rekeyCatalog(previous, currentPassphrase, newPassphrase);
await store.write(prepared.envelope, previous.revision);
// Only now adopt prepared.session and prepared.bundle in the application.
```

The helper does not mutate storage or the original envelope. Invalid replacement
passphrases fail before key derivation. All catalog fields, extensions, asset
bytes and identifiers remain; only revision and modification time change. An
application must also guard its session lifecycle and decide how to retire local
copies. The example's legacy bridge migrates in memory before the same conditional
commit, without a preliminary storage save.

## Cryptographic boundary

See [OWASP Cryptographic Storage guidance](https://cheatsheetseries.owasp.org/cheatsheets/Cryptographic_Storage_Cheat_Sheet.html)
and [OWASP Key Management guidance](https://cheatsheetseries.owasp.org/cheatsheets/Key_Management_Cheat_Sheet).
These sources inform the distinction between replacing active encryption and
retaining access to older encrypted copies. Our bounded single-user design uses
full re-encryption with a fresh salt/key rather than introducing a key server.
This is an implementation choice, not an independent audit or certification.

Browser storage can be cleared or evicted. Backups remain necessary. Physical
Apple/Android devices, assistive technologies and deployment-specific privacy
and legal responsibilities remain separate release checks.
