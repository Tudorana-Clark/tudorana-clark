"use client";

import { type KeyboardEvent, useEffect, useId, useMemo, useRef, useState } from "react";

/**
 * Bespoke calendar dropdown. Values are plain "YYYY-MM-DD" strings handled in UTC, so a date
 * never shifts by a day across time zones. Keyboard: arrows move by day/week, PageUp/PageDown
 * by month, Home/End to week start/end, Enter/Space selects, Escape closes.
 */

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const WEEKDAYS = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];
const WEEKDAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

interface Ymd {
  y: number;
  m: number; // 0-11
  d: number;
}

const pad = (n: number) => String(n).padStart(2, "0");
const toIso = ({ y, m, d }: Ymd) => `${y}-${pad(m + 1)}-${pad(d)}`;
const parseIso = (s: string): Ymd | null => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  return m ? { y: Number(m[1]), m: Number(m[2]) - 1, d: Number(m[3]) } : null;
};
const fromUtc = (t: number): Ymd => {
  const dt = new Date(t);
  return { y: dt.getUTCFullYear(), m: dt.getUTCMonth(), d: dt.getUTCDate() };
};
const utc = ({ y, m, d }: Ymd) => Date.UTC(y, m, d);
const addDays = (v: Ymd, n: number) => fromUtc(utc(v) + n * 86_400_000);
const addMonths = (v: Ymd, n: number): Ymd => {
  const first = fromUtc(Date.UTC(v.y, v.m + n, 1));
  const last = new Date(Date.UTC(first.y, first.m + 1, 0)).getUTCDate();
  return { ...first, d: Math.min(v.d, last) };
};
const weekdayIndex = (v: Ymd) => (new Date(utc(v)).getUTCDay() + 6) % 7; // Monday = 0
const same = (a: Ymd | null, b: Ymd | null) => !!a && !!b && a.y === b.y && a.m === b.m && a.d === b.d;
const todayYmd = (): Ymd => {
  const n = new Date();
  return { y: n.getFullYear(), m: n.getMonth(), d: n.getDate() };
};
const longLabel = (v: Ymd) => `${WEEKDAY_NAMES[weekdayIndex(v)]} ${v.d} ${MONTHS[v.m]} ${v.y}`;

