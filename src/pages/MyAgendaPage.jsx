import { Fragment, useEffect, useRef, useState } from 'react';
import { useConference, useFetch } from '../lib/store.jsx';
import * as api from '../lib/api.js';
import { agendaDays, focusSession, orderDays, travelNotes } from '../lib/agenda.js';
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

/** The journey between two venues: an amber warning when the gap is too short, else a plain note. */
function TravelNote({ note }) {
  const { fastest, gapMinutes, warn, from, to } = note;
  return (
    <li data-testid="agenda-travel" data-state={warn ? 'warn' : 'ok'} data-from={from.id} data-to={to.id}
      className={cx('flex min-w-0 items-start gap-2 px-3 text-xs', warn ? 'font-semibold text-amber-300' : 'text-muted')}>
      <Icon name={warn ? 'alert' : 'car'} className="mt-0.5 size-3.5 shrink-0" />
      <span className="min-w-0">
        {warn
          ? `You'll need ~${fastest.total} min by ${fastest.mode}; you have ${gapMinutes}`
          : `~${fastest.total} min by ${fastest.mode} to ${to.venue.name}; you have ${gapMinutes}`}
      </span>
    </li>
  );
}

/** A free stretch between two seats, with up to three talks that fit inside it. */
function GapRow({ gap }) {
  return (
    <li data-testid="agenda-gap" data-start={gap.startsAt} data-end={gap.endsAt}
      className="min-w-0 space-y-2 rounded-xl border border-dashed border-violet-400/40 p-3">
      <p className="text-sm font-semibold text-violet-300">You're free {gap.startsAt}-{gap.endsAt}</p>
      {gap.suggestions.length > 0 && (
        <ul className="space-y-2">
          {gap.suggestions.map(({ session, reasons }) => (
            <li key={session.id} data-testid="agenda-gap-item" data-session-id={session.id} className="min-w-0">
              <SessionCard session={session} variant="row" />
              <p className="px-1 pt-1 text-xs text-muted">{reasons.join(' · ')}</p>
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}

function AgendaDay({ day, clock, gaps }) {
  const { travel } = useConference();
  const notes = travelNotes(day.sessions, travel);
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
            <Fragment key={s.id}>
            {notes.has(s.id) && <TravelNote note={notes.get(s.id)} />}
            <li data-testid="agenda-row" data-session-id={s.id}
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
            {gaps.filter((g) => g.previousId === s.id).map((g) => <GapRow key={`${g.startsAt}-${g.endsAt}`} gap={g} />)}
            </Fragment>
          );
        })}
      </ul>
    </section>
  );
}

export function MyAgendaPage() {
  useDocumentTitle('My Agenda');
  const { currentUserId, reservationFor, clock, reservations } = useConference();
  const { data, loading, error, reload } = useFetch(() => api.getSchedule(currentUserId), [currentUserId]);
  // Suggestions are a bonus: while they load, or if they fail, the agenda reads as before.
  const gapsFetch = useFetch(
    () => api.getGaps(currentUserId, { day: clock.day, time: clock.time }),
    [currentUserId, clock.day, clock.time, reservations]);
  const gaps = gapsFetch.data?.gaps ?? [];
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
    body = <div className="space-y-8">{days.map((d) => <AgendaDay key={d.date} day={d} clock={clock} gaps={gaps.filter((g) => g.day === d.date)} />)}</div>;
  }

  const hasConfirmed = !error && !loading && days.some((d) => d.sessions.some((s) => s.reservation === 'confirmed'));
  const action = hasConfirmed && (
    <Button href={api.agendaCalendarUrl(currentUserId)} data-testid="agenda-calendar">
      <Icon name="calendar" className="size-3.5" /> Add my agenda to calendar
    </Button>
  );

  return (
    <div className="space-y-8">
      <SectionHeader eyebrow="Your conference" title="My Agenda" action={action || undefined} />
      {body}
    </div>
  );
}
