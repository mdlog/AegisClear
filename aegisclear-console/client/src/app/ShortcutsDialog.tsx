// The shortcut list (`?`), with the switch that turns single-key shortcuts off (README §1.1 C8, WCAG 2.1.4).
// A native modal <dialog>: the page behind is inert, Esc closes it, and focus returns to what opened it.
import { useEffect, useRef } from "react";
import { shortcutsCopy as copy } from "@/copy/en";
import { setShortcutsOn, useShortcutsOn } from "./shortcuts";
import styles from "./ShortcutsDialog.module.css";

export function ShortcutsDialog({ onClose }: { onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const opener = useRef<Element | null>(null);
  const on = useShortcutsOn();

  useEffect(() => {
    opener.current ??= document.activeElement;
    const dialog = ref.current!;
    // showModal gives the focus trap and the inert page; without it (older engines, jsdom) the dialog still opens.
    if (typeof dialog.showModal === "function") {
      if (!dialog.open) dialog.showModal();
    } else {
      dialog.setAttribute("open", "");
    }
    dialog.querySelector<HTMLElement>("input, button")?.focus();
    return () => (opener.current as HTMLElement | null)?.focus?.();
  }, []);

  return (
    <dialog
      ref={ref}
      className={styles.dialog}
      aria-labelledby="shortcuts-title"
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onKeyDown={(e) => {
        if (e.key !== "Escape") return;
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose(); // a click on the backdrop
      }}
    >
      <div className={styles.body}>
        <h2 id="shortcuts-title">{copy.title}</h2>
        <dl className={styles.list}>
          {copy.keys.map((k) => (
            <div key={k.key} className={styles.row}>
              <dt><kbd>{k.key}</kbd></dt>
              <dd>
                {k.action}
                {k.scope && <span className="meta"> {k.scope}</span>}
              </dd>
            </div>
          ))}
        </dl>
        <label className={styles.toggle}>
          <input type="checkbox" checked={on} onChange={(e) => setShortcutsOn(e.target.checked)} />
          {copy.toggle}
        </label>
        <p className="meta">{copy.toggleHelp}</p>
        <button type="button" className="btn" onClick={onClose}>{copy.close}</button>
      </div>
    </dialog>
  );
}
