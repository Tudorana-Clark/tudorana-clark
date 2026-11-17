/**
 * Deterministic, on-brand cover art for content without a feature image.
 * The same seed (a slug) always draws the same composition, so a post's fallback never shifts between renders.
 * Pure SVG in theme tokens: crisp at any size, no network request, decorative only.
 */

type Tone = "light" | "dark";

function hash(seed: string): number {
  let h = 0x811c9dc5; // FNV-1a
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Small seeded PRNG (mulberry32) so each slug gets stable but varied parameters. */
function rng(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const PALETTE: Record<Tone, { bg: string; line: string; accent: string }> = {
  light: { bg: "var(--placeholder)", line: "var(--ink)", accent: "var(--brass)" },
  dark: { bg: "var(--navy)", line: "var(--on-dark)", accent: "var(--gold)" },
};

const W = 160;
const H = 100;

export function CoverArt({ seed, tone = "light" }: { seed: string; tone?: Tone }) {
  const r = rng(hash(seed));
  const { bg, line, accent } = PALETTE[tone];
  const variant = Math.floor(r() * 4);
  const cx = 70 + r() * 60;
  const cy = 30 + r() * 40;

  let art: React.ReactNode;
  switch (variant) {
    case 0: {
      // Concentric arcs from an off-canvas centre.
      const rings = 6 + Math.floor(r() * 4);
      art = (
        <g fill="none" stroke={line} strokeOpacity={0.22} strokeWidth={0.6}>
          {Array.from({ length: rings }, (_, i) => (
            <circle key={i} cx={cx + 30} cy={cy} r={10 + i * 9} />
          ))}
          <circle cx={cx + 30} cy={cy} r={4} fill={accent} stroke="none" />
        </g>
      );
      break;
    }
    case 1: {
      // Dot field that fades towards the left.
      const step = 8;
      const dots: React.ReactNode[] = [];
      for (let x = step; x < W; x += step) {
        for (let y = step; y < H; y += step) {
          dots.push(<circle key={`${x}-${y}`} cx={x} cy={y} r={0.9} fillOpacity={Math.min(0.35, (x / W) * 0.4)} />);
        }
      }
      art = (
        <g fill={line}>
          {dots}
          <circle cx={cx} cy={cy} r={14} fill={accent} fillOpacity={0.9} />
        </g>
      );
      break;
    }
    case 2: {
      // Offset horizontal bars, like a quiet bar chart.
      const bars = 5;
      art = (
        <g>
          {Array.from({ length: bars }, (_, i) => {
            const w = 30 + r() * 70;
            return <rect key={i} x={W - w - 16} y={22 + i * 12} width={w} height={5} rx={2.5} fill={i === 2 ? accent : line} fillOpacity={i === 2 ? 0.9 : 0.16} />;
          })}
        </g>
      );
      break;
    }
    default: {
      // A single form on a horizon line.
      const rad = 16 + r() * 10;
      art = (
        <g>
          <line x1={0} y1={cy + rad} x2={W} y2={cy + rad} stroke={line} strokeOpacity={0.25} strokeWidth={0.6} />
          <circle cx={cx} cy={cy} r={rad} fill={line} fillOpacity={0.1} />
          <circle cx={cx + rad * 0.55} cy={cy - rad * 0.2} r={rad * 0.35} fill={accent} fillOpacity={0.9} />
        </g>
      );
    }
  }

  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", display: "block" }}>
      <rect width={W} height={H} fill={bg} />
      {art}
    </svg>
  );
}
