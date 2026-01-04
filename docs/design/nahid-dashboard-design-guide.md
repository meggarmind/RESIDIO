# Bill Analytics Dashboard - UI Design Specification Guide

## Overview
This document provides a comprehensive design specification for recreating the Bill analytics and billing management dashboard. The design features a clean, professional SaaS aesthetic with a white sidebar, card-based content layout, and extensive data visualization components. **This guide includes specifications for both Light Mode and Dark Mode, plus a theme switcher component.**

---

## 1. Layout Structure

### Overall Container
- **Layout**: Full viewport height and width
- **Structure**: Fixed sidebar + scrollable main content
- **Background**: Off-white/light gray (`#F8F9FA`) for light mode

### Grid Layout
```
┌──────────────────────────────────────────────────────────────────────┐
│  ┌─────────────┬──────────────────────────────────────────────────┐  │
│  │             │  TOP BAR (Search + User Profile)                 │  │
│  │   SIDEBAR   ├──────────────────────────────────────────────────┤  │
│  │   (~180px)  │                                                  │  │
│  │   Fixed     │           MAIN CONTENT (Scrollable)              │  │
│  │             │                                                  │  │
│  │             │                                                  │  │
│  └─────────────┴──────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────────┘
```

### Content Sections (Top to Bottom)
1. Stats Cards Row (3 cards)
2. Analytics Charts Row (User Retention + ARPU)
3. Billing Cycle Data (Full width area chart)
4. Payment Transactions + Refund Requests (2 columns)
5. MRR + ARR Calculation Charts (2 columns)
6. Impact on Revenue (Full width stacked bar)

---

## 2. Color Palette

### Light Mode Colors

#### Base Colors
| Color Name | Hex Code | Usage |
|------------|----------|-------|
| White | `#FFFFFF` | Cards, sidebar background |
| Off-White | `#F8F9FA` | Main content background |
| Light Gray | `#F3F4F6` | Hover states, subtle backgrounds |
| Border Gray | `#E5E7EB` | Card borders, dividers |

#### Text Colors (Light Mode)
| Usage | Hex Code |
|-------|----------|
| Primary text | `#111827` |
| Secondary text | `#6B7280` |
| Muted/Label text | `#9CA3AF` |
| Disabled text | `#D1D5DB` |

#### Accent Colors
| Color Name | Hex Code | Usage |
|------------|----------|-------|
| Primary Black | `#111827` | Active nav, buttons |
| Mint Green | `#86EFAC` | Bar charts, positive indicators |
| Lavender Purple | `#C4B5FD` | Bar charts, secondary data |
| Coral/Salmon | `#FDA4AF` | Churn rate, negative indicators |
| Teal | `#5EEAD4` | Customer retention, positive trends |
| Orange | `#FDBA74` | ARR charts, warning states |
| Yellow/Gold | `#FDE047` | Highlight data points |
| Green (Success) | `#22C55E` | Successful status |
| Red (Error) | `#EF4444` | Failed status |

### Dark Mode Colors

#### Base Colors
| Color Name | Hex Code | Usage |
|------------|----------|-------|
| Dark Background | `#0F172A` | Main content background |
| Dark Card | `#1E293B` | Card backgrounds |
| Dark Sidebar | `#111827` | Sidebar background |
| Dark Border | `#334155` | Card borders, dividers |
| Dark Hover | `#374151` | Hover states |

#### Text Colors (Dark Mode)
| Usage | Hex Code |
|-------|----------|
| Primary text | `#F9FAFB` |
| Secondary text | `#9CA3AF` |
| Muted/Label text | `#6B7280` |
| Disabled text | `#4B5563` |

#### Accent Colors (Same for both modes)
Accent colors remain consistent but may need slight brightness adjustments in dark mode for better visibility.

### Chart Color Palette
| Color | Hex Code | Usage |
|-------|----------|-------|
| Mint Green | `#86EFAC` | Primary bar color, positive |
| Lavender | `#C4B5FD` | Secondary bar color |
| Coral | `#FDA4AF` | Tertiary/negative data |
| Teal | `#5EEAD4` | Line charts (retention) |
| Orange | `#FDBA74` | ARR data |
| Yellow | `#FDE047` | Highlights |
| Blue | `#93C5FD` | Additional data series |

---

## 3. Typography

