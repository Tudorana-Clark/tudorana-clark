"use server";

import { headers } from "next/headers";
import { z } from "zod";

import { ApiError, sendContact, subscribe } from "@/lib/api";
import type { ActionResult } from "@/lib/types";

async function clientIp(): Promise<string> {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "unknown";
}

function failure(err: unknown): { ok: false; error: string } {
  if (err instanceof ApiError) return { ok: false, error: err.message };
  console.error(JSON.stringify({ msg: "action_failed", error: String(err) }));
  return { ok: false, error: "Something went wrong. Please try again." };
}

const subscribeSchema = z.object({
  email: z.email("Enter a valid email address, like name@company.com."),
  source: z.string().max(200).default(""),
  company: z.string().max(0, "Spam check failed.").default(""), // honeypot
});

export async function subscribeAction(_prev: ActionResult | null, form: FormData): Promise<ActionResult> {
  const parsed = subscribeSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Check your email address.", field: "email" };
  try {
    await subscribe(parsed.data.email, parsed.data.source, await clientIp());
    return { ok: true, data: undefined, message: "You’re subscribed. New insights will arrive in your inbox." };
  } catch (err) {
    return failure(err);
  }
}

const contactSchema = z.object({
  name: z.string().trim().min(1, "Tell me your name.").max(120),
  email: z.email("Enter a valid email address."),
  topic: z.enum(["Speaking", "Advisory", "Media", "Something else"], { message: "Choose a topic." }),
  message: z.string().trim().min(10, "Add a little more detail (at least 10 characters).").max(5000),
  company: z.string().max(0).default(""),
});

export async function contactAction(_prev: ActionResult | null, form: FormData): Promise<ActionResult> {
  const parsed = contactSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return { ok: false, error: issue?.message ?? "Check the form.", field: issue?.path[0]?.toString() };
  }
  const { name, email, topic, message } = parsed.data;
  const payload = { name, email, topic, message };
  try {
    await sendContact(payload, await clientIp());
    return { ok: true, data: undefined, message: "Thanks — your message is with Daniel. Expect a reply within a few working days." };
  } catch (err) {
    return failure(err);
  }
}
