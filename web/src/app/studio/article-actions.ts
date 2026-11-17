"use server";

import { z } from "zod";

import { fail, requireSession } from "@/lib/action-helpers";
import { studio } from "@/lib/api";
import type { ActionResult, ArticleWork, Playbook, Post } from "@/lib/types";

const KIND = z.enum(["article", "research", "note", "talk", "video"]);

const sourceSchema = z.object({
  id: z.string().max(40),
  title: z.string().trim().min(1, "Give each source a title.").max(300),
  publisher: z.string().trim().min(1, "Name who published each source.").max(300),
  url: z.url("Each source needs a valid link."),
  published: z.string().max(40),
  sponsor: z.string().max(300),
  finding: z.string().max(800),
  section: z.string().max(40),
  selected: z.boolean(),
  added_by: z.enum(["research", "author"]),
});

const workSchema = z.object({
  insight: z.string().trim().min(1, "Write the insight first.").max(3000, "Keep the insight under 3,000 characters."),
  angle: z.string().max(600),
  headline: z.string().trim().max(200, "Keep the headline under 200 characters."),
  headline_options: z.array(z.string().max(300)).max(6),
  outline: z
    .array(z.object({ key: z.string().regex(/^[a-z0-9-]{1,40}$/), title: z.string().max(300), purpose: z.string().max(600), research: z.string().max(300, "Keep research questions under 300 characters.") }))
    .max(12),
  sources: z.array(sourceSchema).max(40, "Keep to 40 sources or fewer."),
  field_notes: z.string().max(3000, "Keep field notes under 3,000 characters."),
  source_ref: z.object({ content_id: z.string(), kind: KIND, title: z.string().max(300), path: z.string().max(300) }).nullable(),
  idea_id: z.string().nullable(),
});

type WorkInput = z.input<typeof workSchema>;

function parse(input: WorkInput) {
  const parsed = workSchema.safeParse(input);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return { error: issue?.message ?? "Check the plan.", field: issue?.path.join(".") };
  }
  return { data: parsed.data };
}

export async function createArticleAction(input: WorkInput): Promise<ActionResult<ArticleWork>> {
  await requireSession();
  const p = parse(input);
  if ("error" in p) return { ok: false, error: p.error ?? "Check the plan.", field: p.field };
  try {
    return { ok: true, data: await studio.createArticle(p.data) };
  } catch (err) {
    return fail(err);
  }
}

export async function saveArticleAction(id: string, input: WorkInput): Promise<ActionResult<ArticleWork>> {
  await requireSession();
  const p = parse(input);
  if ("error" in p) return { ok: false, error: p.error ?? "Check the plan.", field: p.field };
  try {
    return { ok: true, data: await studio.updateArticle(id, p.data), message: "Plan saved." };
  } catch (err) {
    return fail(err);
  }
}

export async function deleteArticleAction(id: string): Promise<ActionResult> {
  await requireSession();
  try {
    await studio.deleteArticle(id);
    return { ok: true, data: undefined, message: "Plan deleted. Any draft it created is still in Content." };
  } catch (err) {
    return fail(err);
  }
}

export async function outlineAction(id: string): Promise<ActionResult<ArticleWork>> {
  await requireSession();
  try {
    return { ok: true, data: await studio.outline(id), message: "Outline ready. Edit any section, then research." };
  } catch (err) {
    return fail(err);
  }
}

export async function researchAction(id: string, section: string, query: string): Promise<ActionResult<{ work: ArticleWork; added: number; skipped: number }>> {
  await requireSession();
  const q = z.string().trim().max(300, "Keep the question under 300 characters.").safeParse(query);
  if (!q.success) return { ok: false, error: q.error.issues[0]?.message ?? "Check the question." };
  try {
    const res = await studio.research(id, { section, query: q.data });
    const found = res.added === 0 ? "No new sources found for that question. Try rephrasing it, or add one by hand." : `${res.added} new ${res.added === 1 ? "source" : "sources"} found.`;
    const dropped = res.skipped ? ` ${res.skipped} unverifiable ${res.skipped === 1 ? "link was" : "links were"} dropped.` : "";
    return { ok: true, data: res, message: found + dropped };
  } catch (err) {
    return fail(err);
  }
}

export async function draftAction(id: string): Promise<ActionResult<ArticleWork>> {
  await requireSession();
  try {
    const { work } = await studio.draft(id);
    return { ok: true, data: work, message: "Draft written and saved to Content as a draft. Edit it there, then fact-check." };
  } catch (err) {
    return fail(err);
  }
}

export async function checkAction(id: string): Promise<ActionResult<ArticleWork>> {
  await requireSession();
  try {
    return { ok: true, data: await studio.check(id), message: "Fact-check complete." };
  } catch (err) {
    return fail(err);
  }
}

export async function distributeAction(id: string): Promise<ActionResult<Post[]>> {
  await requireSession();
  try {
    const posts = await studio.distribute(id);
    return { ok: true, data: posts, message: "Five posts added to your Posts library, scheduled across two weeks." };
  } catch (err) {
    return fail(err);
  }
}

export async function savePlaybookAction(rules: string): Promise<ActionResult<Playbook>> {
  await requireSession();
  const parsed = z.string().trim().min(1, "The playbook can’t be empty.").max(12000, "Keep the playbook under 12,000 characters.").safeParse(rules);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the playbook." };
  try {
    return { ok: true, data: await studio.savePlaybook(parsed.data), message: "Playbook saved. Every new outline, draft and check will follow it." };
  } catch (err) {
    return fail(err);
  }
}
