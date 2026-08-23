'use client';

import { useSearchParams } from 'next/navigation';

interface SearchParamsReader {
  get(name: string): string | null;
}

export interface DashboardNavigationState {
  debug: boolean;
  unauthorized: boolean;
}

export function getDashboardNavigationState(
  searchParams: SearchParamsReader
): DashboardNavigationState {
  return {
    debug: searchParams.get('debug') === 'true',
    unauthorized: searchParams.get('error') === 'unauthorized',
  };
}

export function useDashboardNavigationState(): DashboardNavigationState {
  return getDashboardNavigationState(useSearchParams());
}
