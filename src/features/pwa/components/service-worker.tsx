"use client";

import { useEffect } from "react";

/**
 * Registers /sw.js in production builds. In development it would cache
 * hot-reloaded assets and get in the way.
 */
export function ServiceWorkerRegistration() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker
      .register("/sw.js", { scope: "/", updateViaCache: "none" })
      .catch(() => {
        // Not fatal: the app works without it, just not offline.
      });
  }, []);
  return null;
}
