"use server";

import { z } from "zod";

import { fail, requireSession } from "@/lib/action-helpers";
import { studio } from "@/lib/api";
import type { ActionResult, CopyScore, CoverBrief, Idea, Post, PostWriteResult, VoiceProfile } from "@/lib/types";

const KIND = z.enum(["article", "research", "note", "talk", "video"]);

// ---------- Cover briefs ----------

const briefSchema = z.object({ kind: KIND, title: z.string().trim().min(1, "Add a title first.").max(200), body: z.string().max(200_000), category: z.string().max(300) });

export async function coverBriefsAction(input: z.input<typeof briefSchema>): Promise<ActionResult<CoverBrief[]>> {
  await requireSession();
  const parsed = briefSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the piece." };
  try {
    const { briefs } = await studio.coverBriefs(parsed.data);
    return { ok: true, data: briefs };
  } catch (err) {
    return fail(err);
  }
}

// ---------- Voice ----------

export async function learnVoiceAction(): Promise<ActionResult<{ guide: string; learned_from: number }>> {
  await requireSession();
  try {
    const data = await studio.learnVoice();
    return { ok: true, data, message: `Drafted from ${data.learned_from} published ${data.learned_from === 1 ? "piece" : "pieces"}. Review it, then save.` };
  } catch (err) {
    return fail(err);
  }
}

export async function saveVoiceAction(guide: string): Promise<ActionResult<VoiceProfile>> {
  await requireSession();
  const parsed = z.string().trim().max(4000, "Keep the voice guide under 4,000 characters.").safeParse(guide);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the guide." };
  try {
    return { ok: true, data: await studio.saveVoice(parsed.data), message: "Voice saved. New drafts will use it." };
  } catch (err) {
    return fail(err);
  }
}

// ---------- Ideas ----------

export async function mineIdeasAction(): Promise<ActionResult<{ ideas: Idea[]; added: number; remaining: number }>> {
  await requireSession();
  try {
    const res = await studio.mineIdeas();
    const ideas = await studio.ideas();
    const message =
      res.scanned === 0
        ? "You’re up to date. New ideas appear after you publish or update a piece."
        : `${res.added} new ${res.added === 1 ? "idea" : "ideas"} from ${res.scanned} ${res.scanned === 1 ? "piece" : "pieces"}.${res.remaining ? ` ${res.remaining} more to scan — click again.` : ""}`;
    return { ok: true, data: { ideas, added: res.added, remaining: res.remaining }, message };
  } catch (err) {
    return fail(err);
  }
}

export async function addIdeaAction(text: string): Promise<ActionResult<Idea>> {
  await requireSession();
  const parsed = z.string().trim().min(1, "Write the idea first.").max(600, "Keep ideas under 600 characters.").safeParse(text);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the idea." };
  try {
    return { ok: true, data: await studio.addIdea(parsed.data), message: "Idea saved." };
  } catch (err) {
    return fail(err);
  }
}

export async function deleteIdeaAction(id: string): Promise<ActionResult> {
  await requireSession();
  try {
    await studio.deleteIdea(id);
    return { ok: true, data: undefined, message: "Idea removed." };
  } catch (err) {
    return fail(err);
  }
}

// ---------- Posts ----------

const copySchema = z.object({
  linkedin: z.string().max(3000, "LinkedIn posts must be 3,000 characters or fewer."),
  x: z.string().max(280, "X posts must be 280 characters or fewer."),
  hook: z.string().max(260, "Keep the quote line under 260 characters, including any <box> markers."),
});

const imageSchema = z.object({ url: z.url(), alt: z.string().max(300), width: z.number().int().nullish(), height: z.number().int().nullish() });

