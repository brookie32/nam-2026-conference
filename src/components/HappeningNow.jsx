import { Link } from 'react-router-dom';
import { useConference, useFetch } from '../lib/store.jsx';
import * as api from '../lib/api.js';
import { relativeDate } from '../lib/format.js';
import { LiveBadge } from './LiveBadge.jsx';
import { Icon } from './Icon.jsx';
import { cx } from './ui.jsx';

/** Why nothing is running, from the day's bounds rather than array lengths. */
export function emptyMessage({ time, dayStartsAt, dayEndsAt, nextSlot }) {
  if (dayStartsAt && time < dayStartsAt) return `Nothing yet — the first session starts at ${dayStartsAt}.`;
  if (dayEndsAt && time >= dayEndsAt) return 'The day is over — nothing is running.';
  if (nextSlot) return `Between sessions — next starts at ${nextSlot}.`;
  return 'Nothing is running right now.';
}

/**
 * One announcement, and only one that has actually been posted: pinned first,
 * then newest, filtered by `postedAt <= clock`.
 */
function LatestAnnouncement() {
  const { clock, venueById } = useConference();
  const { data } = useFetch(api.getAnnouncements, []);

  const nowIso = `${clock.day}T${clock.time}:00Z`;
  const live = (data ?? [])
    .filter((a) => a.postedAt <= nowIso)
    .sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.postedAt.localeCompare(a.postedAt));

  const item = live[0];
  if (!item) return null;

  const tone = {
    warning: 'border-amber-500/25 bg-amber-500/[0.07] text-amber-200',
    success: 'border-emerald-500/25 bg-emerald-500/[0.07] text-emerald-200',
    info: 'border-sky-500/25 bg-sky-500/[0.07] text-sky-200',
  }[item.kind] ?? 'border-sky-500/25 bg-sky-500/[0.07] text-sky-200';

  return (
    <div className={cx('flex gap-3 rounded-xl border p-3', tone)} data-testid="announcements">
      <Icon name={item.kind === 'warning' ? 'alert' : 'info'} className="mt-0.5 size-4 shrink-0" />
      <div className="min-w-0">
        <div className="flex flex-wrap items-baseline gap-2">
          <h3 className="text-sm font-semibold">{item.title}</h3>
          <span className="text-[11px] text-faint">
            {relativeDate(item.postedAt, clock)}
            {item.venueId && ` · ${venueById[item.venueId]?.shortName}`}
          </span>
        </div>
        <p className="mt-1 text-[13px] leading-relaxed text-muted">{item.body}</p>
      </div>
    </div>
  );
}

/** What is running at the clock's moment, plus the latest announcement. */
export function HappeningNow() {
  const { clock } = useConference();
  const live = useFetch(() => api.getLive(clock), [clock.day, clock.time]);

  // The clock refetches every tick; keep showing the last answer meanwhile.
  const data = live.data;

  return (
    <section className="card space-y-3 p-5" data-testid="happening-now">
      <h2 className="font-mono text-[10px] uppercase tracking-[0.16em] text-faint">Happening now</h2>

      {data && data.happeningNow.length > 0 && (
        <ul className="space-y-2">
          {data.happeningNow.map((s) => (
            <li key={s.id} data-testid="happening-now-session" className="flex items-center gap-3">
              <div className="min-w-0 flex-1">
                <Link to={`/sessions/${s.id}`} className="block truncate font-semibold hover:text-violet-200">
                  {s.title}
                </Link>
                <p className="truncate text-[13px] text-muted">{s.room.name} · {s.venue.shortName}</p>
              </div>
              <LiveBadge className="shrink-0" />
            </li>
          ))}
        </ul>
      )}

      {data && data.happeningNow.length === 0 && (
        <div className="text-[13px] text-muted" data-testid="happening-now-empty">
          <p>{emptyMessage({ ...data, time: clock.time })}</p>
          <Link to={`/schedule?day=${clock.day}`} className="mt-1 inline-block font-semibold text-violet-300 hover:text-violet-200">
            Browse today&apos;s schedule
          </Link>
        </div>
      )}

      <LatestAnnouncement />
    </section>
  );
}
