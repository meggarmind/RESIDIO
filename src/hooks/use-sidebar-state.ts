'use client';

import { useState, useRef } from 'react';

const SIDEBAR_STORAGE_KEY = 'residio-sidebar-collapsed';

export interface UseSidebarStateResult {
  isCollapsed: boolean;
  isHoverExpanded: boolean;
  toggleCollapsed: () => void;
  setHoverExpanded: (expanded: boolean) => void;
  isExpanded: boolean;
}

export function useSidebarState(): UseSidebarStateResult {
  const [isCollapsed, setIsCollapsed] = useState(() => {
    try {
      return localStorage.getItem(SIDEBAR_STORAGE_KEY) === 'true';
    } catch {
      return false;
    }
  });
  const [isHoverExpanded, setIsHoverExpanded] = useState(false);
  const isCollapsedRef = useRef(isCollapsed);

  const toggleCollapsed = () => {
    const nextCollapsed = !isCollapsedRef.current;
    isCollapsedRef.current = nextCollapsed;
    setIsCollapsed(nextCollapsed);
    try { localStorage.setItem(SIDEBAR_STORAGE_KEY, String(nextCollapsed)); }
    catch (error) { console.warn('Failed to save sidebar state:', error); }
    setIsHoverExpanded(false);
  };

  const setHoverExpanded = (expanded: boolean) => setIsHoverExpanded(expanded);
  const isExpanded = !isCollapsed || isHoverExpanded;

  return { isCollapsed, isHoverExpanded, toggleCollapsed, setHoverExpanded, isExpanded };
}
