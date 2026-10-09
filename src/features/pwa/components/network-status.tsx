"use client";

import { CloudOffIcon, WifiIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";

function subscribe(onChange: () => void) {
  window.addEventListener("online", onChange);
  window.addEventListener("offline", onChange);
  return () => {
    window.removeEventListener("online", onChange);
    window.removeEventListener("offline", onChange);
  };
}

/**
 * Tells the user when they're offline (saving won't work) and, when the
 * connection returns, refreshes the page data so nothing stale is shown.
 */
export function NetworkStatus() {
  const online = useSyncExternalStore(
    subscribe,
    () => navigator.onLine,
    () => true,
  );
  const router = useRouter();
  const wasOffline = useRef(false);
  const [recovered, setRecovered] = useState(false);

  useEffect(() => {
    if (!online) {
      wasOffline.current = true;
      return;
    }
    if (!wasOffline.current) return;
    wasOffline.current = false;
    router.refresh();
    setRecovered(true);
    const timer = window.setTimeout(() => setRecovered(false), 4000);
    return () => window.clearTimeout(timer);
  }, [online, router]);

  if (online && !recovered) return null;
  return (
    <div
      role="status"
      className="fixed inset-x-4 top-[calc(0.75rem+env(safe-area-inset-top))] z-50 mx-auto flex max-w-md items-center gap-2 rounded-xl border bg-popover px-4 py-3 text-sm shadow-lg"
    >
      {online ? (
        <>
          <WifiIcon aria-hidden="true" className="size-4 text-primary" />
          Conexión recuperada. Datos actualizados.
        </>
      ) : (
        <>
          <CloudOffIcon aria-hidden="true" className="size-4 text-amber-300" />
          Sin conexión: no podrás guardar cambios hasta que vuelva la red.
        </>
      )}
    </div>
  );
}
