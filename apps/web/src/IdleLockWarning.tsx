import {useEffect, useRef} from 'react';

/** Mount only while warning is true. A native dialog stays usable above another modal. */
export function IdleLockWarning({continueStudying, lockNow}: {continueStudying: () => void; lockNow: () => void}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    const previous = document.activeElement;
    dialog.showModal();
    return () => {
      dialog.close();
      if (previous instanceof HTMLElement && previous.isConnected) previous.focus({preventScroll: true});
    };
  }, []);
  return <dialog ref={ref} aria-labelledby="idle-lock-title" aria-describedby="idle-lock-description" onCancel={event => {event.preventDefault(); continueStudying();}}>
    <div className="modal-body">
      <h2 id="idle-lock-title">Still studying?</h2>
      <p id="idle-lock-description">Your room will lock soon. Choose Continue studying for another five minutes. Save before you leave; unsaved edits are lost when the room locks.</p>
      <div className="backup-actions">
        <button className="button" autoFocus onClick={continueStudying}>Continue studying</button>
        <button className="button secondary" onClick={lockNow}>Lock room now</button>
      </div>
    </div>
  </dialog>;
}
