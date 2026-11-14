import { useCallback, useEffect, useRef, useState } from 'react';
import { useConference } from '../lib/store.jsx';
import * as api from '../lib/api.js';
import { useDocumentTitle } from '../lib/useDocumentTitle.js';
import { SessionCard } from '../components/SessionCard.jsx';
import { EmptyState, ErrorState, SectionHeader, Skeleton, cx } from '../components/ui.jsx';

const NONE = { tracks: [], tags: [], role: null };

function InterestChip({ label, on, onClick }) {
  return (
    <button type="button" data-testid="foryou-interest" aria-pressed={on} onClick={onClick}
      className={cx('rounded-full border px-3 py-1.5 text-xs font-medium transition-colors',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-400',
        on ? 'border-violet-400/60 bg-violet-400/20 text-violet-100'
          : 'border-hairline bg-overlay/60 text-muted hover:text-ink')}>
      {label}
    </button>
  );
}

export function ForYouPage() {
  useDocumentTitle('For you');
  const { currentUserId, clock, reservations, tracks = [], tags = [] } = useConference();
  const topics = tags.filter((t) => t.kind === 'topic');

  const [interests, setInterests] = useState(NONE);
  const [loaded, setLoaded] = useState(false);
  const [saved, setSaved] = useState(0);        // bumps once the server has the latest picks
  const [recs, setRecs] = useState(null);
  const [error, setError] = useState(null);
  const saving = useRef(Promise.resolve());     // picks are sent in the order they were made

  useEffect(() => {
    let active = true;
    setLoaded(false);
    setRecs(null);
    api.getInterests(currentUserId)
      .then((i) => { if (active) { setInterests(i); setLoaded(true); } })
      .catch((e) => active && setError(e));
    return () => { active = false; };
  }, [currentUserId]);

  // Again on a new attendee, a moving clock, a seat taken or given back, or new picks.
  useEffect(() => {
    if (!loaded) return undefined;
    let active = true;
    api.getRecommendations(currentUserId, { day: clock.day, time: clock.time })
      .then((r) => { if (active) { setRecs(r); setError(null); } })
      .catch((e) => active && setError(e));
    return () => { active = false; };
  }, [loaded, currentUserId, clock.day, clock.time, reservations, saved]);

  const toggle = useCallback((kind, slug) => {
    const next = { ...interests, [kind]: interests[kind].includes(slug)
      ? interests[kind].filter((s) => s !== slug) : [...interests[kind], slug] };
    setInterests(next);
    saving.current = saving.current
      .then(() => api.saveInterests(currentUserId, next))
      .then(() => setSaved((n) => n + 1))
      .catch(() => api.getInterests(currentUserId).then(setInterests).catch(() => {}));
  }, [interests, currentUserId]);

  let body;
  if (error && !recs) body = <ErrorState error={error} onRetry={() => setSaved((n) => n + 1)} />;
  else if (!recs) body = <div className="space-y-3"><Skeleton className="h-24" /><Skeleton className="h-24" /></div>;
  else if (recs.needsInterests) {
    body = (
      <div data-testid="foryou-empty">
        <EmptyState icon="sparkle" title="Pick your interests first"
          description="Tick a few tracks or topics above and we will suggest talks you can still get into." />
      </div>
    );
  } else if (!recs.items.length) {
    body = <EmptyState icon="search" title="Nothing open matches yet"
      description="Every talk that fits is full, over, or already on your agenda. Try a few more interests." />;
  } else {
    body = (
      <ul className="space-y-2">
        {recs.items.map(({ session, reasons }) => (
          <li key={session.id} data-testid="foryou-item" data-session-id={session.id}>
            <SessionCard session={session} variant="row" />
            <p data-testid="foryou-reason" className="px-1 pt-1 text-xs font-medium text-violet-300">
              {reasons.join(' · ')}
            </p>
          </li>
        ))}
      </ul>
    );
  }

  return (
    <div className="space-y-8">
      <SectionHeader eyebrow="Recommended" title="For you"
        description="Talks you can still get into, picked from what you tell us you like and the speakers you follow." />

      <section aria-label="Your interests" className="space-y-4">
        <div>
          <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-faint">Tracks</h3>
          <div className="flex flex-wrap gap-2">
            {tracks.map((t) => (
              <InterestChip key={t.slug} label={t.name} on={interests.tracks.includes(t.slug)}
                onClick={() => toggle('tracks', t.slug)} />
            ))}
          </div>
        </div>
        <div>
          <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-faint">Topics</h3>
          <div className="flex flex-wrap gap-2">
            {topics.map((t) => (
              <InterestChip key={t.slug} label={t.name} on={interests.tags.includes(t.slug)}
                onClick={() => toggle('tags', t.slug)} />
            ))}
          </div>
        </div>
      </section>

      {body}
    </div>
  );
}
