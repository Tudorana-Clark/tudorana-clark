"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useState, useTransition } from "react";

import { createExperimentAction, deleteExperimentAction, updateExperimentAction } from "@/app/studio/results-actions";
import type { ChannelSummary, Experiment, ExperimentSummary, GroupStat, ResultsSummary } from "@/lib/types";

import { Panel } from "./fields";

type Toast = { tone: "success" | "error"; text: string } | null;

const CHANNEL = { linkedin: "LinkedIn", x: "X" } as const;
const BAND: Record<string, string> = { strong: "Strong (80+)", good: "Good (65–79)", needs_work: "Needs work (50–64)", weak: "Weak (under 50)", unscored: "Not scored" };
const HOOK: Record<string, string> = {
  story: "Story",
  position: "Position",
  result: "Result",
  statement: "Statement",
  question: "Question",
  announcement: "Announcement",
  list: "List",
  other: "Other",
  unknown: "Not classified",
};
const VERDICT: Record<ExperimentSummary["verdict"], { icon: string; label: string }> = {
  collecting: { icon: "◔", label: "Collecting" },
  lead: { icon: "▲", label: "Lead found" },
  no_clear_difference: { icon: "＝", label: "No clear difference" },
};

const rate = (n: number | null) => (n === null ? "—" : n.toFixed(2));
const whole = (n: number | null) => (n === null ? "—" : Math.round(n).toLocaleString("en-GB"));

function rhoSentence(c: ChannelSummary, min: number): string {
  if (c.score_rho === null) {
    return `Needs 10 scored posts with ${CHANNEL[c.channel]} results to judge whether the score predicts anything; you have ${c.score_n}.`;
  }
  const r = c.score_rho.toFixed(2);
  if (c.score_rho >= 0.3) return `Higher-scoring posts have drawn more conversation (rank correlation ${r} across ${c.score_n} posts). The rubric is tracking your audience.`;
  if (c.score_rho <= -0.1)
    return `Higher scores haven't gone with more conversation (rank correlation ${r} across ${c.score_n} posts). Look at which criteria your best posts fail; they may deserve less weight for your audience.`;
  return `Only a weak link between score and conversation so far (rank correlation ${r} across ${c.score_n} posts). Keep measuring; groups become comparable at ${min} posts each.`;
}

export function ResultsDashboard({ summary, experiments, loadError }: { summary: ResultsSummary | null; experiments: Experiment[]; loadError: string | null }) {
  const [toast, setToast] = useState<Toast>(null);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), toast.tone === "error" ? 8000 : 4000);
    return () => clearTimeout(t);
  }, [toast]);

  if (loadError || !summary) {
    return (
      <div role="alert" style={{ background: "var(--white)", borderRadius: 24, padding: 32, display: "flex", flexDirection: "column", gap: 12 }}>
        <h1 className="display" style={{ fontSize: 28, margin: 0 }}>
          Results couldn’t load
        </h1>
        <p style={{ margin: 0, color: "var(--muted)" }}>{loadError ?? "Please try again."}</p>
        <Link className="pill sm" href="/studio/results" style={{ alignSelf: "flex-start" }}>
          Try again
        </Link>
      </div>
    );
  }

  const measuredChannels = summary.channels.filter((c) => c.n > 0);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <header style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <h1 className="display" style={{ fontSize: 36, margin: 0 }}>
          Results
        </h1>
        <p style={{ margin: 0, color: "var(--muted)", maxWidth: 720, lineHeight: 1.55 }}>
          What your posts actually did. The main measure is the conversation rate: comments, reposts, sends and saves per 100 impressions, which both feeds weigh far above likes. Groups are compared on
          medians once they have {summary.min_per_group} posts each.
        </p>
      </header>

      <div className="results-tiles">
        <Tile label="Posts measured" value={String(summary.measured)} />
        {summary.channels.map((c) => (
          <Tile key={c.channel} label={`${CHANNEL[c.channel]} conversation rate`} value={rate(c.median_rate)} note={c.n ? `median per 100 impressions · ${c.n} post${c.n === 1 ? "" : "s"}` : "no results yet"} />
        ))}
        <Tile label="Enquiries traced" value={String(summary.inquiries)} />
      </div>

      {summary.posted_unmeasured > 0 && (
        <p role="status" className="form-note" style={{ background: "var(--white)", borderRadius: 14, padding: "12px 16px", margin: 0 }}>
          {summary.posted_unmeasured} posted {summary.posted_unmeasured === 1 ? "post has" : "posts have"} no numbers yet. <Link href="/studio/posts">Open your posts</Link> and add them about a week after
          posting.
        </p>
      )}

      {measuredChannels.length === 0 ? (
        <Panel title="How the loop works">
          <ol className="results-steps">
            <li>Write and post as usual. Every post the studio writes is already scored.</li>
            <li>About a week later, open the post, mark it as posted and copy the numbers from LinkedIn and X analytics into Results.</li>
            <li>To test one change, such as short against long hooks, start an experiment below and tag each post with its arm.</li>
            <li>After {summary.min_per_group} or so posts per group, this page shows whether higher scores, certain hooks or a tested change actually draw more conversation from your audience.</li>
          </ol>
        </Panel>
      ) : (
        measuredChannels.map((c) => <ChannelPanel key={c.channel} c={c} min={summary.min_per_group} />)
      )}

      <Experiments summary={summary} experiments={experiments} onToast={setToast} />

      {toast && (
        <div className="toast" role={toast.tone === "error" ? "alert" : "status"} style={{ background: toast.tone === "error" ? "var(--danger)" : "var(--ink)", maxWidth: "calc(100vw - 32px)" }}>
          {toast.text}
        </div>
      )}
    </div>
  );
}

