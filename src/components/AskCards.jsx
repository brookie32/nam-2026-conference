import { useEffect, useState } from 'react';
import * as api from '../lib/api.js';
import { useConference } from '../lib/store.jsx';
import { routesBetween } from '../lib/travel.js';
import { SessionCard } from './SessionCard.jsx';

/** One session card per id the model chose; the card, not the model, supplies time, room and seats. */
export function SessionResults({ ids }) {
  const { currentUserId } = useConference();
  const [sessions, setSessions] = useState([]);
  const key = (ids ?? []).join(',');
  useEffect(() => {
    let live = true;
    Promise.all((ids ?? []).map((id) => api.getSession(id, currentUserId).catch(() => null)))
      .then((list) => { if (live) setSessions(list.filter(Boolean)); });
    return () => { live = false; };
  }, [key, currentUserId]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="my-2 min-w-0 space-y-2">
      {sessions.map((s) => <div key={s.id} className="min-w-0"><SessionCard session={s} variant="row" /></div>)}
    </div>
  );
}

/** The ways between two venues, quickest first. */
export function TravelResults({ fromVenueId, toVenueId }) {
  const { travel = [], venues = [] } = useConference();
  const name = (id) => venues.find((v) => v.id === id)?.shortName ?? '';
  const routes = routesBetween(travel, fromVenueId, toVenueId);
  if (!routes.length) return null;
  return (
    <div className="my-2 min-w-0 rounded-lg border border-hairline">
      <p className="border-b border-hairline px-3 py-2 text-xs text-muted">{name(fromVenueId)} to {name(toVenueId)}</p>
      <ul>
        {routes.map((r) => (
          <li key={r.mode} data-testid="ask-travel" className="flex flex-wrap justify-between gap-x-3 px-3 py-2 text-sm">
            <span className="font-medium">{r.mode}</span>
            <span className="text-muted">{r.minutes} min · {r.costUsd ? `$${r.costUsd}` : 'free'}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
