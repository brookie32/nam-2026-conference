import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useConference, useFetch } from '../lib/store.jsx';
import * as api from '../lib/api.js';
import { rateCandidates } from '../lib/clock.js';
import { Stars } from './AttendancePanel.jsx';
import { useToast } from './Toaster.jsx';

/**
 * Home's nudge to rate the latest session the attendee checked in to and has
 * not rated. One tap on a star saves stars only; a comment stays on the
 * session page. Ended-ness is recomputed from the clock, so no refetch per tick.
 */
export function RateItPrompt() {
  const { currentUserId, clock } = useConference();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const user = useFetch(() => api.getUser(currentUserId), [currentUserId]);
  const sessions = useFetch(() => api.getSessions(), []);
  if (!user.data || !sessions.data) return null;

  const [session] = rateCandidates(sessions.data, user.data.checkIns, user.data.ratings, clock);
  if (!session) return null;

  const rate = async (stars) => {
    if (busy) return;
    setBusy(true);
    try {
      await api.rateSession(currentUserId, session.id, { stars, ...clock });
      user.reload();
      toast({ message: 'Rating saved', icon: 'check' });
    } catch (err) {
      toast({ message: err.offline ? "You're offline" : err.message, icon: 'alert' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="card space-y-3 p-5" data-testid="rate-it" aria-label="Rate a session you attended">
      <h2 className="font-mono text-[10px] uppercase tracking-[0.16em] text-faint">Rate it</h2>
      <div className="min-w-0">
        <Link to={`/sessions/${session.id}`} data-testid="rate-it-session"
          className="block font-semibold hover:text-violet-200">{session.title}</Link>
        <p className="mt-0.5 text-[13px] text-muted">{session.room?.name} · {session.venue?.shortName}</p>
      </div>
      <Stars value={0} onChange={rate} />
    </section>
  );
}