### Font Family
- **Primary**: Inter, -apple-system, BlinkMacSystemFont, sans-serif
- **Monospace** (numbers): 'SF Mono', 'Fira Code', monospace (optional for large numbers)

### Font Specifications
| Element | Size | Weight | Line Height | Letter Spacing |
|---------|------|--------|-------------|----------------|
| Logo "Bill" | 24px | 700 | 1.2 | -0.02em |
| Page Title "Dashboard" | 28px | 700 | 1.3 | -0.02em |
| Large Stat Numbers | 32-36px | 700 | 1.1 | -0.01em |
| Card Titles | 16px | 600 | 1.4 | 0 |
| Section Headers | 18px | 600 | 1.4 | 0 |
| Body Text | 14px | 400 | 1.5 | 0 |
| Small Labels | 12px | 500 | 1.4 | 0.02em |
| Chart Labels | 11px | 400 | 1.3 | 0 |
| Nav Items | 14px | 500 | 1.5 | 0 |

---

## 4. Component Specifications

### 4.1 Sidebar Navigation

**Container**
- Width: 180px
- Background: White (light) / `#111827` (dark)
- Border-right: 1px solid `#E5E7EB` (light) / `#334155` (dark)
- Padding: 24px 16px
- Position: Fixed, full height

**Logo Section**
- Icon: Diamond/gem shape, black (light) / white (dark)
- Text: "Bill" - 24px, bold
- Margin-bottom: 32px

**Navigation Items**
```
Structure per item:
┌────────────────────────┐
│ [Icon]  Label Text     │
└────────────────────────┘
```
- Icon size: 18px
- Gap: 12px
- Padding: 10px 14px
- Border-radius: 8px
- Font: 14px, medium (500)

**Navigation States**
| State | Light Mode | Dark Mode |
|-------|------------|-----------|
| Default | Gray icon + text (`#6B7280`) | Gray (`#9CA3AF`) |
| Hover | Darker gray + light bg | Lighter + dark bg |
| Active | Black text, `#111827` bg | White text, `#374151` bg |

**Navigation Items List**
1. Dashboard (grid icon) - **Active**
2. Analytics (pie chart icon)
3. Transaction (arrows up/down icon)
4. Reports (document icon)
5. Calendar (calendar icon)
6. Chat (message icon)
7. Settings (gear icon)

**Footer**
- "© 2023 All Rights Reserved."
- Position: Bottom of sidebar
- Font: 11px, gray (`#9CA3AF`)

### 4.2 Top Bar / Header

**Container**
- Height: 64px
- Background: Transparent (inherits content bg)
- Padding: 0 24px
- Display: Flex, space-between, align-center

**Search Bar**
- Width: 300px
- Height: 40px
- Background: White (light) / `#1E293B` (dark)
- Border: 1px solid `#E5E7EB` (light) / `#334155` (dark)
- Border-radius: 8px
- Placeholder: "Search here"
- Icon: Magnifying glass, 18px, left side
- Padding-left: 40px

**Right Section**
- Notification bell icon (18px)
- User avatar (36px circle)
- User name: "Md Sahin Mia" - 14px, medium
- Gap between elements: 16px

### 4.3 Stats Cards Row

Three cards in horizontal layout.

**Card Layout**
```
┌─────────────────────────────────────┐
│  [Icon]                             │
│                                     │
│  Label Text                         │
│  $XXX,XXX                           │
│                                     │
│  [Bar Chart]            [Badge]     │
└─────────────────────────────────────┘
```

**Card Styling**
| Property | Light Mode | Dark Mode |
|----------|------------|-----------|
| Background | `#FFFFFF` | `#1E293B` |
| Border | 1px solid `#E5E7EB` | 1px solid `#334155` |
| Border-radius | 16px | 16px |
| Padding | 20px | 20px |
| Shadow | `0 1px 3px rgba(0,0,0,0.05)` | none |

**Card 1: Total Revenue**
- Icon: Credit card (outlined)
- Label: "Total Revenue" - Gray, 14px
- Value: "$410,6547" - Black, 32px, bold
- Mini chart: 7 bars (mint + lavender alternating)
- Badge: "15%" with copy icon - Bottom right

**Card 2: New Subscriptions (Featured/Dark)**
- Background: `#111827` (always dark in both modes)
- Icon: User silhouette (white)
- Label: "New Subscriptions" - White, 14px
- Value: "10,245" - White, 32px, bold
- Mini chart: 7 bars (mint + pink + lavender)
- Badge: "10%" - white badge
- Border: 2px solid `#22C55E` (green outline)

