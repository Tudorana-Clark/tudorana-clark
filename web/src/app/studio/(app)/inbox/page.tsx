import { connection } from "next/server";
import { admin, ApiError } from "@/lib/api";
import { formatShort } from "@/lib/content";
import type { ContactMessage, Subscriber } from "@/lib/types";

export default async function InboxPage() {
  await connection();
  const [subs, msgs] = await Promise.allSettled([admin.subscribers(), admin.messages()]);
  const err = (r: PromiseSettledResult<unknown>) => (r.status === "rejected" ? (r.reason instanceof ApiError ? r.reason.message : "Couldn’t load.") : null);
  const subscribers: Subscriber[] = subs.status === "fulfilled" ? subs.value : [];
  const messages: ContactMessage[] = msgs.status === "fulfilled" ? msgs.value : [];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <h1 className="display" style={{ fontSize: 40 }}>
        Inbox
      </h1>
      <div className="split" style={{ gridTemplateColumns: "minmax(0,7fr) minmax(0,5fr)", gap: 24, alignItems: "start" }}>
        <section aria-labelledby="msgs-h" style={{ background: "var(--white)", borderRadius: 24, padding: 24, display: "flex", flexDirection: "column", gap: 16 }}>
          <h2 id="msgs-h" style={{ margin: 0, fontSize: 17 }}>
            Messages · {messages.length}
          </h2>
          {err(msgs) && <p className="form-note" data-tone="error">{err(msgs)}</p>}
          {!err(msgs) && messages.length === 0 && <p style={{ margin: 0, color: "var(--muted)" }}>No messages yet. Contact form submissions land here.</p>}
          {messages.map((m) => (
            <article key={m.id} style={{ borderTop: "1px solid var(--line)", paddingTop: 16, display: "flex", flexDirection: "column", gap: 6 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap", fontSize: 14 }}>
                <strong>
                  {m.name} · <a href={`mailto:${m.email}?subject=${encodeURIComponent(`Re: ${m.topic}`)}`}>{m.email}</a>
                </strong>
                <span style={{ color: "var(--muted)" }}>
                  {m.topic} · {formatShort(m.created_at)}
                </span>
              </div>
              <p style={{ margin: 0, whiteSpace: "pre-wrap", lineHeight: 1.6 }}>{m.message}</p>
            </article>
          ))}
        </section>
        <section aria-labelledby="subs-h" style={{ background: "var(--white)", borderRadius: 24, padding: 24, display: "flex", flexDirection: "column", gap: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
            <h2 id="subs-h" style={{ margin: 0, fontSize: 17 }}>
              Subscribers · {subscribers.length}
            </h2>
            {subscribers.length > 0 && (
              <a className="pill ghost sm" href="/studio/export/subscribers" download>
                Export CSV
              </a>
            )}
          </div>
          {err(subs) && <p className="form-note" data-tone="error">{err(subs)}</p>}
          {!err(subs) && subscribers.length === 0 && <p style={{ margin: 0, color: "var(--muted)" }}>No subscribers yet. Newsletter sign-ups appear here.</p>}
          <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
            {subscribers.map((s) => (
              <li key={s.id} style={{ display: "flex", justifyContent: "space-between", gap: 8, padding: "10px 0", borderTop: "1px solid var(--line)", fontSize: 14 }}>
                <span>{s.email}</span>
                <span style={{ color: "var(--muted)" }}>{formatShort(s.created_at)}</span>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}
