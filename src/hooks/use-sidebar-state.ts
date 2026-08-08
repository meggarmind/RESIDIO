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

function getStoredCollapsed(): boolean {
  try {
    const stored = localStorage.getItem(SIDEBAR_STORAGE_KEY);
    return stored === 'true';
  } catch { return false; }
}

export function useSidebarState(): UseSidebarStateResult {
  const [isCollapsed, setIsCollapsed] = useState(getStoredCollapsed);
  const [isHoverExpanded, setIsHoverExpanded] = useState(false);
  // Suppress the first localStorage write (which would be the initial lazy value)
  const skipSaveRef = useRef(true);

  // Save state to localStorage when it changes (writing to external store, not setting React state)
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
