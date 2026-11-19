"use server";

import { z } from "zod";

import { fail, requireSession } from "@/lib/action-helpers";
import { studio } from "@/lib/api";
import type { ActionResult, ContentRevision, ContentScores } from "@/lib/types";

const KIND = z.enum(["article", "research", "note", "talk", "video"]);

const scoreSchema = z.object({
  content_id: z.string().max(64).nullable(),
  kind: KIND,
  title: z.string().trim().max(300),
  body: z.string().max(200_000),
  linkedin: z.string().max(3000),
  x: z.string().max(280),
});

export async function scoreContentAction(input: z.input<typeof scoreSchema>): Promise<ActionResult<ContentScores>> {
  await requireSession();
  const parsed = scoreSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Check the piece: the title, body or social posts are too long to score." };
  if (!parsed.data.body.trim()) return { ok: false, error: "Write the body first, then score it." };
  try {
    const data = await studio.scoreContent(parsed.data);
    const social = data.social ? ` Social posts score ${data.social.total}.` : "";
    return { ok: true, data, message: `The piece scores ${data.body.total}.${social}` };
  } catch (err) {
    return fail(err);
  }
}

const reviseSchema = z.object({ kind: KIND, title: z.string().trim().max(300), body: z.string().min(1).max(200_000) });

export async function reviseContentAction(id: string, input: z.input<typeof reviseSchema>): Promise<ActionResult<ContentRevision>> {
  await requireSession();
  const parsed = reviseSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Check the piece before applying suggestions." };
  try {
    const data = await studio.reviseContent(id, parsed.data);
    return { ok: true, data, message: `Suggestions applied (${data.words_before} → ${data.words_after} words). Review the changes, then save.` };
  } catch (err) {
    return fail(err);
  }
}
