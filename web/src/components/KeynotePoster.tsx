import type { Keynote } from "@/lib/keynotes";

import { Logo } from "./Logo";

/**
 * The keynote poster, drawn in the site's own design system rather than as an image: it stays sharp at any size,
 * follows the brand tokens and scales with its container (container query units), and is read out as one image.
 */
export function KeynotePoster({ keynote }: { keynote: Keynote }) {
  const label = `Poster for ${keynote.title}: ${keynote.clockCaption.toLowerCase()} in ${keynote.clock.split(":")[0]} minutes, building a ${keynote.deliverables
    .join(", ")
    .toLowerCase()}, across four stages: ${keynote.stages.join(", ").toLowerCase()}.`;
  return (
    <div className="kp" role="img" aria-label={label}>
      <div className="kp-inner" aria-hidden="true">
        <div className="kp-top">
          <Logo height={12} title="" />
          <span className="kp-kicker">Keynote</span>
        </div>

        <div className="kp-main">
          <div className="kp-clock">
            <span className="kp-time">{keynote.clock}</span>
            <span className="kp-caption">{keynote.clockCaption}</span>
          </div>

          <div className="kp-window">
            <div className="kp-bar">
              <span />
              <span />
              <span />
              <strong>Startup blueprint</strong>
            </div>
            <ul>
              {keynote.deliverables.map((d) => (
                <li key={d}>
                  <svg viewBox="0 0 20 20" width="20" height="20">
                    <circle cx="10" cy="10" r="10" />
                    <path d="M5.5 10.5l3 3 6-6.5" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  {d}
                </li>
              ))}
            </ul>
            <div className="kp-progress">
              <span />
            </div>
          </div>
        </div>

        <ol className="kp-stages">
          {keynote.stages.map((s, i) => (
            <li key={s}>
              <span>{String(i + 1).padStart(2, "0")}</span>
              {s}
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}
