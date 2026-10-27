# Paier Dashboard - UI Design Specification Guide

## Overview
This document provides a comprehensive design specification for recreating the Paier bill management dashboard. The design follows a modern fintech aesthetic with a clean, professional look using a dark sidebar and light content area.

---

## 1. Layout Structure

### Overall Container
- **Shape**: Rounded rectangle with large border-radius (~24px)
- **Background**: Very light gray/off-white (#F5F7F9 or similar)
- **Border**: Subtle dark border (~2px, #1E2A38)
- **Shadow**: Soft drop shadow for depth
- **Padding**: Internal padding of ~24px

### Grid Layout
```
┌─────────────────────────────────────────────────────────────┐
│  ┌──────────┬────────────────────────────────────────────┐  │
│  │          │                                            │  │
│  │  SIDEBAR │            MAIN CONTENT                    │  │
│  │  (~200px)│            (flex: 1)                       │  │
│  │          │                                            │  │
│  └──────────┴────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

---

## 2. Color Palette

### Primary Colors
| Color Name | Hex Code | Usage |
|------------|----------|-------|
| Dark Navy | `#1E2A38` | Sidebar background, borders |
| Mint Green | `#4ADE80` | Primary accent, active states, success |
| Soft Green | `#22C55E` | CTA buttons, highlights |
| White | `#FFFFFF` | Card backgrounds, text on dark |
| Off-White | `#F5F7F9` | Main content background |

### Secondary/Accent Colors
| Color Name | Hex Code | Usage |
|------------|----------|-------|
| Pink/Coral | `#EC4899` | Warning badges, subscription icons |
| Green (Success) | `#22C55E` | Completed status badge |
| Yellow (Pending) | `#FEF3C7` | Processing/Queued status badge background |
| Yellow Text | `#A16207` | Processing status text |
| Gray Text | `#6B7280` | Secondary text, muted content |
| Red/Pink Alert | `#F472B6` | Overdue indicators |

### Text Colors
| Usage | Color |
|-------|-------|
| Primary text (light bg) | `#1E293B` or `#111827` |
| Secondary text | `#6B7280` |
| Muted text | `#9CA3AF` |
| Text on dark background | `#FFFFFF` |
| Text on dark (muted) | `#9CA3AF` |

---

## 3. Typography

### Font Family
- **Primary**: Inter, SF Pro Display, or similar modern sans-serif
- **Fallback**: system-ui, -apple-system, sans-serif

### Font Sizes & Weights
| Element | Size | Weight | Line Height |
|---------|------|--------|-------------|
| Logo text | 24px | 700 (Bold) | 1.2 |
| Large numbers (date) | 72px | 700 (Bold) | 1 |
| Stat numbers | 48px | 700 (Bold) | 1.2 |
| Currency amounts | 36px | 600 (Semibold) | 1.2 |
| Card titles | 18px | 600 (Semibold) | 1.4 |
| Body text | 14px | 400 (Regular) | 1.5 |
| Small/Caption | 12px | 400-500 | 1.4 |
| Nav items | 14px | 500 (Medium) | 1.5 |

---

## 4. Component Specifications

### 4.1 Sidebar Navigation

**Container**
- Width: 200px
- Background: `#1E2A38` (dark navy)
- Padding: 24px 16px
- Border-radius: 16px (left side rounded within container)

**Logo Section**
- Lightning bolt icon in mint green (`#4ADE80`)
- "Paier" text: White, 24px, bold
- Margin-bottom: 32px

**Navigation Items**
- Icon + Text layout (horizontal)
- Icon size: 20px
- Gap between icon and text: 12px
- Padding: 12px 16px
- Border-radius: 8px
- Color (default): `#9CA3AF` (muted gray)
- Color (active): White with `#4ADE80` background highlight

**Navigation Items List**
1. Home (house icon)
2. Search (magnifying glass icon)
3. Analytics (bar chart icon)
4. Payments (credit card icon)
5. Notifications (bell icon)
6. Calendar (calendar icon) - **Active state**
7. Vault (shield/fingerprint icon)
8. Profile (user icon)

**Bottom Section**
- "More" item with hamburger menu icon
- Positioned at bottom of sidebar

### 4.2 Hero Section (Date & Upcoming Bills)

**Date Display Card**
- Background: `#1E2A38` (dark navy)
- Border-radius: 16px
- Padding: 24px

**Content Layout**
```
┌────────────────────────────────────────────────────────────────┐
│ Monday     [Upcoming Bills ↓]    │ Payment Plan │  Calendar   │
│                                  │   Selector   │   Widget    │
│   12       [Dribbble Pro $60]    │              │             │
│            Last charge: date     │ ○ Personal   │  December   │
│                                  │ ● Subscript  │   [grid]    │
│ ⚠️ Check failed subscriptions   │ ○ Other      │             │
│                                  │ [Add new]    │             │
└────────────────────────────────────────────────────────────────┘
```

**"Upcoming Bills" Button**
- Background: `#22C55E` (green)
- Text: White, 14px, medium weight
- Border-radius: 24px (pill shape)
- Padding: 8px 16px
- Down arrow icon on right

**Subscription Card (Dribbble Pro)**
- App icon: Pink circle with Dribbble logo
- Title: "Dribbble Pro" - White text
- Price badge: `$60` - dark pill badge
- Subtitle: "Last charge: 16 November 2021" - muted text

**Warning Text**
- Pink/coral color (`#F472B6`)
- Small text: "Please check your failed subscriptions."

### 4.3 Payment Plan Selector

**Container**
- Background: White
- Border-radius: 12px
- Padding: 16px
- Border: 1px solid `#E5E7EB`

**Radio Options**
- Circle radio buttons (unfilled = gray border, filled = green)
- Options: "Personal Bills", "Subscriptions" (selected), "Other"
- Text: 14px, `#374151`

**Action Buttons**
- "+ Add new" button: Outlined style, dark text, rounded
- "Edit" button: Text only with edit icon

### 4.4 Calendar Widget

**Container**
- Background: `#1E2A38` (dark navy)
- Border-radius: 12px
- Padding: 16px

**Header**
- Year badge: `2022` in small pill
- Month: "December" - White, 18px, semibold
- Navigation arrows: `<` `>` in white

**Calendar Grid**
- 7 columns (Mo Tu We Th Fr Sa Su)
- Day labels: Muted gray, 12px
- Day numbers: White, 14px
- Highlighted dates: Green circle background (`#22C55E`)
- Multiple dates highlighted: 1, 9, 15, 16, 20, 28

### 4.5 Stats Cards Row

Three cards in horizontal layout with equal spacing.

**Card 1: Active Bills**
- Background: `#4ADE80` (mint green)
- Border: 1px solid `#22C55E`
- Border-radius: 16px
- Icon: Snowflake/asterisk pattern
- Title: "Active Bills" - Dark text, 16px
- Subtitle: "+3 added new" - Darker green text
- Large number: "14" - Dark, 48px, bold
- CTA Button: "Manage all" - Dark pill button

**Card 2: Monthly Pay**
- Background: White
- Border: 1px solid `#E5E7EB`
- Border-radius: 16px
- Icon: Waves/credit card icon
- Title: "Monthly Pay" - Dark text
- Subtitle: "+10%" - Gray text
- Amount: "$475.30" - Dark, 36px, semibold
- 3-dot menu icon top right

**Card 3: Overdues**
- Background: White
- Border: 1px solid `#E5E7EB`
- Border-radius: 16px
- Icon: Clock/timer icon
- Title: "Overdues" - Dark text
- Subtitle: "2 past bills + 1 failed subscription" - Pink/coral text
- Amount: "$75.50" - Dark, 36px, semibold
- 3-dot menu icon top right

### 4.6 Bills Table Section

**Header Row**
- "This week" title: 18px, semibold, dark
- "Automate" toggle switch on right (off state)

**Table Structure**
| Column | Width | Alignment |
|--------|-------|-----------|
| Company | 200px | Left |
| Billing | 100px | Left |
| Amount | 100px | Left |
| Paying for | 100px | Left |
| Plan | 120px | Left |
| Status | 100px | Left |
| Actions | 40px | Center |

**Table Styling**
- No visible borders between cells
- Row padding: 16px vertical
- Alternating row backgrounds: None (all white)
- Row hover: Subtle gray highlight

**Status Badges**
- Completed: Green background (`#D1FAE5`), green text (`#059669`)
- Processing: Yellow background (`#FEF3C7`), yellow-brown text (`#A16207`)
- Queued: Light gray background (`#F3F4F6`), gray text (`#6B7280`)
- Border-radius: 16px (pill shape)
- Padding: 4px 12px

**Company Cell**
- Logo: 32px circular
- Company name: 14px, medium weight, dark
- Horizontal layout with 12px gap

**Sample Data**
| Company | Billing | Amount | Paying for | Plan | Status |
|---------|---------|--------|------------|------|--------|
| Netflix | Today | $19.99 | 1 year | Premium | Completed |
| Dribbble | Wednesday | $12.00 | 3 months | Pro/Monthly | Processing |
| Framer | Friday | $25.00 | 2 years | Pro/Annually | Queued |

**Load More**
- "Load 11 more ↓" link at bottom
- Centered, muted gray text
- Arrow icon pointing down

---

## 5. Iconography

### Icon Style
- Style: Outlined/Linear (not filled)
- Stroke width: 1.5-2px
- Size: 20-24px for navigation, 16-20px for inline

### Required Icons
- Lightning bolt (logo)
- Home
- Search (magnifying glass)
- Analytics (bar chart)
- Payments (credit card)
- Bell (notifications)
- Calendar
- Shield/Fingerprint (vault)
- User (profile)
- Hamburger menu
- Down arrow/chevron
- Left/Right arrows
- Plus sign
- Edit/pencil
- 3-dot menu (vertical)
- Clock/timer
- Snowflake/asterisk
- Waves
- Check mark

### Recommended Icon Libraries
- Lucide Icons
- Heroicons
- Feather Icons

---

## 6. Spacing System

Use 4px base unit:
| Token | Value |
|-------|-------|
| xs | 4px |
| sm | 8px |
| md | 12px |
| lg | 16px |
| xl | 24px |
| 2xl | 32px |
| 3xl | 48px |

---

## 7. Border Radius

| Element | Radius |
|---------|--------|
| Main container | 24px |
| Cards | 16px |
| Buttons (pill) | 24px |
| Buttons (rounded) | 8px |
| Input fields | 8px |
| Status badges | 16px (full pill) |
| Avatars/Logos | 50% (circle) |
| Calendar date highlights | 50% (circle) |

---

## 8. Shadows

| Type | Value |
|------|-------|
| Card shadow | `0 1px 3px rgba(0,0,0,0.1)` |
| Elevated card | `0 4px 6px rgba(0,0,0,0.1)` |
| Container shadow | `0 10px 40px rgba(0,0,0,0.1)` |

---

## 9. Interactive States

### Buttons
- Default: Base color
- Hover: 10% darker or subtle shadow
- Active/Pressed: 15% darker
- Disabled: 50% opacity

### Navigation Items
- Default: Muted gray text/icon
- Hover: White text/icon
- Active: White text with green background pill

### Table Rows
- Default: White background
- Hover: `#F9FAFB` background

### Toggle Switch
- Off: Gray track (`#D1D5DB`), white knob
- On: Green track (`#22C55E`), white knob

---

## 10. Responsive Considerations

### Breakpoints
| Name | Width |
|------|-------|
| Mobile | < 640px |
| Tablet | 640px - 1024px |
| Desktop | > 1024px |

### Mobile Adaptations
- Sidebar collapses to bottom navigation or hamburger menu
- Stats cards stack vertically
- Table becomes card-based list
- Calendar widget full-width

---

## 11. Animation Guidelines

### Transitions
- Duration: 150-200ms
- Easing: `ease-in-out` or `cubic-bezier(0.4, 0, 0.2, 1)`

### Recommended Animations
- Sidebar nav item hover: Background fade in
- Card hover: Subtle lift (translateY -2px)
- Button press: Scale down slightly (0.98)
- Toggle switch: Smooth slide
- Dropdown menus: Fade + slide down

---

## 12. Implementation Notes

### Tech Stack Recommendations
- **Framework**: React, Next.js, or Vue.js
- **Styling**: Tailwind CSS (highly recommended) or CSS Modules
- **Icons**: Lucide React or Heroicons
- **Charts**: Recharts or Chart.js (if analytics needed)
- **Date handling**: date-fns or dayjs

### Tailwind CSS Color Config
```javascript
// tailwind.config.js
module.exports = {
  theme: {
    extend: {
      colors: {
        'paier-navy': '#1E2A38',
        'paier-mint': '#4ADE80',
        'paier-green': '#22C55E',
        'paier-pink': '#EC4899',
        'paier-coral': '#F472B6',
      }
    }
  }
}
```

### Component Hierarchy
```
<Dashboard>
  <Sidebar>
    <Logo />
    <NavItem /> (×8)
    <MoreButton />
  </Sidebar>
  <MainContent>
    <HeroSection>
      <DateCard />
      <PaymentPlanSelector />
      <CalendarWidget />
    </HeroSection>
    <StatsRow>
      <ActiveBillsCard />
      <MonthlyPayCard />
      <OverduesCard />
    </StatsRow>
    <BillsTable>
      <TableHeader />
      <TableRow /> (×n)
      <LoadMore />
    </BillsTable>
  </MainContent>
</Dashboard>
```

---

## 13. Accessibility Checklist

- [ ] Color contrast ratio ≥ 4.5:1 for text
- [ ] Focus states visible on all interactive elements
- [ ] Keyboard navigation support
- [ ] ARIA labels for icon-only buttons
- [ ] Alt text for images/logos
- [ ] Screen reader friendly table markup
- [ ] Skip to main content link

---

## 14. Assets Needed

### Logos/Brand
- Paier lightning bolt logo (SVG)
- Company logos: Netflix, Dribbble, Framer (or placeholders)

### Illustrations
- None required for this design

---

## 15. Quick Reference - Key Measurements

| Element | Value |
|---------|-------|
| Sidebar width | 200px |
| Content padding | 24px |
| Card gap | 16px |
| Border radius (cards) | 16px |
| Large date number | 72px |
| Stat numbers | 48px |
| Currency amounts | 36px |
| Body text | 14px |
| Icon size | 20px |
| Avatar size | 32px |
| Button height | 40px |
| Table row height | 64px |

---

*This design guide was generated from a visual reference. Exact values may require fine-tuning during implementation.*