const count = z.number().int("Use whole numbers.").min(0, "Numbers can’t be negative.").max(100_000_000).nullable();
const channelResultSchema = z.object({
  impressions: count,
  reactions: count,
  comments: count,
  reposts: count,
  shares: count,
  saves: count,
  profile_visits: count,
  link_clicks: count,
  follows: count,
  negatives: count,
});
const resultsSchema = z.object({
  linkedin: channelResultSchema.nullable(),
  x: channelResultSchema.nullable(),
  inquiries: z.number().int("Use whole numbers.").min(0, "Numbers can’t be negative.").max(100_000_000),
  measured_at: z.iso.date("Use a valid date.").nullable(),
  notes: z.string().max(600, "Keep notes under 600 characters."),
});

const postSchema = copySchema.extend({
  seed: z.string().trim().min(1, "Write the idea first.").max(2000),
  source: z.object({ content_id: z.string(), kind: KIND, title: z.string().max(300), path: z.string().max(300) }).nullable(),
  idea_id: z.string().nullable(),
  visual: z.enum(["none", "quote", "image"]),
  image: imageSchema.nullable(),
  cover: z.object({ style_version: z.string().min(1).max(40), model: z.string().min(1).max(120), concept: z.string().max(300), generated_at: z.string().min(1) }).nullable(),
  status: z.enum(["draft", "ready", "posted"]),
  role: z.string().max(40).optional(),
  planned_for: z.string().nullish(),
  // Produced by the API and passed back untouched; the API validates its shape and marks it stale after edits.
  score: z.custom<CopyScore>((v) => typeof v === "object" && v !== null && "total" in v).nullish(),
  results: resultsSchema.nullish(),
  experiment_id: z.string().max(64).nullish(),
  arm: z.string().max(40).optional(),
});

export async function savePostAction(id: string | null, input: z.input<typeof postSchema>): Promise<ActionResult<Post>> {
  await requireSession();
  const parsed = postSchema.safeParse(input);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return { ok: false, error: issue?.message ?? "Check the post.", field: issue?.path.join(".") };
  }
  const data = { ...parsed.data, cover: parsed.data.image ? parsed.data.cover : null };
  try {
    const saved = id ? await studio.updatePost(id, data) : await studio.createPost(data);
    const message = saved.status === "posted" ? (saved.results ? "Post and results saved." : "Marked as posted.") : "Post saved.";
    return { ok: true, data: saved, message };
  } catch (err) {
    return fail(err);
  }
}

export async function deletePostAction(id: string): Promise<ActionResult> {
  await requireSession();
  try {
    await studio.deletePost(id);
    return { ok: true, data: undefined, message: "Post deleted." };
  } catch (err) {
    return fail(err);
  }
}

const writeSchema = z.object({
  seed: z.string().trim().min(1, "Write the idea first.").max(2000, "Keep the idea under 2,000 characters."),
  source_id: z.string().nullable(),
  current: copySchema.nullable(),
  instruction: z.string().trim().max(300, "Keep the instruction short."),
});

export async function writePostAction(input: z.input<typeof writeSchema>): Promise<ActionResult<PostWriteResult>> {
  await requireSession();
  const parsed = writeSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the idea." };
  try {
    const data = await studio.write(parsed.data);
    const { score } = data;
    const message = parsed.data.current
      ? `Revised. It now scores ${score.total}.`
      : score.revised && score.first_total !== null
        ? `Drafts written and improved from ${score.first_total} to ${score.total}. Review before posting.`
        : `Drafts written in your voice. They score ${score.total}.`;
    return { ok: true, data, message };
  } catch (err) {
    return fail(err);
  }
}

const scoreSchema = z.object({ linkedin: z.string().max(3000), x: z.string().max(280), role: z.string().max(40) });

export async function scorePostAction(input: z.input<typeof scoreSchema>): Promise<ActionResult<CopyScore>> {
  await requireSession();
  const parsed = scoreSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Check the drafts." };
  try {
    const data = await studio.scorePost(parsed.data);
    return { ok: true, data, message: `Scored ${data.total}.` };
  } catch (err) {
    return fail(err);
  }
}
