/**
 * Dynamic Font Loader for tweakcn Themes
 *
 * This module handles dynamic loading of Google Fonts specified by themes.
 * It manages font loading lifecycle, prevents duplicate loads, and provides
 * fallbacks to system fonts.
 *
 * IMPORTANT: Only load fonts from trusted sources (Google Fonts).
 */

/**
 * Cache of loaded font families to prevent duplicate loads
 */
const loadedFonts = new Set<string>();

/**
 * Map of font families to their Google Fonts URLs
 * Pre-computed for better performance
 */
const GOOGLE_FONTS_URLS: Record<string, string> = {
  // Outfit (Supabase, Retro Arcade)
  Outfit:
    'https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700&display=swap',

  // Oxanium (Doom-64)
  Oxanium:
    'https://fonts.googleapis.com/css2?family=Oxanium:wght@300;400;500;600;700;800&display=swap',

  // Montserrat (Catppuccin)
  Montserrat:
    'https://fonts.googleapis.com/css2?family=Montserrat:wght@300;400;500;600;700&display=swap',

  // Poppins (Elegant Luxury)
  Poppins:
    'https://fonts.googleapis.com/css2?family=Poppins:wght@300;400;500;600;700&display=swap',

  // Inter (Tangerine)
  Inter:
    'https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap',

  // DM Sans (Ocean Breeze)
  'DM Sans':
    'https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700&display=swap',

  // Plus Jakarta Sans (Northern Lights)
  'Plus Jakarta Sans':
    'https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@300;400;500;600;700&display=swap',

  // Open Sans (Twitter)
  'Open Sans':
    'https://fonts.googleapis.com/css2?family=Open+Sans:wght@300;400;500;600;700&display=swap',

  // Serif fonts
  'Libre Baskerville':
    'https://fonts.googleapis.com/css2?family=Libre+Baskerville:wght@400;700&display=swap',
  'Source Serif 4':
    'https://fonts.googleapis.com/css2?family=Source+Serif+4:wght@300;400;500;600;700&display=swap',
  Lora: 'https://fonts.googleapis.com/css2?family=Lora:wght@400;500;600;700&display=swap',
  Georgia: '', // System font, no load needed

  // Mono fonts
  'Fira Code':
    'https://fonts.googleapis.com/css2?family=Fira+Code:wght@300;400;500;600;700&display=swap',
  'Space Mono':
    'https://fonts.googleapis.com/css2?family=Space+Mono:wght@400;700&display=swap',
};

/**
 * System font fallbacks (no loading required)
 */
const SYSTEM_FONTS = new Set([
  'ui-sans-serif',
  'system-ui',
  'sans-serif',
  'ui-monospace',
  'SFMono-Regular',
  'Menlo',
  'Monaco',
  'Consolas',
  'monospace',
  'ui-serif',
  'Georgia',
  'Cambria',
  'Times New Roman',
  'Times',
  'serif',
]);

/**
 * Extract font family name from font-family CSS value
 * @param fontFamily - CSS font-family string (e.g., "Outfit, ui-sans-serif, system-ui")
 * @returns Primary font name or null if system font
 * @example
 * extractPrimaryFont("Outfit, ui-sans-serif, system-ui") // "Outfit"
 * extractPrimaryFont("ui-sans-serif, system-ui") // null (system font)
 */
export function extractPrimaryFont(fontFamily: string): string | null {
  const fonts = fontFamily.split(',').map((f) => f.trim().replace(/['"]/g, ''));
  const primaryFont = fonts[0];

  // Check if it's a system font
  if (SYSTEM_FONTS.has(primaryFont)) {
    return null;
  }

  return primaryFont;
}

/**
 * Load a Google Font dynamically
 * @param fontFamily - Font family name (e.g., "Outfit", "Montserrat")
 * @returns Promise that resolves when font is loaded (or immediately if already loaded)
 */
export async function loadGoogleFont(fontFamily: string): Promise<void> {
  // Skip if already loaded
  if (loadedFonts.has(fontFamily)) {
    return;
  }

  // Skip if system font
  if (SYSTEM_FONTS.has(fontFamily)) {
    return;
  }

  // Get pre-configured URL
  const fontUrl = GOOGLE_FONTS_URLS[fontFamily];

  if (!fontUrl) {
    console.warn(`[loadGoogleFont] No URL configured for font: ${fontFamily}`);
    return;
  }

  // Check if link already exists in DOM (prevent duplicates across SSR/CSR)
  const existingLink = document.querySelector(`link[href="${fontUrl}"]`);
  if (existingLink) {
    loadedFonts.add(fontFamily);
    return;
  }

  return new Promise((resolve, reject) => {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = fontUrl;

    link.onload = () => {
      loadedFonts.add(fontFamily);
      console.log(`[loadGoogleFont] Loaded: ${fontFamily}`);
      resolve();
    };

    link.onerror = () => {
      console.error(`[loadGoogleFont] Failed to load: ${fontFamily}`);
      reject(new Error(`Failed to load font: ${fontFamily}`));
    };

    document.head.appendChild(link);
  });
}

/**
 * Load fonts for a theme
 * @param fontSans - Sans-serif font family
 * @param fontMono - Monospace font family (optional)
 * @param fontSerif - Serif font family (optional)
 */
export async function loadThemeFonts(
  fontSans: string,
  fontMono?: string,
  fontSerif?: string
): Promise<void> {
  const fontsToLoad: string[] = [];

  // Extract primary fonts
  const sansPrimary = extractPrimaryFont(fontSans);
  if (sansPrimary) fontsToLoad.push(sansPrimary);

  if (fontMono) {
    const monoPrimary = extractPrimaryFont(fontMono);
    if (monoPrimary) fontsToLoad.push(monoPrimary);
  }

  if (fontSerif) {
    const serifPrimary = extractPrimaryFont(fontSerif);
    if (serifPrimary) fontsToLoad.push(serifPrimary);
  }

  // Load all fonts in parallel
  await Promise.all(fontsToLoad.map((font) => loadGoogleFont(font)));
}

/**
 * Preload fonts for initial page render
 * Call this in root layout or app entry point
 */
export function preloadDefaultFonts(): void {
  // Preload Supabase theme fonts (default theme)
  loadGoogleFont('Outfit').catch(() => {
    // Silent fail - will fall back to system fonts
  });
}

/**
 * Clear font cache (useful for testing)
 */
export function clearFontCache(): void {
  loadedFonts.clear();
}

/**
 * Get list of loaded fonts
 */
export function getLoadedFonts(): string[] {
  return Array.from(loadedFonts);
}

/**
 * Check if a font is loaded
 */
export function isFontLoaded(fontFamily: string): boolean {
  return loadedFonts.has(fontFamily);
}
