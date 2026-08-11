'use client';

import { useState, useEffect, useRef } from 'react';

const SIDEBAR_STORAGE_KEY = 'residio-sidebar-collapsed';

export interface UseSidebarStateResult {
  isCollapsed: boolean;
  isHoverExpanded: boolean;
  toggleCollapsed: () => void;
  setHoverExpanded: (expanded: boolean) => void;
  isExpanded: boolean;
}

export function useSidebarState(): UseSidebarStateResult {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isHoverExpanded, setIsHoverExpanded] = useState(false);
  const skipSaveRef = useRef(true);

  // Read persisted state after mount to avoid SSR hydration mismatch
  useEffect(() => {
    try {
      const stored = localStorage.getItem(SIDEBAR_STORAGE_KEY);
      if (stored === 'true') setIsCollapsed(true);
    } catch { /* ignore */ }
  }, []);

  // Save state to localStorage when it changes (skip the initial restore)
  useEffect(() => {
    if (skipSaveRef.current) { skipSaveRef.current = false; return; }
    try { localStorage.setItem(SIDEBAR_STORAGE_KEY, String(isCollapsed)); }
    catch (error) { console.warn('Failed to save sidebar state:', error); }
  }, [isCollapsed]);

  const toggleCollapsed = () => {
    setIsCollapsed((prev) => !prev);
    setIsHoverExpanded(false);
  };

  const setHoverExpanded = (expanded: boolean) => setIsHoverExpanded(expanded);
  const isExpanded = !isCollapsed || isHoverExpanded;

  return { isCollapsed, isHoverExpanded, toggleCollapsed, setHoverExpanded, isExpanded };
}