function Tile({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="results-tile">
      <p className="results-tile-label">{label}</p>
      <p className="results-tile-value">{value}</p>
      {note && <p className="results-tile-note">{note}</p>}
    </div>
  );
}

function ChannelPanel({ c, min }: { c: ChannelSummary; min: number }) {
  return (
    <Panel title={CHANNEL[c.channel]}>
      <p className="results-meta">
        Median impressions {whole(c.median_impressions)} · median reactions {rate(c.median_reaction_rate)} per 100 · {c.negatives} negative{c.negatives === 1 ? "" : "s"} counted
      </p>
      <GroupTable caption="Does the score predict results?" groups={c.by_band} label={(k) => BAND[k] ?? k} min={min} />
      <p className="results-insight">{rhoSentence(c, min)}</p>
      <GroupTable caption="By opening line" groups={c.by_hook} label={(k) => HOOK[k] ?? k} min={min} />
      <GroupTable caption="By format" groups={c.by_format} label={(k) => k} min={min} />
    </Panel>
  );
}

function GroupTable({ caption, groups, label, min }: { caption: string; groups: GroupStat[]; label: (k: string) => string; min: number }) {
  const max = Math.max(...groups.map((g) => g.median_rate ?? 0), 0);
  return (
    <div className="table-scroll">
      <table className="results-table">
        <caption>{caption}</caption>
        <thead>
          <tr>
            <th scope="col">Group</th>
            <th scope="col" className="num">
              Posts
            </th>
            <th scope="col" className="num">
              Conversation per 100
            </th>
            <th scope="col" className="results-bar-col">
              <span className="sr-only">Relative size</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {groups.map((g) => (
            <tr key={g.key} data-enough={g.enough || undefined}>
              <th scope="row">
                {label(g.key)}
                {!g.enough && <span className="results-few">{g.n < min ? `needs ${min - g.n} more` : ""}</span>}
              </th>
              <td className="num">{g.n}</td>
              <td className="num">{rate(g.median_rate)}</td>
              <td className="results-bar-col" aria-hidden="true">
                <span className="results-bar" style={{ width: max > 0 && g.median_rate !== null ? `${Math.max(2, (g.median_rate / max) * 100)}%` : 0 }} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ---------- Experiments ----------

function Experiments({ summary, experiments, onToast }: { summary: ResultsSummary; experiments: Experiment[]; onToast: (t: Toast) => void }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [name, setName] = useState("");
  const [variable, setVariable] = useState("");
  const [hypothesis, setHypothesis] = useState("");
  const [arms, setArms] = useState("A, B");
  const [errorField, setErrorField] = useState<string | null>(null);
  const id = useId();

  function create(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const res = await createExperimentAction({
        name,
        variable,
        hypothesis,
        arms: arms
          .split(",")
          .map((a) => a.trim())
          .filter(Boolean),
        status: "running",
        conclusion: "",
      });
      if (!res.ok) {
        setErrorField(res.field?.split(".")[0] ?? null);
        return onToast({ tone: "error", text: res.error });
      }
      setErrorField(null);
      setName("");
      setVariable("");
      setHypothesis("");
      setArms("A, B");
      onToast({ tone: "success", text: res.message ?? "Experiment started." });
      router.refresh();
    });
  }

  const byExperiment = new Map<string, ExperimentSummary[]>();
  for (const s of summary.experiments) byExperiment.set(s.experiment.id, [...(byExperiment.get(s.experiment.id) ?? []), s]);

  return (
    <section id="experiments" aria-labelledby={`${id}-title`} style={{ display: "flex", flexDirection: "column", gap: 16, scrollMarginTop: 24 }}>
      <h2 id={`${id}-title`} className="display" style={{ fontSize: 28, margin: 0 }}>
        Experiments
      </h2>
      <p style={{ margin: 0, color: "var(--muted)", maxWidth: 720, lineHeight: 1.55 }}>
        Change one thing at a time and keep the rest alike: topic, timing and length. Alternate the arms across similar posts. A lead is worth acting on only after it shows up again in a second run.
      </p>

      {experiments.length === 0 && <p style={{ margin: 0, color: "var(--muted)" }}>No experiments yet. Start one below.</p>}
      {experiments.map((exp) => (
        <ExperimentCard key={exp.id} exp={exp} stats={byExperiment.get(exp.id) ?? []} onToast={onToast} />
      ))}

      <Panel title="Start an experiment">
        <form onSubmit={create} style={{ display: "flex", flexDirection: "column", gap: 12 }} noValidate>
          <div className="results-pair">
            <div className="field">
              <label htmlFor={`${id}-name`}>Name</label>
              <input id={`${id}-name`} className="input" value={name} maxLength={120} onChange={(e) => setName(e.target.value)} placeholder="Hook length" required aria-invalid={errorField === "name" ? true : undefined} />
            </div>
            <div className="field">
              <label htmlFor={`${id}-var`}>The one thing that changes</label>
              <input id={`${id}-var`} className="input" value={variable} maxLength={120} onChange={(e) => setVariable(e.target.value)} placeholder="First line under 40 characters vs over 100" />
            </div>
          </div>
          <div className="field">
            <label htmlFor={`${id}-hyp`}>What you expect, written before you post</label>
            <textarea id={`${id}-hyp`} className="input" rows={2} value={hypothesis} maxLength={600} onChange={(e) => setHypothesis(e.target.value)} placeholder="Short hooks draw more comments because the whole line shows above the fold." />
          </div>
          <div className="field">
            <label htmlFor={`${id}-arms`}>Arms, separated by commas</label>
            <input id={`${id}-arms`} className="input" value={arms} onChange={(e) => setArms(e.target.value)} aria-describedby={`${id}-arms-hint`} aria-invalid={errorField === "arms" ? true : undefined} />
            <p id={`${id}-arms-hint`} className="form-note" style={{ color: "var(--muted)", margin: 0 }}>
              Two arms is best; each needs about {summary.min_per_group} posts.
            </p>
          </div>
          <button type="submit" className="pill sm" style={{ alignSelf: "flex-start" }} disabled={pending || !name.trim()}>
            {pending ? "Starting…" : "Start experiment"}
          </button>
        </form>
      </Panel>
    </section>
  );
}

function ExperimentCard({ exp, stats, onToast }: { exp: Experiment; stats: ExperimentSummary[]; onToast: (t: Toast) => void }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [concluding, setConcluding] = useState(false);
  const [conclusion, setConclusion] = useState(exp.conclusion);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const id = useId();

  function save(status: Experiment["status"]) {
    startTransition(async () => {
      const res = await updateExperimentAction(exp.id, { name: exp.name, variable: exp.variable, hypothesis: exp.hypothesis, arms: exp.arms, status, conclusion });
      if (!res.ok) return onToast({ tone: "error", text: res.error });
      setConcluding(false);
      onToast({ tone: "success", text: res.message ?? "Saved." });
      router.refresh();
    });
  }

  function remove() {
    startTransition(async () => {
      const res = await deleteExperimentAction(exp.id);
      if (!res.ok) return onToast({ tone: "error", text: res.error });
      onToast({ tone: "success", text: res.message ?? "Deleted." });
      router.refresh();
    });
  }

  return (
    <article className="results-exp" aria-labelledby={`${id}-name`} aria-busy={pending || undefined}>
      <header style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "baseline" }}>
        <h3 id={`${id}-name`} style={{ margin: 0, fontSize: 18, fontWeight: 600 }}>
          {exp.name}
        </h3>
        <span className="results-status">{exp.status === "concluded" ? "Concluded" : "Running"}</span>
      </header>
      {exp.variable && (
        <p className="results-meta">
          <strong>Changing:</strong> {exp.variable}
        </p>
      )}
      {exp.hypothesis && (
        <p className="results-meta">
          <strong>Expected:</strong> {exp.hypothesis}
        </p>
      )}

      {stats.map((s) => (
        <div key={s.channel} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div className="table-scroll">
            <table className="results-table">
              <caption>
                {CHANNEL[s.channel]}
                <span className="results-verdict" data-verdict={s.verdict}>
                  <span aria-hidden="true">{VERDICT[s.verdict].icon}</span> {VERDICT[s.verdict].label}
                  {s.leader ? `: ${s.leader}` : ""}
                </span>
              </caption>
              <thead>
                <tr>
                  <th scope="col">Arm</th>
                  <th scope="col" className="num">
                    Posts
                  </th>
                  <th scope="col" className="num">
                    Conversation per 100
                  </th>
                  <th scope="col" className="num">
                    Negatives
                  </th>
                </tr>
              </thead>
              <tbody>
                {s.arms.map((a) => (
                  <tr key={a.arm}>
                    <th scope="row">
                      {a.arm}
                      {s.leader === a.arm && <span className="results-few">leading</span>}
                    </th>
                    <td className="num">{a.n}</td>
                    <td className="num">{rate(a.median_rate)}</td>
                    <td className="num">{a.negatives}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="results-insight">{s.note}</p>
        </div>
      ))}

      {exp.status === "concluded" && exp.conclusion && (
        <p className="results-meta">
          <strong>Conclusion:</strong> {exp.conclusion}
        </p>
      )}

      {concluding ? (
        <div className="field">
          <label htmlFor={`${id}-conc`}>What you learned</label>
          <textarea id={`${id}-conc`} className="input" rows={2} maxLength={1000} value={conclusion} onChange={(e) => setConclusion(e.target.value)} placeholder="Short hooks led in two runs; making them the default." />
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button type="button" className="pill sm" onClick={() => save("concluded")} disabled={pending}>
              Save conclusion
            </button>
            <button type="button" className="pill ghost sm" onClick={() => setConcluding(false)} disabled={pending}>
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {exp.status === "running" ? (
            <button type="button" className="pill ghost sm" onClick={() => setConcluding(true)} disabled={pending}>
              Conclude
            </button>
          ) : (
            <button type="button" className="pill ghost sm" onClick={() => save("running")} disabled={pending}>
              Reopen
            </button>
          )}
          {confirmDelete ? (
            <>
              <button type="button" className="pill danger sm" onClick={remove} disabled={pending}>
                Delete experiment
              </button>
              <button type="button" className="pill ghost sm" onClick={() => setConfirmDelete(false)}>
                Keep it
              </button>
            </>
          ) : (
            <button type="button" className="pill danger sm" onClick={() => setConfirmDelete(true)} disabled={pending}>
              Delete
            </button>
          )}
        </div>
      )}
      {confirmDelete && (
        <p role="alert" className="form-note" data-tone="error" style={{ margin: 0 }}>
          This removes the experiment. Its posts keep their numbers but are no longer grouped.
        </p>
      )}
    </article>
  );
}
