import { useEffect, useState } from 'react';
import { useConference } from '../lib/store.jsx';
import * as api from '../lib/api.js';
import { ROLES, MIN_PICKS } from '../lib/roles.js';
import { Button, cx } from './ui.jsx';

const skipKey = (id) => `orbit:welcome-skipped:${id}`;
const skipped = (id) => {
  try { return !!window.localStorage.getItem(skipKey(id)); } catch { return false; }
};

function Choice({ testId, on, onClick, className, children }) {
  return (
    <button type="button" data-testid={testId} aria-pressed={on} onClick={onClick}
      className={cx('min-w-0 border text-left transition-colors',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-400',
        on ? 'border-violet-400/60 bg-violet-400/20 text-violet-100'
          : 'border-hairline bg-overlay/60 text-muted hover:text-ink', className)}>
      {children}
    </button>
  );
}

/**
 * Home's first-visit welcome: pick a role (which pre-selects three topics) and topics, then Save.
 * Nothing while loading, once the attendee has any picked track or topic, or after Skip
 * (remembered per attendee in localStorage). `onSaved` lets Home refresh Recommended for you.
 */
export function WelcomePanel({ onSaved }) {
  const { currentUserId, tracks = [], tags = [] } = useConference();
  const topics = tags.filter((t) => t.kind === 'topic');
  const [fresh, setFresh] = useState(false);       // loaded, and has no picks
  const [role, setRole] = useState(null);
  const [picked, setPicked] = useState({ tracks: [], tags: [] });
  const [saving, setSaving] = useState(false);
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    let active = true;
    setFresh(false); setRole(null); setPicked({ tracks: [], tags: [] }); setHidden(skipped(currentUserId));
    api.getInterests(currentUserId)
      .then((i) => { if (active) setFresh(!i.tracks.length && !i.tags.length); })
      .catch(() => {});
    return () => { active = false; };
  }, [currentUserId]);

  if (!fresh || hidden) return null;

  const total = picked.tracks.length + picked.tags.length;
  const toggle = (kind, slug) => setPicked((p) => ({
    ...p, [kind]: p[kind].includes(slug) ? p[kind].filter((s) => s !== slug) : [...p[kind], slug],
  }));
  const choose = (r) => {
    setRole(r.slug);
    setPicked((p) => ({ ...p, tags: r.topics.filter((s) => topics.some((t) => t.slug === s)) }));
  };
  const skip = () => {
    try { window.localStorage.setItem(skipKey(currentUserId), '1'); } catch { /* storage blocked */ }
    setHidden(true);
  };
  const save = async () => {
    setSaving(true);
    try {
      await api.saveInterests(currentUserId, { tracks: picked.tracks, tags: picked.tags, role });
      setFresh(false);
      onSaved?.();
    } catch { setSaving(false); }
  };

  return (
    <section className="card space-y-4 p-5" data-testid="welcome-panel" aria-label="Welcome">
      <div>
        <h2 className="font-mono text-[10px] uppercase tracking-[0.16em] text-faint">Welcome to ORBIT</h2>
        <p className="mt-1 text-[13px] text-muted">Tell us a little and we will suggest talks.</p>
      </div>
      <div>
        <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-faint">What's your role?</h3>
        <div className="flex flex-col gap-2 sm:flex-row">
          {ROLES.map((r) => (
            <Choice key={r.slug} testId="welcome-role" on={role === r.slug} onClick={() => choose(r)}
              className="rounded-lg px-3 py-2 sm:flex-1">
              <span className="block text-sm font-semibold">{r.name}</span>
              <span className="block text-xs">{r.blurb}</span>
            </Choice>
          ))}
        </div>
      </div>
      <div>
        <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-faint">Pick {MIN_PICKS} or more topics</h3>
        <div className="flex flex-wrap gap-2">
          {tracks.map((t) => (
            <Choice key={t.slug} testId="welcome-chip" on={picked.tracks.includes(t.slug)}
              onClick={() => toggle('tracks', t.slug)} className="rounded-full px-3 py-1.5 text-xs font-medium">{t.name}</Choice>
          ))}
          {topics.map((t) => (
            <Choice key={t.slug} testId="welcome-chip" on={picked.tags.includes(t.slug)}
              onClick={() => toggle('tags', t.slug)} className="rounded-full px-3 py-1.5 text-xs font-medium">{t.name}</Choice>
          ))}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="primary" data-testid="welcome-save" disabled={total < MIN_PICKS || saving} onClick={save}>Save</Button>
        <Button variant="ghost" data-testid="welcome-skip" onClick={skip}>Skip for now</Button>
      </div>
    </section>
  );
}