**Card 3: Renewal Revenue**
- Icon: Stack/layers icon
- Label: "Renewal Revenue"
- Value: "$245,3641"
- Mini chart: 7 bars (mint + lavender)
- Badge: "08%"

**Mini Bar Charts in Cards**
- Bar width: 8px
- Bar gap: 4px
- Heights vary: 40-100% of container (60px max)
- Border-radius: 4px top
- Colors alternate between mint and lavender

**Percentage Badge**
- Background: `#111827` (light) / `#374151` (dark)
- Text: White, 11px
- Padding: 4px 8px
- Border-radius: 12px
- Icon: Small copy/duplicate icon

### 4.4 User Retention Chart Card

**Card Container**
- Background: White / Dark card
- Border-radius: 16px
- Padding: 24px

**Header**
- Title: "User retention" - 18px, semibold
- Dropdown: "Monthly ∨" - Right aligned

**Metrics Row**
| Metric | Label | Value | Color |
|--------|-------|-------|-------|
| Churn Rate | "Churn Rate" | "38%" | Coral `#FDA4AF` |
| Customer Retention Rate | "Customer Retention Rate" | "96%" | Teal `#5EEAD4` |

**Line Chart**
- Y-axis: 0% to 100% (20% increments)
- X-axis: Jan through Dec
- Two lines: Churn (coral) and Retention (teal)
- Line style: Smooth curves (bezier)
- Line width: 2px
- Grid lines: Horizontal only, light gray dashed

### 4.5 Average Revenue Per User Chart Card

**Header**
- Title: "Average Revenue Per User"
- Dropdown: "Monthly ∨"

**Metrics Row**
| Metric | Label | Value | Color |
|--------|-------|-------|-------|
| Revenue Earned per User | "Revenue Earned per User" | "$198" | Green `#22C55E` |
| ARPU Trends | "ARPU Trends" | "$44" | Orange `#FDBA74` |

**Line Chart**
- Y-axis: $0 to $200 ($40 increments)
- X-axis: Jan through Dec
- Two lines: Revenue (green) and Trends (orange)
- Similar styling to retention chart

### 4.6 Billing Cycle Data Card

**Full-width Card**
- Spans entire content width

**Header**
- Title: "Billing Cycle Data"
- Time filter pills: "Annually" | "Quarterly" | "Monthly" (selected)
- Selected pill: Black bg, white text, rounded

**Subtitle**
- "Maximum Number of Active Subscriptions Per Billing Cycle"
- Value highlight: "1130" in green

