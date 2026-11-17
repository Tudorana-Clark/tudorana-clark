import type { NextRequest } from "next/server";

import { plainQuote, type QuoteFormat, renderQuoteCard } from "@/lib/og";

/**
 * Quote card PNG for a short-form post. Rendered on demand from the text (nothing stored),
 * so the preview always matches what you download. Behind the studio proxy, like every /studio path.
 */
export async function GET(request: NextRequest): Promise<Response> {
  const q = request.nextUrl.searchParams;
  const text = (q.get("text") ?? "").trim().slice(0, 300); // the line is capped at 260 characters, markers included
  if (!plainQuote(text)) return new Response("Add a quote line first.", { status: 400 });
  const format: QuoteFormat = q.get("format") === "landscape" ? "landscape" : "square";
  try {
    return await renderQuoteCard({ text, format, dark: q.get("tone") === "dark", download: q.get("download") === "1" });
  } catch (err) {
    console.error(JSON.stringify({ msg: "quote_card_failed", error: String(err) }));
    return new Response("The quote card couldn’t be drawn. Try again.", { status: 500 });
  }
}
