"use client";

import { CloudOff, RefreshCw } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useIsOffline } from "@/lib/offline/network-status";
import { cn } from "@/lib/utils";

export function OfflineAdminBanner() {
  const isOffline = useIsOffline();
  const queryClient = useQueryClient();

  if (!isOffline) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        "sticky top-0 z-40 flex items-center justify-center gap-2 border-b border-amber-300/40",
        "bg-amber-50 px-4 py-2 text-sm text-amber-950 dark:bg-amber-950/90 dark:text-amber-50",
      )}
    >
      <CloudOff className="size-4" aria-hidden="true" />
      <span>You’re offline. Recent admin data may be stale; writes are disabled.</span>
      <button
        type="button"
        className="inline-flex items-center gap-1 rounded-md px-2 py-1 font-medium underline underline-offset-2 hover:bg-amber-100 dark:hover:bg-amber-900"
        onClick={() => void queryClient.refetchQueries({ type: "active" })}
      >
        <RefreshCw className="size-3.5" aria-hidden="true" />
        Retry
      </button>
    </div>
  );
}
