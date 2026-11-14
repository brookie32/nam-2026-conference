import { Link } from 'react-router-dom';
import { useConference, useFetch } from '../lib/store.jsx';
import * as api from '../lib/api.js';
import { time as fmtTime } from '../lib/format.js';

/**
 * Home's "Recommended for you": the first 3 of what /for-you lists, same call
 * and deps as ForYouPage so the two agree. Nothing while loading, on error or
 * with nothing to recommend; an invitation when the endpoint says needsInterests.
 * `picksVersion` bumps when Home's welcome saves picks, so the strip refetches.
 */
export function RecommendedStrip({ picksVersion = 0 }) {
  const { currentUserId, clock, reservations } = useConference();
  const { data } = useFetch(
    () => api.getRecommendations(currentUserId, { day: clock.day, time: clock.time }),
    [currentUserId, clock.day, clock.time, reservations, picksVersion],
  );
  if (!data) return null;

  if (data.needsInterests) {
    return (
      <section className="card space-y-1 p-5" data-testid="recs-strip" aria-label="Recommended for you">
        <h2 className="font-mono text-[10px] uppercase tracking-[0.16em] text-faint">Recommended for you</h2>
        <p className="text-[13px] text-muted">
          Tell us what you like and we will suggest talks.{' '}
          <Link to="/for-you" data-testid="recs-invite" className="font-semibold text-violet-300 hover:text-violet-200">
            Pick your interests
          </Link>
        </p>
      </section>
    );
  }

  const items = (data.items ?? []).slice(0, 3);
  if (!items.length) return null;

  return (
    <section className="card space-y-3 p-5" data-testid="recs-strip" aria-label="Recommended for you">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="font-mono text-[10px] uppercase tracking-[0.16em] text-faint">Recommended for you</h2>
        <Link to="/for-you" data-testid="recs-see-all" className="text-xs font-semibold text-violet-300 hover:text-violet-200">
          See all
        </Link>
      </div>
      <ul className="space-y-2">
        {items.map(({ session, reasons }) => (
          <li key={session.id} data-testid="recs-item" data-session-id={session.id} className="min-w-0">
            <Link to={`/sessions/${session.id}`} className="block min-w-0 hover:text-violet-200">
              <span className="block truncate font-semibold">{session.title}</span>
              <span className="block truncate text-[13px] text-muted">
                {fmtTime(session.startsAt)} · {session.room?.name}
              </span>
              <span data-testid="recs-reason" className="block truncate text-xs font-medium text-violet-300">
                {reasons.join(' · ')}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
