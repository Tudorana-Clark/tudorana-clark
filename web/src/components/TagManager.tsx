import Script from "next/script";

import { site } from "@/lib/site";

/**
 * Google Tag Manager for the public site (the studio is deliberately left out). GA4 and any other tags are
 * configured inside the GTM container, not here. Renders nothing when NEXT_PUBLIC_GTM_ID is unset (local dev).
 */
export function TagManager() {
  const id = site.gtmId;
  if (!id) return null;
  return (
    <>
      <Script id="gtm-init" strategy="afterInteractive">
        {`window.dataLayer=window.dataLayer||[];window.dataLayer.push({"gtm.start":Date.now(),event:"gtm.js"});`}
      </Script>
      <Script id="gtm" strategy="afterInteractive" src={`https://www.googletagmanager.com/gtm.js?id=${id}`} />
      <noscript>
        <iframe src={`https://www.googletagmanager.com/ns.html?id=${id}`} height="0" width="0" style={{ display: "none", visibility: "hidden" }} title="Google Tag Manager" />
      </noscript>
    </>
  );
}
