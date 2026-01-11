'use client';

import { useState, useEffect } from 'react';

const SIDEBAR_STORAGE_KEY = 'residio-sidebar-collapsed';

export interface UseSidebarStateResult {
  /** Whether the sidebar is collapsed */
  isCollapsed: boolean;
  /** Whether the sidebar is temporarily expanded on hover */
  isHoverExpanded: boolean;
  /** Toggle collapsed state */
  toggleCollapsed: () => void;
  /** Set hover expanded state */
  setHoverExpanded: (expanded: boolean) => void;
  /** Whether sidebar is effectively showing full content */
  isExpanded: boolean;
}

/**
 * Custom hook for managing sidebar collapse/expand state
 *
 * Features:
 * - Persistent state via localStorage
 * - Hover expansion when collapsed
 * - Smooth transitions
 *
 * @returns Sidebar state and control functions
 */
export function useSidebarState(): UseSidebarStateResult {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isHoverExpanded, setIsHoverExpanded] = useState(false);
  const [mounted, setMounted] = useState(false);

  // Load state from localStorage on mount
  useEffect(() => {
    setMounted(true);
    try {
      const stored = localStorage.getItem(SIDEBAR_STORAGE_KEY);
      if (stored !== null) {
        setIsCollapsed(stored === 'true');
      }
    } catch (error) {
      console.warn('Failed to load sidebar state from localStorage:', error);
    }
  }, []);

  // Save state to localStorage when it changes
  useEffect(() => {
    if (!mounted) return;
    try {
      localStorage.setItem(SIDEBAR_STORAGE_KEY, String(isCollapsed));
    } catch (error) {
      console.warn('Failed to save sidebar state to localStorage:', error);
    }
  }, [isCollapsed, mounted]);

  const toggleCollapsed = () => {
    setIsCollapsed((prev) => !prev);
    setIsHoverExpanded(false); // Reset hover state when toggling
  };

  const setHoverExpanded = (expanded: boolean) => {
    setIsHoverExpanded(expanded);
  };

  // Sidebar is effectively expanded if it's not collapsed OR if it's hover-expanded
  const isExpanded = !isCollapsed || isHoverExpanded;

  return {
    isCollapsed,
    isHoverExpanded,
    toggleCollapsed,
    setHoverExpanded,
    isExpanded,
  };
}
