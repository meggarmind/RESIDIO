import { TWEAKCN_THEME_REGISTRY } from '@/lib/themes/tweakcn-registry';
import { TweakcnTheme } from '@/types/theme';

/**
 * Blocking script to prevent Flash of Unstyled Content (FOUC)
 * This script runs immediately before the page renders and applies the theme
 * from sessionStorage or defaults if not found.
 */
export function ThemeScript({ context }: { context: 'admin-dashboard' | 'resident-portal' }) {
  // Serialize only the essential theme data to keep the script small
  const themeData = Object.entries(TWEAKCN_THEME_REGISTRY).reduce((acc, [id, theme]: [string, TweakcnTheme]) => {
    acc[id] = {
      light: theme.cssVars.light,
      dark: theme.cssVars.dark,
      theme: theme.cssVars.theme,
    };
    return acc;
  }, {} as any);

  const script = `
    (function() {
      try {
        var themeData = ${JSON.stringify(themeData)};
        var context = "${context}";
        var storageKey = "residio-visual-theme-" + context;
        var themeId = sessionStorage.getItem(storageKey) || "supabase";
        var theme = themeData[themeId] || themeData["supabase"];
        
        // Determine mode (light/dark)
        var mode = localStorage.getItem("theme");
        var systemDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
        var isDark = mode === "dark" || (!mode && systemDark);
        
        var colors = isDark ? theme.dark : theme.light;
        var root = document.documentElement;
        
        // Apply variables
        Object.keys(colors).forEach(function(key) {
          root.style.setProperty("--" + key, colors[key]);
        });
        
        // Apply shared theme vars
        var themeVars = theme.theme;
        Object.keys(themeVars).forEach(function(key) {
          root.style.setProperty("--" + key, themeVars[key]);
        });
        
        // Legacy variable mappings (sync with visual-theme-context.tsx)
        root.style.setProperty('--bg-primary', colors.background);
        root.style.setProperty('--bg-secondary', colors.muted);
        root.style.setProperty('--bg-card', colors.card);
        root.style.setProperty('--bg-sidebar', colors.sidebar || colors.card);
        root.style.setProperty('--bg-elevated', colors.popover);
        root.style.setProperty('--bg-hover', colors.accent);
        root.style.setProperty('--bg-active', colors.primary);
        root.style.setProperty('--text-primary', colors.foreground);
        root.style.setProperty('--text-secondary', colors['muted-foreground']);
        root.style.setProperty('--text-muted', colors['muted-foreground']);
        root.style.setProperty('--accent-primary', colors.primary);
        root.style.setProperty('--accent-secondary', colors.secondary);
        root.style.setProperty('--accent-tertiary', colors.accent);
        root.style.setProperty('--border-default', colors.border);
        root.style.setProperty('--border-subtle', colors.border);
        root.style.setProperty('--input-bg', colors.background);
        root.style.setProperty('--input-border', colors.input);
        
        // Typography
        root.style.setProperty('--font-family-sans', themeVars['font-sans']);
        root.style.setProperty('--font-family-mono', themeVars['font-mono']);
        if (themeVars['font-serif']) {
          root.style.setProperty('--font-family-serif', themeVars['font-serif']);
        }
        
        root.style.setProperty('--radius', themeVars.radius);
        
      } catch (e) {
        console.error("[ThemeScript] Failed to apply theme", e);
      }
    })();
  `;

  return <script dangerouslySetInnerHTML={{ __html: script }} />;
}
