# Data Table UI Standard

This document outlines the standard layout, components, and behavior for data tables within the application, based on the **Invoices** table implementation. Use this as a template for creating new tables or refactoring existing ones.

## 1. Container Structure
Tables should be encapsulated within an `EnhancedTableCard` component to ensure consistent styling, headers, and spacing.

-   **Component:** `EnhancedTableCard` (from `@/components/dashboard/enhanced-stat-card`)
-   **Wrapper Styles:**
    -   `overflow-hidden`
    -   **Modern Theme:** `rounded-2xl`, `backdrop-blur-sm`, `shadow-soft`, `bg-white/95 dark:bg-[#1E293B]/95`, `border-gray-200/80`.
    -   **Animation:** `animate-slide-up`

## 2. Header & Toolbar
The table header serves as the control center, housing the title and action toolbar (filters, search). These are passed to the `EnhancedTableCard`.

### Layout
-   **Title:** Left-aligned text (H3/CardTitle) with an optional description.
-   **Actions Area:** Right-aligned flex container (`flex flex-wrap items-center gap-2`).

### Components
1.  **Search Input:**
    -   **Wrapper:** `div.relative.w-[180px]`
    -   **Icon:** `Search` (Lucide) absolute positioned left (`left-2.5`).
    -   **Input:**
        -   Height: `h-9`
        -   Padding: `pl-8`
        -   Text: `text-sm`
        -   Placeholder: Specific to context (e.g., "Invoice number...")
        -   Style: Rounded-xl (modern).

2.  **Filter Dropdowns:**
    -   **Component:** `Select` (from `@/components/ui/select`)
    -   **Trigger Dimensions:** `h-9 text-sm`
    -   **Width:** Variable based on content (e.g., `w-[140px]` for Residents, `w-[110px]` for Status).
    -   **Placeholder:** Short, descriptive label (e.g., "Status", "Type").
    -   **Behavior:** Selection triggers a data fetch and resets pagination to Page 1.

3.  **Clear Filters Button:**
    -   **Condition:** Visible only when filters are active.
    -   **Component:** `Button` (variant: `ghost`, size: `sm`)
    -   **Icon:** `RefreshCw` (Lucide), `h-4 w-4`.
    -   **Tooltip/Title:** "Clear Filters".
    -   **Style:** `h-9 px-2 text-muted-foreground hover:text-foreground`, rounded-xl.

## 3. Table Content Layout
The table itself is wrapped in a container for specific border and overflow handling.

-   **Wrapper:** `div.rounded-xl.border.overflow-hidden.shadow-soft` (Modern: `border-gray-200 dark:border-[#334155]`).
-   **Table Component:** `Table` (variant: "modern").

### Columns
-   **Header Row (`TableHeader`):**
    -   `TableRow` with `interactive={false}`.
    -   `TableHead` for titles.
    -   **Alignment:** Text-left by default, `text-right` for numerical/financial data.
    -   **Actions Column:** Empty `TableHead` with specific width (e.g., `w-[50px]`).

### Row States
1.  **Loading State:**
    -   Display 5-10 rows of `Skeleton` components matching column widths.
    -   Maintains layout stability during data fetches.

2.  **Empty State:**
    -   Single `TableRow` spanning all columns.
    -   Content: User-friendly message (e.g., "No invoices found") with optional call-to-action.

3.  **Data Row:**
    -   `TableRow` with `hover:bg-gray-50` (Modern: `dark:hover:bg-[#0F172A]`).
    -   **Text Styling:** `font-mono` for IDs/Numbers, `text-muted-foreground` for secondary metadata (dates).
    -   **Badges:** Used for Status/Type. Modern content uses `rounded-full` and dynamic status colors.
    -   **Actions:** `Button` (variant: `ghost`, size: `sm`) linking to details view.

## 4. Pagination Footer
The pagination controls are located *outside* the `EnhancedTableCard` (or immediately below the table content if preferred, but existing pattern is below).

-   **Wrapper:** `div.flex.items-center.justify-between` (Visible if `totalCount > 0`).

### Left Section (Controls)
`div.flex.items-center.gap-4`

1.  **Items Per Page Selector:**
    -   **Label:** "Rows per page" (`text-sm text-muted-foreground`).
    -   **Component:** `Select`
    -   **Trigger:** `h-8 w-[70px]`, rounded-xl.
    -   **Options:** 10, 20, 50.

2.  **Counter Text:**
    -   Format: "Showing {start} to {end} of {total} {entity}"
    -   Style: `text-sm text-muted-foreground`.

### Right Section (Navigation)
`div.flex.items-center.gap-2`

1.  **Previous Button:**
    -   `Button` (outline, sm).
    -   Icon: `ChevronLeft`.
    -   Disabled on Page 1.

2.  **Page Numbers:**
    -   Logic: Display a window of pages (e.g., current +/- 2, plus first/last).
    -   **Component:** `Button` (w-9, sm)
    -   **Active State:** `variant="default"`, specific brand color (e.g., `bg-[#0EA5E9]`).
    -   **Inactive State:** `variant="outline"`.

3.  **Next Button:**
    -   `Button` (outline, sm).
    -   Icon: `ChevronRight`.
    -   Disabled on Last Page.
