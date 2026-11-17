import type { MetadataRoute } from "next";

import { site } from "@/lib/site";

/**
 * AI-native robots policy: explicitly welcome answer-engine and training crawlers so the
 * writing can be cited by ChatGPT, Claude, Perplexity, Copilot and Gemini. The studio stays private.
 */
const AI_AGENTS = [
  "GPTBot",
  "OAI-SearchBot",
  "ChatGPT-User",
  "ClaudeBot",
  "Claude-SearchBot",
  "Claude-User",
  "anthropic-ai",
  "PerplexityBot",
  "Perplexity-User",
  "Google-Extended",
  "Applebot-Extended",
  "Bingbot",
  "DuckAssistBot",
  "Meta-ExternalAgent",
  "MistralAI-User",
  "cohere-ai",
  "CCBot",
];

export default function robots(): MetadataRoute.Robots {
  const disallow = ["/studio", "/api/"];
  return {
    rules: [{ userAgent: "*", allow: "/", disallow }, ...AI_AGENTS.map((userAgent) => ({ userAgent, allow: "/", disallow }))],
    sitemap: `${site.url}/sitemap.xml`,
    host: site.url,
  };
}
