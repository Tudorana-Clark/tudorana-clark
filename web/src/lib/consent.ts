/**
 * The visitor's analytics choice, kept in localStorage on their device only. Nothing is tracked until it is
 * "granted": Google Tag Manager isn't even requested before then.
 */

export type ConsentChoice = "granted" | "denied";
/** "unset" = no choice yet (show the banner); "unknown" = server render / storage unreadable before hydration. */
export type ConsentState = ConsentChoice | "unset" | "unknown";

const KEY = "tc-analytics-consent-v1";
const CHANGE = "tc:consent-change";
export const OPEN_SETTINGS = "tc:consent-open";

export function readConsent(): ConsentState {
  try {
    const v = window.localStorage.getItem(KEY);
    return v === "granted" || v === "denied" ? v : "unset";
  } catch {
    // Storage blocked (private mode, strict settings): ask each visit, never assume consent.
    return "unset";
  }
}

export function writeConsent(choice: ConsentChoice): void {
  try {
    window.localStorage.setItem(KEY, choice);
  } catch (err) {
    console.warn("consent_store_failed", err);
  }
  window.dispatchEvent(new Event(CHANGE));
}

export function subscribeConsent(onChange: () => void): () => void {
  window.addEventListener(CHANGE, onChange);
  window.addEventListener("storage", onChange); // choices made in another tab
  return () => {
    window.removeEventListener(CHANGE, onChange);
    window.removeEventListener("storage", onChange);
  };
}

/** Lets any control (e.g. the footer's "Cookie settings") reopen the banner. */
export function openConsentSettings(): void {
  window.dispatchEvent(new Event(OPEN_SETTINGS));
}

/** Best-effort removal of Google Analytics cookies after consent is withdrawn. */
export function clearAnalyticsCookies(): void {
  const host = window.location.hostname;
  const domains = ["", host, `.${host.replace(/^www\./, "")}`];
  for (const name of document.cookie.split(";").map((c) => c.split("=")[0].trim())) {
    if (name !== "_ga" && !name.startsWith("_ga_") && name !== "_gid") continue;
    for (const d of domains) {
      document.cookie = `${name}=; Max-Age=0; path=/${d ? `; domain=${d}` : ""}`;
    }
  }
}
