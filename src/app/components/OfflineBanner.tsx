"use client";

import { useSyncExternalStore } from "react";
import { WifiOff } from "lucide-react";
import { Banner } from "./ui/banner";

function subscribeToConnectivity(onChange: () => void): () => void {
  window.addEventListener("online", onChange);
  window.addEventListener("offline", onChange);
  return () => {
    window.removeEventListener("online", onChange);
    window.removeEventListener("offline", onChange);
  };
}

function getIsOnline(): boolean {
  return navigator.onLine;
}

function getServerIsOnline(): boolean {
  return true;
}

/**
 * Tracks the browser's connectivity status.
 *
 * @returns `true` while the browser reports a network connection.
 */
function useIsOnline(): boolean {
  return useSyncExternalStore(subscribeToConnectivity, getIsOnline, getServerIsOnline);
}

/**
 * App-wide warning banner shown while the browser is offline. It cannot be
 * dismissed because it disappears automatically when connectivity returns.
 *
 * @returns The offline banner, or `null` while online.
 */
export function OfflineBanner() {
  const isOnline = useIsOnline();
  if (isOnline) return null;

  return (
    <Banner tone="warning" icon={WifiOff}>
      You are offline. Your saved progress is safe, but new responses can't be sent until your connection returns.
    </Banner>
  );
}
