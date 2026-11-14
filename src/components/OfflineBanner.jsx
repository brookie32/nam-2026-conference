import { useOnline } from '../lib/useOnline.js';

/** A slim strip while the network is gone; what is on screen is the cached copy. */
export function OfflineBanner() {
  const online = useOnline();
  if (online) return null;
  return (
    <p role="status" data-testid="offline-banner" className="bg-amber-500/15 px-4 py-1.5 text-center text-xs text-amber-200">
      You're offline — showing what was saved on this device
    </p>
  );
}
