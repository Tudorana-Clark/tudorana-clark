"use client";

import Script from "next/script";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";

import { OPEN_SETTINGS, clearAnalyticsCookies, readConsent, subscribeConsent, writeConsent, type ConsentChoice } from "@/lib/consent";

type GtagWindow = Window & { dataLayer?: unknown[] };

function pushConsentUpdate(analytics: ConsentChoice) {
  const dataLayer = ((window as GtagWindow).dataLayer ||= []);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- declared for the call signature; read via `arguments`
  function gtag(..._args: unknown[]): void {
    // GTM's consent API reads the `arguments` object itself, not an array.
    // eslint-disable-next-line prefer-rest-params
    dataLayer.push(arguments);
  }
  gtag("consent", "update", { analytics_storage: analytics });
}

/**
 * Asks for analytics consent and loads Google Tag Manager only once it's given. Ads storage is always denied;
 * the site runs no advertising. Renders nothing for tracking when the container id is unset (local dev).
 */
export function TagManager({ gtmId }: { gtmId: string | null }) {
  const consent = useSyncExternalStore(subscribeConsent, readConsent, () => "unknown" as const);
  const [reopened, setReopened] = useState(false);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const open = () => {
      returnFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      setReopened(true);
      // Move focus to the banner only when the visitor asked for it; a first-visit banner never steals focus.
      requestAnimationFrame(() => headingRef.current?.focus());
    };
    window.addEventListener(OPEN_SETTINGS, open);
    return () => window.removeEventListener(OPEN_SETTINGS, open);
  }, []);

  function choose(choice: ConsentChoice) {
    if (consent === "granted" && choice === "denied") {
      pushConsentUpdate("denied");
      clearAnalyticsCookies();
    }
    writeConsent(choice);
    setReopened(false);
    // The banner disappears; put focus back where the visitor opened it from rather than dropping it on <body>.
    returnFocusRef.current?.focus();
    returnFocusRef.current = null;
  }

  if (!gtmId) return null;
  const showBanner = consent === "unset" || reopened;

  return (
    <>
      {consent === "granted" && (
        <>
          <Script id="gtm-init" strategy="afterInteractive">
            {`window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}` +
              `gtag("consent","default",{analytics_storage:"granted",ad_storage:"denied",ad_user_data:"denied",ad_personalization:"denied"});` +
              `dataLayer.push({"gtm.start":Date.now(),event:"gtm.js"});`}
          </Script>
          <Script id="gtm" strategy="afterInteractive" src={`https://www.googletagmanager.com/gtm.js?id=${gtmId}`} />
        </>
      )}

      {showBanner && (
        <section className="consent" aria-labelledby="consent-title">
          <h2 id="consent-title" className="consent-title" ref={headingRef} tabIndex={-1}>
            Can I count your visit?
          </h2>
          <p className="consent-text">
            With your OK, Google Analytics sets cookies that show me which pieces people read, so I know what to write next. No advertising, and
            nothing is set unless you accept. You can change your mind any time from the footer.
          </p>
          {consent !== "unset" && consent !== "unknown" && (
            <p className="consent-current">Currently: analytics cookies {consent === "granted" ? "accepted" : "rejected"}.</p>
          )}
          <div className="consent-actions">
            <button type="button" className="pill light sm" onClick={() => choose("granted")}>
              Accept analytics
            </button>
            <button type="button" className="pill light sm" onClick={() => choose("denied")}>
              Reject
            </button>
          </div>
        </section>
      )}
    </>
  );
}