export function DatePicker({ label, value, onChange, invalid }: { label: string; value: string; onChange: (iso: string) => void; invalid?: boolean }) {
  const id = useId();
  const selected = parseIso(value);
  const [open, setOpen] = useState(false);
  const [focus, setFocus] = useState<Ymd>(selected ?? todayYmd());
  const wrapRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const today = useMemo(() => todayYmd(), []);

  // Close on outside click.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [open]);

  // Keep keyboard focus on the active day while the calendar is open.
  useEffect(() => {
    if (open) gridRef.current?.querySelector<HTMLButtonElement>(`[data-iso="${toIso(focus)}"]`)?.focus();
  }, [open, focus]);

  function openCalendar() {
    setFocus(selected ?? today);
    setOpen(true);
  }

  function close(returnFocus = true) {
    setOpen(false);
    if (returnFocus) triggerRef.current?.focus();
  }

  function choose(v: Ymd) {
    onChange(toIso(v));
    close();
  }

  function onGridKey(e: KeyboardEvent) {
    const moves: Record<string, () => Ymd> = {
      ArrowLeft: () => addDays(focus, -1),
      ArrowRight: () => addDays(focus, 1),
      ArrowUp: () => addDays(focus, -7),
      ArrowDown: () => addDays(focus, 7),
      PageUp: () => addMonths(focus, e.shiftKey ? -12 : -1),
      PageDown: () => addMonths(focus, e.shiftKey ? 12 : 1),
      Home: () => addDays(focus, -weekdayIndex(focus)),
      End: () => addDays(focus, 6 - weekdayIndex(focus)),
    };
    if (moves[e.key]) {
      e.preventDefault();
      setFocus(moves[e.key]());
    } else if (e.key === "Escape") {
      e.preventDefault();
      close();
    }
  }

  // 6 rows × 7 days starting on the Monday on/before the 1st.
  const first: Ymd = { y: focus.y, m: focus.m, d: 1 };
  const start = addDays(first, -weekdayIndex(first));
  const days = Array.from({ length: 42 }, (_, i) => addDays(start, i));

  return (
    <div className="field" ref={wrapRef} style={{ position: "relative" }}>
      <span id={`${id}-label`}>{label}</span>
      <button
        ref={triggerRef}
        type="button"
        className="input date-trigger"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-labelledby={`${id}-label ${id}-value`}
        aria-invalid={invalid ? true : undefined}
        onClick={() => (open ? close(false) : openCalendar())}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown" && !open) {
            e.preventDefault();
            openCalendar();
          }
        }}
      >
        <span id={`${id}-value`} style={{ color: selected ? "var(--ink)" : "var(--muted)" }}>
          {selected ? `${selected.d} ${MONTHS[selected.m]} ${selected.y}` : "Choose a date"}
        </span>
        <CalendarIcon />
      </button>

      {open && (
        <div role="dialog" aria-modal="false" aria-label={`Choose ${label.toLowerCase()}`} className="calendar">
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
            <button type="button" className="cal-nav" aria-label="Previous month" onClick={() => setFocus(addMonths(focus, -1))}>
              <Chevron dir="left" />
            </button>
            <span aria-live="polite" style={{ fontWeight: 600, fontSize: 15 }}>
              {MONTHS[focus.m]} {focus.y}
            </span>
            <button type="button" className="cal-nav" aria-label="Next month" onClick={() => setFocus(addMonths(focus, 1))}>
              <Chevron dir="right" />
            </button>
          </div>

          <div ref={gridRef} role="grid" aria-label={`${MONTHS[focus.m]} ${focus.y}`} onKeyDown={onGridKey}>
            <div role="row" className="cal-row">
              {WEEKDAYS.map((w, i) => (
                <span key={w} role="columnheader" aria-label={WEEKDAY_NAMES[i]} className="cal-weekday">
                  {w}
                </span>
              ))}
            </div>
            {Array.from({ length: 6 }, (_, r) => (
              <div role="row" className="cal-row" key={r}>
                {days.slice(r * 7, r * 7 + 7).map((d) => {
                  const iso = toIso(d);
                  const isFocus = same(d, focus);
                  return (
                    <span role="gridcell" key={iso} aria-selected={same(d, selected)}>
                      <button
                        type="button"
                        data-iso={iso}
                        className="cal-day"
                        tabIndex={isFocus ? 0 : -1}
                        aria-label={longLabel(d)}
                        aria-current={same(d, today) ? "date" : undefined}
                        aria-pressed={same(d, selected)}
                        data-outside={d.m !== focus.m || undefined}
                        onClick={() => choose(d)}
                      >
                        {d.d}
                      </button>
                    </span>
                  );
                })}
              </div>
            ))}
          </div>

          <div style={{ display: "flex", justifyContent: "space-between", gap: 8, borderTop: "1px solid var(--line)", paddingTop: 10 }}>
            <button type="button" className="pill ghost sm" onClick={() => choose(today)}>
              Today
            </button>
            {selected && (
              <button
                type="button"
                className="pill ghost sm"
                onClick={() => {
                  onChange("");
                  close();
                }}
              >
                Clear
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function CalendarIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true">
      <rect x="3.5" y="5" width="17" height="15.5" rx="3" />
      <path d="M3.5 10h17M8 3v4M16 3v4" />
    </svg>
  );
}

function Chevron({ dir }: { dir: "left" | "right" }) {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={dir === "left" ? "M9 2.5L4.5 7 9 11.5" : "M5 2.5L9.5 7 5 11.5"} />
    </svg>
  );
}
