"use client";

import { openConsentSettings } from "@/lib/consent";

export function CookieSettingsButton() {
  return (
    <button type="button" className="link-button" onClick={openConsentSettings}>
      Cookie settings
    </button>
  );
}
