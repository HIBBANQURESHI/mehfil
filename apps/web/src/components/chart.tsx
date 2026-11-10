'use client';
import { useState } from 'react';

export interface Point { label: string; value: number; display: string }

/** Single-series bar chart with per-bar hover and a table view for screen readers. */
export function BarChart({ points, title }: { points: Point[]; title: string }) {
  const [hover, setHover] = useState<number | null>(null);
  if (!points.length) return <p className="py-10 text-center text-sm text-muted">No data for this period yet.</p>;
  const W = 640, H = 200, TOP = 12, BOTTOM = 22;
  const max = Math.max(...points.map((p) => p.value), 1);
  const plot = H - TOP - BOTTOM;
  const step = W / points.length;
  const bar = Math.min(Math.max(step - 2, 2), 28);
  const every = Math.ceil(points.length / 8);
  const active = hover === null ? null : points[hover];
  return (
    <figure className="relative">
      <div className="mb-1 h-5 text-xs text-muted" aria-hidden>{active ? <span><span className="font-medium text-ink">{active.display}</span> · {active.label}</span> : `Peak ${points.reduce((a, b) => (b.value > a.value ? b : a)).display}`}</div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={title} onMouseLeave={() => setHover(null)}>
        <line x1={0} x2={W} y1={H - BOTTOM} y2={H - BOTTOM} stroke="#F0E3E2" />
        <line x1={0} x2={W} y1={TOP} y2={TOP} stroke="#F0E3E2" strokeDasharray="3 4" />
        {points.map((p, i) => {
          const h = Math.max((p.value / max) * plot, p.value > 0 ? 2 : 0);
          const x = i * step + (step - bar) / 2, y = H - BOTTOM - h;
          return (
            <g key={p.label} onMouseEnter={() => setHover(i)}>
              <rect x={i * step} y={TOP} width={step} height={plot} fill="transparent" />
              <path d={h >= 4 ? `M${x},${y + 4} q0,-4 4,-4 h${bar - 8} q4,0 4,4 v${h - 4} h${-bar} z` : `M${x},${y} h${bar} v${h} h${-bar} z`} fill={hover === i ? '#76263B' : '#8F3048'} />
              {i % every === 0 && <text x={i * step + step / 2} y={H - 6} textAnchor="middle" fontSize="11" fill="#7F6A70">{p.label}</text>}
            </g>
          );
        })}
      </svg>
      <table className="sr-only"><caption>{title}</caption><tbody>{points.map((p) => <tr key={p.label}><th>{p.label}</th><td>{p.display}</td></tr>)}</tbody></table>
    </figure>
  );
}
