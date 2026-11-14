import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { RELEASE_NOTES, issueUrl } from '../lib/releaseNotes.js';

const FOCUSABLE = 'a[href], button:not([disabled])';

/** Everything that shipped, grouped. Opened with the 9 key from Layout. */
export function ReleaseNotesDialog({ open, onClose }) {
  const ref = useRef(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    if (!open) return;
    const opener = document.activeElement;
    ref.current?.focus();
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e) => {
      if (e.key === 'Escape') { closeRef.current(); return; }
      if (e.key !== 'Tab' || !ref.current) return;
      const els = [...ref.current.querySelectorAll(FOCUSABLE)];
      if (!els.length) return;
      const first = els[0];
      const last = els[els.length - 1];
      const active = document.activeElement;
      if (e.shiftKey && (active === first || active === ref.current)) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && active === last) { e.preventDefault(); first.focus(); }
      else if (!ref.current.contains(active)) { e.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
      if (opener instanceof HTMLElement && opener.isConnected) opener.focus();
    };
  }, [open]);

  if (!open) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[70] grid place-items-end sm:place-items-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="release-notes-title"
      data-testid="release-notes"
    >
      <button type="button" aria-label="Close" onClick={onClose} className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
      <div
        ref={ref}
        tabIndex={-1}
        data-testid="release-notes-panel"
        className="glass relative max-h-[85dvh] w-full max-w-lg animate-rise overflow-y-auto rounded-t-2xl border border-hairline p-6 shadow-2xl shadow-black/70 focus:outline-none sm:rounded-2xl"
      >
        <h2 id="release-notes-title" className="font-display text-xl leading-tight">Release notes</h2>
        <p className="mt-1 text-[13px] text-muted">Everything shipped today. Press 9 or Escape to close.</p>
        {RELEASE_NOTES.map((g) => (
          <section key={g.group} className="mt-5">
            <h3 className="text-[11px] font-bold uppercase tracking-[0.16em] text-faint">{g.group}</h3>
            <ul className="mt-2 space-y-1.5">
              {g.items.map((item) => (
                <li key={item.title} className="text-[13px] leading-snug">
                  {item.title}{' '}
                  {item.issues.map((n) => (
                    <a
                      key={n}
                      href={issueUrl(n)}
                      target="_blank"
                      rel="noreferrer"
                      className="mr-1 font-mono text-[11px] text-violet-300 underline underline-offset-2 hover:text-violet-200"
                    >
                      #{n}
                    </a>
                  ))}
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </div>,
    document.body,
  );
}
