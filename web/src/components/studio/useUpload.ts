"use client";

import { useState } from "react";

import { uploadMediaAction } from "@/app/studio/actions";

const ACCEPT = ["image/png", "image/jpeg", "image/webp", "image/gif", "image/avif", "application/pdf"];
const MAX = 10 * 1024 * 1024;

export function useUpload() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function upload(file: File): Promise<string | null> {
    setError(null);
    if (!ACCEPT.includes(file.type)) {
      setError("Upload a PNG, JPEG, WebP, GIF, AVIF image or a PDF.");
      return null;
    }
    if (file.size > MAX) {
      setError("That file is over 10 MB. Please upload a smaller one.");
      return null;
    }
    setBusy(true);
    try {
      const form = new FormData();
      form.set("file", file);
      const res = await uploadMediaAction(form);
      if (!res.ok) {
        setError(res.error);
        return null;
      }
      return res.data.url;
    } catch {
      setError("The upload didn’t go through. Check your connection and try again.");
      return null;
    } finally {
      setBusy(false);
    }
  }

  return { upload, busy, error, accept: ACCEPT.join(",") };
}
