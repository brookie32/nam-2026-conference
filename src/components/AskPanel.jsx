import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { useAsk } from '../lib/askChat.jsx';
import { AskChat } from './AskChat.jsx';
import { Icon } from './Icon.jsx';

/** The floating button. Sits above the tab bar below `lg`, hidden on /ask (the full-page chat). */
export function AskLauncher() {
  const { openAsk, launcherRef } = useAsk();
  const { pathname } = useLocation();
  if (pathname === '/ask') return null;
  return (
    <button
      ref={launcherRef}
      type="button"
      aria-label="Ask ORBIT"
      onClick={() => openAsk()}
      className="fixed bottom-[calc(4rem+env(safe-area-inset-bottom)+0.75rem)] right-4 z-40 flex min-h-11 items-center gap-2 rounded-full bg-gradient-to-br from-violet-500 to-cyan-500 px-4 text-sm font-semibold text-white shadow-lg shadow-violet-900/40 lg:bottom-6"
    >
      <Icon name="chat" className="size-4" /> Ask ORBIT
    </button>
  );
}

const FOCUSABLE = 'button:not([disabled]), textarea, input, a[href], [tabindex]:not([tabindex="-1"])';

/** The chat as a right-hand panel (lg) or a bottom sheet: focus-trapped, closed by Esc or its button. */
export function AskPanel() {
  const { open, closeAsk } = useAsk();
  const ref = useRef(null);

  useEffect(() => {
    if (open) ref.current?.querySelector('[data-testid="ask-input"]')?.focus();
  }, [open]);

  if (!open) return null;

  const onKeyDown = (e) => {
    if (e.key === 'Escape') { e.stopPropagation(); closeAsk(); return; }
    if (e.key !== 'Tab') return;
    const items = [...ref.current.querySelectorAll(FOCUSABLE)];
    if (!items.length) return;
    const first = items[0];
    const last = items.at(-1);
    if (e.shiftKey && (document.activeElement === first || !ref.current.contains(document.activeElement))) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && (document.activeElement === last || !ref.current.contains(document.activeElement))) { e.preventDefault(); first.focus(); }
  };

  return (
    <>
      <div aria-hidden="true" onClick={closeAsk} className="fixed inset-0 z-50 bg-black/50 lg:bg-black/30" />
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label="Ask ORBIT"
        onKeyDown={onKeyDown}
        className="glass fixed inset-x-0 bottom-0 z-50 flex max-h-[85dvh] flex-col rounded-t-2xl border border-hairline bg-surface lg:inset-x-auto lg:inset-y-0 lg:right-0 lg:max-h-none lg:w-[26rem] lg:rounded-none lg:border-y-0 lg:border-r-0"
      >
        <div className="flex items-center justify-between border-b border-hairline px-4 py-3">
          <h2 className="font-display text-lg">Ask ORBIT</h2>
          <button type="button" aria-label="Close" onClick={closeAsk} className="grid size-11 place-items-center rounded-lg text-muted hover:text-ink">
            <Icon name="close" className="size-5" />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
          <AskChat />
        </div>
      </div>
    </>
  );
}
