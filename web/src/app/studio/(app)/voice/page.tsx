import Link from "next/link";
import { connection } from "next/server";

import { PlaybookEditor } from "@/components/studio/PlaybookEditor";
import { VoiceEditor } from "@/components/studio/VoiceEditor";
import { ApiError, studio } from "@/lib/api";

export default async function VoicePage() {
  await connection();
  let voice, playbook;
  try {
    [voice, playbook] = await Promise.all([studio.voice(), studio.playbook()]);
  } catch (err) {
    return (
      <div role="alert" style={{ background: "var(--white)", borderRadius: 24, padding: 32, display: "flex", flexDirection: "column", gap: 12 }}>
        <h1 className="display" style={{ fontSize: 28 }}>
          Your voice and playbook couldn’t load
        </h1>
        <p style={{ margin: 0, color: "var(--muted)" }}>{err instanceof ApiError ? err.message : "Please try again."}</p>
        <Link className="pill sm" href="/studio/voice" style={{ alignSelf: "flex-start" }}>
          Try again
        </Link>
      </div>
    );
  }
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24, maxWidth: 880 }}>
      <div>
        <h1 className="display" style={{ fontSize: 40 }}>
          Voice &amp; playbook
        </h1>
        <p style={{ margin: "6px 0 0", color: "var(--muted)", fontSize: 15 }}>How you sound, and the rules your articles follow. Posts use the voice; articles use both.</p>
      </div>
      <VoiceEditor initial={voice} />
      <PlaybookEditor initial={playbook} />
    </div>
  );
}
