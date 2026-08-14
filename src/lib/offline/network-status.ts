"use client";

import { useSyncExternalStore } from "react";
import { recordPerformanceEvent } from "@/lib/performance";

const listeners = new Set<() => void>();

function notify() {
  listeners.forEach((listener) => listener());
}

let listening = false;
function ensureListening() {
  if (listening || typeof window === "undefined") return;
  listening = true;
  window.addEventListener("online", notify);
  window.addEventListener("offline", notify);
}

export function subscribeNetworkStatus(listener: () => void): () => void {
  ensureListening();
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getNetworkStatus(): boolean {
  return typeof navigator === "undefined" ? true : navigator.onLine;
}

export function useIsOnline(): boolean {
  return useSyncExternalStore(subscribeNetworkStatus, getNetworkStatus, () => true);
}

export function useIsOffline(): boolean {
  return !useIsOnline();
}

export function isOnline(): boolean {
  return getNetworkStatus();
}

export class OfflineMutationError extends Error {
  readonly code = "OFFLINE_MUTATION_BLOCKED";

  constructor() {
    super("This action requires an internet connection. Reconnect and try again.");
    this.name = "OfflineMutationError";
  }
}

export function assertOnlineForMutation(action = "admin.mutation"): void {
  if (typeof navigator !== "undefined" && !getNetworkStatus()) {
    recordPerformanceEvent({ type: "offline_action", action, blocked: true });
    throw new OfflineMutationError();
  }
}
