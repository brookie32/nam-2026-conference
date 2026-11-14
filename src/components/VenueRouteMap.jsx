import { accentHex } from '../lib/accents.js';
import { cx } from './ui.jsx';

/**
 * The two-site map.
 *
 * The most important fact in this product is that ORBIT happens in two places
 * six miles apart. Positions come from the real lat/lng on each venue row,
 * projected onto the canvas, so the geometry is honest rather than decorative.
 *
 * Two canvases are in the DOM: `wide` (shown from `lg`) and `phone` (below
 * `lg`). SVG text and geometry cannot change by breakpoint on one viewBox, and
 * the wide canvas shrunk to a phone renders its labels at 4-6px.
 */
const LAYOUTS = {
  wide: { W: 900, H: 290, PAD_X: 140, SPREAD_Y: 90, ARC: 52, name: 'text-[15px]', sub: 'text-[11px]', miles: 'text-[13px]', mins: 'text-[10px]' },
  phone: { W: 280, H: 240, PAD_X: 70, SPREAD_Y: 60, ARC: 52, name: 'text-[14px]', sub: 'text-[12px]', miles: 'text-[12px]', mins: 'text-[12px]' },
};

/** Project lat/lng onto the canvas, centred on both axes so there is no dead band. */
function project(venues, { W, H, PAD_X, SPREAD_Y }) {
  const lats = venues.map((v) => v.lat);
  const lngs = venues.map((v) => v.lng);
  const minLng = Math.min(...lngs);
  const minLat = Math.min(...lats);
  const spanLng = Math.max(...lngs) - minLng || 1;
  const spanLat = Math.max(...lats) - minLat || 1;

  return venues.map((v) => ({
    ...v,
    x: PAD_X + ((v.lng - minLng) / spanLng) * (W - PAD_X * 2),
    // north is up, and the band is centred vertically
    y: H / 2 + SPREAD_Y / 2 - ((v.lat - minLat) / spanLat) * SPREAD_Y,
  }));
}

function MapCanvas({ layout, idSuffix, venues, fastest, testId }) {
  const { W, H } = layout;
  const wide = idSuffix === '';
  const points = project(venues, layout);
  const [a, b] = points;
  const sfx = idSuffix ? `-${idSuffix}` : '';

  // A gentle arc rather than a straight line — reads as a journey, not a rule.
  const midX = (a.x + b.x) / 2;
  const midY = (a.y + b.y) / 2 - layout.ARC;
  const path = `M ${a.x} ${a.y} Q ${midX} ${midY} ${b.x} ${b.y}`;
  const pillW = wide ? 124 : 140;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" data-testid={testId}
      aria-label={`Map showing ${a.name} and ${b.name}, ${fastest?.minutes} minutes apart by ${fastest?.mode}`}>
      <defs>
        <pattern id={`streets${sfx}`} width="60" height="60" patternUnits="userSpaceOnUse">
          <path d="M60 0H0v60" fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="1" />
        </pattern>
        <linearGradient id={`routeGrad${sfx}`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor={accentHex(a.accent)[0]} />
          <stop offset="100%" stopColor={accentHex(b.accent)[0]} />
        </linearGradient>
      </defs>

      <rect width={W} height={H} fill={`url(#streets${sfx})`} />
      {/* a couple of arterial roads for context */}
      <path d={`M0 ${H * 0.78} H${W}`} stroke="rgba(255,255,255,0.07)" strokeWidth="10" />
      <path d={`M${W * 0.63} 0 V${H}`} stroke="rgba(255,255,255,0.055)" strokeWidth="7" />

      {/* the route */}
      <path d={path} fill="none" stroke={`url(#routeGrad${sfx})`} strokeWidth="2.5"
        strokeDasharray="9 7" strokeLinecap="round" opacity="0.9" />

      {/* distance marker riding the arc */}
      <g transform={`translate(${midX}, ${midY + 34})`}>
        <rect x={-pillW / 2} y="-17" width={pillW} height="34" rx="17" fill="var(--color-ground)" stroke="var(--color-hairline)" />
        <text x="0" y="-2" textAnchor="middle" className={cx('fill-white font-bold', layout.miles)}>6.2 miles</text>
        <text x="0" y="12" textAnchor="middle" className={cx('fill-white/45', layout.mins)}>
          {fastest ? `${fastest.minutes} min by ${fastest.mode.toLowerCase()}` : ''}
        </text>
      </g>

      {points.map((v) => {
        const [light] = accentHex(v.accent);
        return (
          <g key={v.id} transform={`translate(${v.x}, ${v.y})`}>
            <circle r="30" fill={light} opacity="0.12" />
            <circle r="17" fill={light} opacity="0.22" />
            <circle r="8" fill={light} />
            <circle r="3" fill="var(--color-ground)" />
            <text y="-44" textAnchor="middle" className={cx('fill-white font-bold', layout.name)}>{v.shortName}</text>
            <text y="-28" textAnchor="middle" className={cx('fill-white/45', layout.sub)}>
              {v.roomCount} stages · {v.city.split(',')[0]}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

export function VenueRouteMap({ venues, routes, className }) {
  if (venues.length < 2) return null;
  const fastest = routes.filter((r) => r.mode !== 'Walk').sort((x, y) => x.minutes - y.minutes)[0];

  return (
    <div className={cx('relative overflow-hidden rounded-xl border border-hairline bg-ground', className)}>
      <div className="hidden lg:block">
        <MapCanvas layout={LAYOUTS.wide} idSuffix="" venues={venues} fastest={fastest} testId="venue-map-wide" />
      </div>
      <div className="mx-auto max-w-md lg:hidden">
        <MapCanvas layout={LAYOUTS.phone} idSuffix="phone" venues={venues} fastest={fastest} testId="venue-map-phone" />
      </div>
    </div>
  );
}