**Area Chart**
- Y-axis: 0 to 1200 (200 increments)
- X-axis: Jan through Dec
- Fill: Gradient from yellow-green (#E2E8A3) to transparent
- Line: Smooth curve, same color
- Grid: Horizontal lines only

### 4.7 Payment Transactions Table

**Card Container**
- Width: ~60% of content area
- Standard card styling

**Header**
- Title: "Payment Transactions"
- Dropdown: "Monthly ∨"

**Table Structure**
| Column | Content |
|--------|---------|
| Payment From | Avatar + Name + "Commodity" label |
| Date | e.g., "10/9/2023" |
| Quantity | e.g., "$1200" |
| Status | "Successful" or "Failed" |

**Avatar Styling**
- Size: 32px circle
- Random background colors for each user

**Status Indicators**
- Successful: Green dot + green text
- Failed: Red dot + red text
- Dot size: 6px

**Sample Data**
| Name | Date | Amount | Status |
|------|------|--------|--------|
| Jack Mahir | 10/9/2023 | $1200 | Successful |
| Francis Frank | 10/9/2023 | $900 | Failed |
| Lucile Young | 10/9/2023 | $2000 | Successful |
| Alina Smith | 10/9/2023 | $500 | Failed |
| Nicholas Smith | 10/9/2023 | $2500 | Successful |
| Joseph Rust | 10/9/2023 | $1500 | Failed |

### 4.8 Refund Requests Chart

**Card Container**
- Width: ~40% of content area

**Header**
- Title: "Refund Requests"
- Dropdown: "Monthly ∨"

**Scatter/Dot Chart**
- Y-axis: 0% to 30% (5% increments)
- X-axis: 10 to 60 (10 increments)
- Dots: Orange color (`#FDBA74`)
- Dot size: 8px
- Connected with light line

### 4.9 MRR Calculation Chart

**Header**
- Title: "MRR Calculation"
- Dropdown: "Monthly ∨"
- Subtitle: "The Visualization Shows Total **Monthly** MRR January 2023 to November 2023"
- Bold keyword styling

**Bar Chart**
- Y-axis: $10,000 to $60,000
- X-axis: Jan, Mar, May, Jul, Sep, Nov (bi-monthly)
- Bar style: Gradient from purple (#C4B5FD) at top to mint (#86EFAC) at bottom
- Bar width: 40px
- Border-radius: 8px top
- Highest bar (Nov): ~$50,000 with "30M" label

### 4.10 ARR Calculation Chart

**Header**
- Title: "ARR Calculation"
- Dropdown: "Annually ∨"
- Subtitle: "The Visualization Shows Total **Annually** MRR 2018 to 2023"

**Bar Chart**
- Y-axis: 5M to 30M
- X-axis: 2018 through 2023
- Bar colors: Orange gradient to yellow
- Shows growth pattern peaking in 2020, then varying

### 4.11 Impact on Revenue Chart

**Full-width Card**

**Header**
- Title: "Impact on Revenue"
- Time filter pills: "Annually" (selected) | "Quarterly" | "Monthly"

**Metrics Row**
| Metric | Value | Color |
|--------|-------|-------|
| Average | $324,2564 | Green |
| Upgrades | 30,124 | Teal |
| Downgrades | 20,214 | Coral |

**Stacked Bar Chart**
- Y-axis: 10M to 60M
- X-axis: Jan 2023 through Dec 2023
- Three segments per bar:
  - Bottom: Coral/Pink (`#FDA4AF`)
  - Middle: Purple (`#C4B5FD`)
  - Top: Mint (`#86EFAC`)
- Bar width: 50px
- Gap: 16px
- Border-radius: 4px

---

## 5. Theme Switcher Component

### Location
Place in the top bar, before the notification bell, OR in the Settings page.

### Design Specification

**Segmented Control Style**
```
┌─────────────────────────────────────┐
│  [☀️]  │  [🌙]  │  [💻]           │
│  Light │  Dark  │  System          │
└─────────────────────────────────────┘
```

**Dimensions**
- Total width: 180px
- Height: 36px
- Border-radius: 8px

**Styling (Light Mode)**
- Container bg: `#F3F4F6`
- Active segment bg: `#FFFFFF`
- Active segment shadow: `0 1px 2px rgba(0,0,0,0.1)`
- Icon size: 16px
- Text: 12px, medium

**Styling (Dark Mode)**
- Container bg: `#374151`
- Active segment bg: `#1E293B`

**Icons**
- Light: Sun icon (☀️ or Heroicon sun)
- Dark: Moon icon (🌙 or Heroicon moon)
- System: Desktop/monitor icon (💻 or Heroicon computer-desktop)

**Alternative: Dropdown Style**
```
┌──────────────────┐
│ 🌓 Theme    ∨   │
├──────────────────┤
│ ☀️ Light        │
│ 🌙 Dark         │
│ 💻 System       │
└──────────────────┘
```

### Implementation Notes
```javascript
// Theme options
const themes = ['light', 'dark', 'system'];

// CSS Variables approach
:root {
  --bg-primary: #FFFFFF;
  --bg-secondary: #F8F9FA;
  --text-primary: #111827;
  // ... more variables
}

[data-theme="dark"] {
  --bg-primary: #1E293B;
  --bg-secondary: #0F172A;
  --text-primary: #F9FAFB;
  // ... dark overrides
}

// System preference detection
@media (prefers-color-scheme: dark) {
  [data-theme="system"] {
    // Apply dark mode variables
  }
}
```

---

## 6. Complete Dark Mode Token Mapping

| Light Mode | Dark Mode | Usage |
|------------|-----------|-------|
| `#FFFFFF` | `#1E293B` | Card backgrounds |
| `#F8F9FA` | `#0F172A` | Page background |
| `#F3F4F6` | `#374151` | Hover, subtle bg |
| `#E5E7EB` | `#334155` | Borders |
| `#D1D5DB` | `#4B5563` | Disabled states |
| `#111827` | `#F9FAFB` | Primary text |
| `#6B7280` | `#9CA3AF` | Secondary text |
| `#9CA3AF` | `#6B7280` | Muted text |

---

## 7. Iconography

### Icon Style
- Style: Outlined/Linear
- Stroke width: 1.5px
- Size: 18-20px for navigation
- Size: 16px for inline icons

### Required Icons
| Icon | Usage |
|------|-------|
| Diamond/Gem | Logo |
| Grid (4 squares) | Dashboard |
| Pie chart | Analytics |
| Arrows up/down | Transaction |
| Document | Reports |
| Calendar | Calendar |
| Chat bubble | Chat |
| Gear | Settings |
| Search | Search bar |
| Bell | Notifications |
| User | Profile avatar |
| Credit card | Total revenue |
| User silhouette | Subscriptions |
| Stack/layers | Renewal |
| Chevron down | Dropdowns |
| Copy | Badge icon |
| Sun | Light mode |
| Moon | Dark mode |
| Monitor | System theme |

### Recommended Libraries
- Heroicons (v2)
- Lucide Icons
- Feather Icons

---

## 8. Spacing System

Base unit: 4px

| Token | Value | Usage |
|-------|-------|-------|
| `space-1` | 4px | Tight spacing |
| `space-2` | 8px | Icon gaps |
| `space-3` | 12px | Small padding |
| `space-4` | 16px | Standard gap |
| `space-5` | 20px | Card padding |
| `space-6` | 24px | Section spacing |
| `space-8` | 32px | Large gaps |
| `space-10` | 40px | Section margins |

---

## 9. Border Radius

| Element | Radius |
|---------|--------|
| Cards | 16px |
| Buttons | 8px |
| Input fields | 8px |
| Pills/Badges | 12-16px (full) |
| Avatars | 50% (circle) |
| Chart bars | 4-8px (top only) |
| Theme switcher | 8px |
| Dropdowns | 8px |

---

## 10. Shadows

### Light Mode
| Type | Value |
|------|-------|
| Card | `0 1px 3px rgba(0,0,0,0.05)` |
| Elevated | `0 4px 6px rgba(0,0,0,0.07)` |
| Dropdown | `0 10px 25px rgba(0,0,0,0.1)` |

### Dark Mode
| Type | Value |
|------|-------|
| Card | `0 1px 3px rgba(0,0,0,0.3)` |
| Elevated | `0 4px 6px rgba(0,0,0,0.4)` |
| Dropdown | `0 10px 25px rgba(0,0,0,0.5)` |

---

## 11. Interactive States

### Buttons/Pills
| State | Light Mode | Dark Mode |
|-------|------------|-----------|
| Default | Transparent | Transparent |
| Hover | `#F3F4F6` | `#374151` |
| Active | `#111827` + white text | `#374151` + white text |
| Selected | `#111827` bg | `#4B5563` bg |

### Cards
| State | Light Mode | Dark Mode |
|-------|------------|-----------|
| Default | White bg | `#1E293B` bg |
| Hover | Subtle shadow increase | Slight brightness |

### Table Rows
| State | Light Mode | Dark Mode |
|-------|------------|-----------|
| Default | Transparent | Transparent |
| Hover | `#F9FAFB` | `#374151` |
| Selected | `#F3F4F6` | `#4B5563` |

---

## 12. Chart Configurations

### Line Charts
```javascript
{
  type: 'line',
  options: {
    tension: 0.4, // Smooth curves
    pointRadius: 0, // Hide points by default
    pointHoverRadius: 6,
    borderWidth: 2,
  }
}
```

### Bar Charts
```javascript
{
  type: 'bar',
  options: {
    borderRadius: 8,
    borderSkipped: false, // Round all corners
    barThickness: 40,
    categoryPercentage: 0.8,
  }
}
```

### Area Charts
```javascript
{
  type: 'line',
  options: {
    fill: true,
    backgroundColor: 'gradient', // Use gradient
    tension: 0.4,
  }
}
```

### Stacked Bar
```javascript
{
  type: 'bar',
  options: {
    stacked: true,
    borderRadius: 4,
  }
}
```

---

## 13. Responsive Breakpoints

| Name | Width | Adjustments |
|------|-------|-------------|
| Mobile | < 640px | Sidebar hidden, single column |
| Tablet | 640px - 1024px | Sidebar collapsible, 2 columns |
| Desktop | > 1024px | Full layout as designed |

### Mobile Adaptations
- Sidebar becomes bottom navigation or hamburger menu
- Stats cards stack vertically (1 per row)
- Charts become full width
- Tables become card lists
- Theme switcher moves to hamburger menu

---

## 14. Animation Guidelines

### Transitions
- Duration: 200ms for interactions, 300ms for theme switch
- Easing: `cubic-bezier(0.4, 0, 0.2, 1)`

### Theme Transition
```css
* {
  transition: background-color 300ms ease,
              border-color 300ms ease,
              color 200ms ease;
}
```

### Chart Animations
- Bar charts: Grow from bottom, 500ms stagger
- Line charts: Draw from left, 800ms
- Numbers: Count up animation, 600ms

---

## 15. Implementation Tech Stack

### Recommended
- **Framework**: Next.js 14+ or React 18+
- **Styling**: Tailwind CSS with CSS variables for theming
- **Charts**: Recharts or Chart.js
- **Icons**: Heroicons or Lucide React
- **Theme**: next-themes or custom context

### Tailwind Config
```javascript
// tailwind.config.js
module.exports = {
  darkMode: 'class', // or 'media' for system
  theme: {
    extend: {
      colors: {
        // Light mode
        'bill-bg': 'var(--bg-primary)',
        'bill-card': 'var(--bg-card)',
        'bill-text': 'var(--text-primary)',
        // Chart colors
        'bill-mint': '#86EFAC',
        'bill-lavender': '#C4B5FD',
        'bill-coral': '#FDA4AF',
        'bill-teal': '#5EEAD4',
        'bill-orange': '#FDBA74',
      }
    }
  }
}
```

---

## 16. Component Hierarchy

```
<App>
  <ThemeProvider>
    <Layout>
      <Sidebar>
        <Logo />
        <NavItem /> (×7)
        <Footer />
      </Sidebar>
      <MainContent>
        <TopBar>
          <SearchBar />
          <ThemeSwitcher />
          <NotificationBell />
          <UserProfile />
        </TopBar>
        <PageTitle />
        <StatsCardsRow>
          <StatCard /> (×3)
        </StatsCardsRow>
        <ChartsRow>
          <UserRetentionChart />
          <ARPUChart />
        </ChartsRow>
        <BillingCycleChart />
        <TransactionsRow>
          <PaymentTransactionsTable />
          <RefundRequestsChart />
        </TransactionsRow>
        <RevenueChartsRow>
          <MRRChart />
          <ARRChart />
        </RevenueChartsRow>
        <ImpactOnRevenueChart />
      </MainContent>
    </Layout>
  </ThemeProvider>
</App>
```

---

## 17. Key Measurements Reference

| Element | Value |
|---------|-------|
| Sidebar width | 180px |
| Top bar height | 64px |
| Content padding | 24px |
| Card gap | 20px |
| Card padding | 20px |
| Card border-radius | 16px |
| Large stat numbers | 32-36px |
| Chart heights | 200-300px |
| Avatar size | 36px |
| Icon size (nav) | 18px |
| Button height | 36-40px |

---

## 18. Data Visualization Colors Quick Reference

```css
:root {
  /* Chart palette */
  --chart-mint: #86EFAC;
  --chart-lavender: #C4B5FD;
  --chart-coral: #FDA4AF;
  --chart-teal: #5EEAD4;
  --chart-orange: #FDBA74;
  --chart-yellow: #FDE047;
  --chart-blue: #93C5FD;
  
  /* Status colors */
  --status-success: #22C55E;
  --status-error: #EF4444;
  --status-warning: #F59E0B;
}
```

---

## 19. Accessibility Checklist

- [ ] Color contrast ≥ 4.5:1 for all text
- [ ] Focus visible states on all interactive elements
- [ ] Keyboard navigation throughout
- [ ] ARIA labels for icon-only buttons
- [ ] Chart data available in accessible table format
- [ ] Theme preference persisted in localStorage
- [ ] Respects `prefers-reduced-motion`
- [ ] Screen reader announces theme changes

---

## 20. Assets Needed

### Icons
- Logo icon (diamond/gem shape) as SVG
- All navigation icons as SVG or icon font

### Avatars
- Default avatar placeholder
- Sample user avatars (can use services like UI Faces or Boring Avatars)

### Charts
- Use chart library (Recharts recommended)
- No static image assets needed

---

*This design guide was generated from visual references. The dark mode specifications are derived from the light mode design following modern dark UI patterns. Exact values may require fine-tuning during implementation.*
