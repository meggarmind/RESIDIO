# Design & Visuals Agent Instructions: The "Residio" Standard

This guide provides instructions for an AI agent to replicate and improve upon the premium, modern, and anticipatory design system found in the Residio project.

---

## 1. UI Philosophy: "Anticipatory Minimalism"

*   **Anticipatory Design**: Don't just show data; suggest actions. Components like the `SmartActionCenter` should analyze user state (e.g., unpaid invoices, day of the week) and present "just-in-time" suggestions.
*   **Minimalist Clarity**: Use whitespace as a structural element. Avoid cluttered borders; use subtle shadows or color changes to define sections.
*   **Developer-First Aesthetic**: Use clean, technical fonts (Outfit, Inter, JetBrains Mono) and structured layouts that feel precise and high-performance.

## 2. Color Strategy: OKLCH & Dynamic Theming

*   **Color Space**: Always use **OKLCH** for color definitions. It provides perceptually uniform brightness and better control over saturation across light and dark modes.
    *   *Example*: `oklch(0.63 0.17 36.44)` instead of HSL.
*   **Theme Registry**: Maintain a central registry (`tweakcn-registry.ts`) of curated themes. Each theme defines variables for both light and dark modes.
*   **Semantic Mapping**: In `globals.css`, map generic theme variables (e.g., `--primary`) to semantic UI tokens (e.g., `--color-bg-elevated`). 
*   **Dynamic Injection**: Use a `VisualThemeProvider` to inject these variables into the `:root` or `document.documentElement` at runtime, ensuring the entire UI responds instantly to theme changes.

## 3. Component Styling: Tactile Depth & Micro-animations

*   **Glassmorphism**: Use the `.glass` utility for overlay elements (sidebars, floating headers).
    ```css
    .glass {
      background: rgba(255, 255, 255, 0.7);
      backdrop-filter: blur(10px);
      border: 1px solid rgba(255, 255, 255, 0.2);
    }
    ```
*   **Tactile Feedback**:
    *   **Lift**: Use `.btn-hover-lift` or `.card-hover-modern` to make elements feel interactive on hover.
    *   **Pressed-in**: Use `.input-tactile` with inner shadows to give form elements physical depth.
*   **Micro-animations**:
    *   Use **Framer Motion** for staggered entrance animations in lists (`popLayout` mode).
    *   Implement subtle `layoutId` transitions when moving elements between containers.
    *   Use `.animate-pulse-soft` for background urgency or status indicators.

## 4. Specific to Shadcn & Tailwind

*   **Style**: Use the **"New-York"** Shadcn style for a more polished, compact look.
*   **Iconography**: Standardize on **Lucide Icons**. Use `IconBox` wrappers with soft background colors (e.g., `bg-chart-1/10`) to provide visual anchors.
*   **Utility Wrappers**: Don't use raw Shadcn components directly in pages. Wrap them in semantic layout components (e.g., `EnhancedPageHeader`, `QuickActionsMenu`) to maintain consistency.
*   **Layout System**: Define a tiered layout system (e.g., `.layout-container`, `.layout-section-gap`) controlled by CSS variables that adjust based on device or layout mode (Compact vs. Expanded).

## 5. Apple Design Philosophy Applied to Web

Replicate the "Premium Feel" by adhering to these core Apple principles:

*   **Deference**: The UI should never compete with content. Use subtle borders (`--border-subtle`) and high contrast for text.
*   **Clarity**:
    *   Use bold, clear headers (`text-4xl` with `-0.025em` tracking).
    *   Ensure perfect legibility in both light and dark modes using the OKLCH system.
*   **Depth**:
    *   Use hierarchical shadows: `.shadow-soft` for cards, `.shadow-elevated` for modals/popovers.
    *   Use `AnimatePresence` for components to "slide in/out" of existence, giving a sense of spatial permanence.
*   **Contextual Intelligence**: The UI should "know" what the user needs. (e.g., the `SmartActionCenter` suggesting a "Cleaner Code" on Friday mornings).

---

## Technical Implementation Snippet for New Projects

When starting a new project, ensure `globals.css` includes these premium utilities:

```css
/* Premium Lift & Shadow */
.card-hover-modern {
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}
.card-hover-modern:hover {
  transform: translateY(-4px);
  box-shadow: 0 12px 24px -8px rgba(var(--primary-rgb), 0.15);
}

/* Staggered List Logic */
.stagger-1 { animation-delay: 50ms; }
.stagger-2 { animation-delay: 100ms; }
...
```

Use these instructions to ensure every new component feels **polished, responsive, and alive**.
