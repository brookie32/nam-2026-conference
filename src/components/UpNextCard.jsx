import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useConference, useFetch } from '../lib/store.jsx';
import * as api from '../lib/api.js';
import { startPhrase } from '../lib/clock.js';
import { Button } from './ui.jsx';
import { Icon } from './Icon.jsx';
import { useToast } from './Toaster.jsx';

/**
 * The attendee's session in progress, else their next one today. Whether
 * Check in is offered comes from the attendance endpoint (`canCheckIn`), so the
 * 15-minute window lives only on the server.
 */
export function UpNextCard() {
  const { currentUserId, clock } = useConference();
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  const today = useFetch(
    () => api.getToday(currentUserId, clock),
    [currentUserId, clock.day, clock.time],
  );
  const session = today.data ? (today.data.current ?? today.data.next) : null;
  const attendance = useFetch(
    () => (session ? api.getAttendance(currentUserId, session.id, clock) : Promise.resolve(null)),
    [currentUserId, session?.id, clock.day, clock.time],
  );

  // The clock refetches both every tick; keep showing the last answer meanwhile.
  if (!today.data) return null;

  if (!session) {
    return (
      <section className="card p-5 text-[13px] text-muted" data-testid="up-next-empty">
        <h2 className="text-sm font-semibold text-ink">Up next for you</h2>
        <p className="mt-1">Nothing more on your agenda today.</p>
        <Link to={`/schedule?day=${clock.day}`} className="mt-2 inline-block font-semibold text-violet-300 hover:text-violet-200">
          Browse today&apos;s schedule
        </Link>
      </section>
    );
  }

  const a = attendance.data;
  const checkIn = async () => {
    setBusy(true);
    try {
      await api.checkIn(currentUserId, session.id, clock);
      today.reload();
      attendance.reload();
    } catch (err) {
      toast({ message: err.message, icon: 'alert' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="card flex flex-wrap items-center gap-x-5 gap-y-3 p-5" data-testid="up-next">
      <div className="min-w-0 flex-1" data-testid="up-next-session">
        <h2 className="font-mono text-[10px] uppercase tracking-[0.16em] text-faint">Up next for you</h2>
        <Link to={`/sessions/${session.id}`} className="mt-1 block truncate font-semibold hover:text-violet-200">
          {session.title}
        </Link>
        <p className="mt-0.5 text-[13px] text-muted">
          {session.room.name} · {session.venue.shortName} · {startPhrase(session.startsAt, clock.time)}
        </p>
      </div>
      {a?.canCheckIn && !a.checkedIn && (
        <Button variant="primary" size="sm" className="w-full sm:w-auto" disabled={busy}
          data-testid="up-next-checkin" onClick={checkIn}>
          <Icon name="check" className="size-4" />
          {busy ? 'Checking in…' : 'Check in'}
        </Button>
      )}
      {a?.checkedIn && (
        <p className="flex items-center gap-2 text-[13px] font-semibold text-emerald-300" data-testid="up-next-checked-in">
          <Icon name="check" className="size-4" />
          Checked in
        </p>
      )}
    </section>
  );
}
