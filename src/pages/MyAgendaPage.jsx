import { useEffect, useRef, useState } from 'react';
import { useConference, useFetch } from '../lib/store.jsx';
import * as api from '../lib/api.js';
import { agendaDays, focusSession, orderDays } from '../lib/agenda.js';
import { hasEnded, toMinutes } from '../lib/clock.js';
import { dayLabel, plural } from '../lib/format.js';
import { useDocumentTitle } from '../lib/useDocumentTitle.js';
import { SessionCard } from '../components/SessionCard.jsx';
import { Button, EmptyState, ErrorState, SectionHeader, Skeleton, cx } from '../components/ui.jsx';
import { Icon } from '../components/Icon.jsx';

const hours = (minutes) => `${+(minutes / 60).toFixed(1)}h`;

/** "Position N of M" for a waitlist place: the live store count if there is one, else the seat-state endpoint. */
function WaitlistPosition({ session }) {
  const { seatsFor, currentUserId } = useConference();
  const live = seatsFor(session.id);
  const [fetched, setFetched] = useState(null);
  const known = live?.waitlistPosition != null;
  useEffect(() => {
    if (known) return undefined;
    let active = true;
    api.getSeatState(currentUserId, session.id).then((s) => active && setFetched(s)).catch(() => {});
    return () => { active = false; };
  }, [known, currentUserId, session.id]);
  const state = known ? live : fetched;
  if (state?.waitlistPosition == null) return null;
  return (
    <p className="px-1 pt-1 text-xs font-semibold text-amber-300" data-testid="agenda-position">
      Position {state.waitlistPosition} of {state.waitlistCount}
    </p>
  );
}

function AgendaDay({ day, clock }) {
  const clashing = new Set(day.conflicts.flatMap((c) => c.sessionIds));
  const focus = day.date === clock.day ? focusSession(day, clock.time) : null;
  const running = focus && toMinutes(focus.startsAt) <= toMinutes(clock.time);

  return (
    <section data-testid="agenda-day" data-date={day.date} className="space-y-3">
      <header className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <h2 className="font-display text-xl">{dayLabel(day.date)}</h2>
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
          <span data-testid="agenda-day-hours" className="font-semibold text-ink">{hours(day.totalMinutes)} booked</span>
          {day.waitlistedMinutes > 0 && (
            <span data-testid="agenda-day-waitlisted" className="font-semibold text-amber-300">
              +{hours(day.waitlistedMinutes)} waitlisted
            </span>
          )}
          {day.conflicts.length > 0 && (
            <span data-testid="agenda-day-clashes" className="inline-flex items-center gap-1 font-semibold text-rose-300">
              <Icon name="alert" className="size-3" /> {plural(day.conflicts.length, 'clash', 'clashes')}
            </span>
          )}
          <span data-testid="agenda-day-venues">{day.venuesVisited.join(' · ')}</span>
        </p>
      </header>
      <ul className="space-y-2">
        {day.sessions.map((s) => {
          const confirmed = s.reservation === 'confirmed';
          const isFocus = focus?.id === s.id;
          return (
            <li key={s.id} data-testid="agenda-row" data-session-id={s.id}
              data-clash={clashing.has(s.id) ? 'true' : undefined}
              className={cx('rounded-xl', clashing.has(s.id) && 'ring-1 ring-rose-400/60',
                isFocus && 'ring-2 ring-violet-400', !confirmed && 'border border-dashed border-amber-400/40')}>
              {isFocus && (
                <p className="px-3 pt-2 text-[11px] font-semibold uppercase tracking-wide text-violet-300"
                  data-testid="agenda-focus" data-session-id={s.id}>
                  {running ? 'Happening now' : 'Up next'}
                </p>
              )}
              <SessionCard session={s} variant="row"
                attendance={confirmed ? { ended: hasEnded(s, clock), checkedIn: s.checkedIn, myStars: s.myStars } : null} />
              {!confirmed && <WaitlistPosition session={s} />}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

export function MyAgendaPage() {
  useDocumentTitle('My Agenda');
  const { currentUserId, reservationFor, clock } = useConference();
  const { data, loading, error, reload } = useFetch(() => api.getSchedule(currentUserId), [currentUserId]);
  const held = useRef(false);

  const days = data ? orderDays(agendaDays(data.days, reservationFor), clock.day) : [];
  if (days.length) held.current = true;

  let body;
  if (error) body = <ErrorState error={error} onRetry={reload} />;
  else if (loading || !data || (!days.length && data.days.length && !held.current)) {
    // The store fills in my reservations after the payload arrives; an empty page now would flash.
    body = <div className="space-y-3"><Skeleton className="h-24" /><Skeleton className="h-24" /></div>;
  } else if (!days.length) {
    body = (
      <div data-testid="agenda-empty">
        <EmptyState icon="ticket" title="Nothing on your agenda yet"
          description="Add sessions from the schedule and they will show up here, day by day."
          action={<Button to="/schedule" size="sm" variant="primary">Browse the schedule</Button>} />
      </div>
    );
  } else {
    body = <div className="space-y-8">{days.map((d) => <AgendaDay key={d.date} day={d} clock={clock} />)}</div>;
  }

  return (
    <div className="space-y-8">
      <SectionHeader eyebrow="Your conference" title="My Agenda" />
      {body}
    </div>
  );
}
