# Data Table Layout 2: Complex Registry Standard

## Scope

**IMPORTANT:** This style guide defines **styling and layout standards** for existing table elements. It does NOT dictate what data columns or features a table must have. Apply these styles to elements that already exist in your table implementation.

**What this guide covers:**
- How to style existing search inputs, filters, and toolbars
- How to layout existing table columns and rows
- How to style existing status badges and indicators
- How to implement pagination for existing data

**What this guide does NOT cover:**
- What columns your table should have (determined by business requirements)
- Whether your table needs an Actions column (determined by functionality needs)
- What filters are available (determined by your data model)

---

This document outlines the standard layout and behavior for **complex registry tables** within the application, based on the **Resident Registry** implementation. This layout variant differs from the standard Data Table (Layout 1) by integrating the toolbar internally to support complex, multi-faceted filtering.

## 1. Container Structure
Tables are encapsulated within an `EnhancedTableCard` component, but unlike Layout 1, the card body handles the toolbar rendering.

-   **Component:** `EnhancedTableCard` (from `@/components/dashboard/enhanced-stat-card`)
-   **Title:** Defined in `EnhancedTableCard` props.
-   **Actions:** *None* passed to the card header; actions live within the table body content.
-   **Wrapper Styles:**
    -   `overflow-hidden`
    -   **Modern Theme:** `rounded-2xl`, `backdrop-blur-sm`, `shadow-soft`, `bg-white/95 dark:bg-[#1E293B]/95`.

## 2. Integrated Toolbar
The toolbar is embedded directly within the card content area, above the table data. This allows for wider filter arrays and complex state interaction.

### Layout
-   **Wrapper:** `div.flex.flex-col.sm:flex-row.gap-4`
-   **Search Area:** `flex-1` width to maximize search visibility.
-   **Filter Area:** Right-aligned or wrapping flex items.

### Components
1.  **Primary Search Input:**
    -   **Wrapper:** `div.relative.flex-1`
    -   **Icon:** `Search` (Lucide) absolute left `top-1/2 -translate-y-1/2 left-3`.
    -   **Input:**
        -   Padding: `pl-9`
        -   Placeholder: Descriptive (e.g., "Search by name, phone, or code...")
    -   **Action:** Submit button (`Button[variant="secondary"]`) attached to form if needed, or real-time debounce.

2.  **Filter Dropdowns:**
    -   **Component:** `Select` (from `@/components/ui/select`) or `DropdownMenu` (for multi-select).
    -   **Trigger Width:** Fixed widths for consistency (e.g., `w-[150px]`, `w-[180px]`).
    -   **Multi-Select Pattern:** `DropdownMenu` with `DropdownMenuCheckboxItem` for filtering by multiple roles.
        -   Displays count when multiple selected ("2 roles").
        -   Includes "Clear selection" action inside dropdown.

3.  **Active Filter Badges:**
    -   Location: Below toolbar, above table.
    -   **Component:** `Badge[variant="secondary"]` with `X` icon.
    -   **Behavior:** Click to remove specific filter.
    -   **Clear All:** "Clear all" ghost button adjacent to badges.

4.  **Summary Cards (Optional):**
    -   Context-sensitive summary row (e.g., Verification Stats) embedded above the table.
    -   Style: `p-3 rounded-lg bg-muted/50 border`.

## 3. Table Content Layout
The table is wrapped for overflow and border handling, distinct from the main card.

-   **Wrapper:** `div.rounded-xl.border.overflow-hidden.shadow-soft.animate-slide-up`
-   **Table Component:** `Table` (variant: "modern").

### Columns
-   **Header Row:**
    -   `TableRow` with `interactive={false}`.
    -   **Alignment:** Text-left default. If you have an Actions column, align it text-right.
-   **Content Cells:**
    -   **Identifiers:** `font-mono text-sm bg-muted px-2 py-1 rounded` for Codes/IDs (if present).
    -   **Primary Info:** Icon + Text pair when applicable (e.g., Users icon + Name).
    -   **Status Badges:** See "Status Badge Standards" section below.
    -   **Verification Indicators:** Specialized badges (e.g., `ContactVerificationBadge`) showing email/phone status (if applicable).
    -   **Actions Column (if present):** Right-aligned with `className="text-right"` on both header and cells.

### Status Badge Standards

When your table includes status columns, use these standardized color conventions:

**Badge Component:** `Badge` with `className="rounded-full"`

**Variant Mapping:**
-   **Active/Paid/Approved/Verified/Success states:** `variant="success"` (green)
-   **Pending/In Progress/Review states:** `variant="secondary"` (gray/neutral)
-   **Inactive/Cancelled/Rejected/Failed states:** `variant="destructive"` (red)
-   **Warning/Attention Required states:** `variant="warning"` (yellow/amber) if available

**Example:**
```tsx
<Badge 
    variant={
        status === 'paid' || status === 'active' ? 'success' : 
        status === 'cancelled' || status === 'inactive' ? 'destructive' : 
        'secondary'
    }
    className="rounded-full"
>
    {status}
</Badge>
```

### Row States
1.  **Loading:**
    -   5 rows of `Skeleton` placeholders matching your column widths.
2.  **Empty:**
    -   Custom empty state component spanning all columns.
    -   Includes Icon (large), Title, Description, and "Add" Call-to-Action (if applicable).
3.  **Data:**
    -   Memoized Rows (`memo(function Row...)`) for performance (optional optimization).
    -   **Row Hover:** `className="hover:bg-gray-50 dark:hover:bg-[#0F172A]"`

## 4. Pagination Footer
Controls are located below the table wrapper.

-   **Wrapper:** `div.flex.flex-col.sm:flex-row.gap-4.justify-between.items-center`

### Left Section (Settings)
-   **Rows Per Page:**
    -   Label: "Rows per page".
    -   Component: `Select` (`h-8 w-[70px] rounded-xl`).
    -   Options: 10, 20, 50.
-   **Counter:**
    -   Format: "Showing {start} to {end} of {total} {entity_name}"
    -   Example: "Showing 1 to 20 of 150 transactions"
    -   Use `<p>` tag with `text-sm text-muted-foreground`

### Right Section (Navigation)
-   **Container:** `div.flex.items-center.gap-1`
-   **Prev/Next Buttons:** 
    -   `Button[variant="outline"][size="sm"]` with `h-8 w-9 p-0`
    -   Icons: `ArrowLeft` and `ArrowRight` (Lucide)
    -   Disabled when at boundaries

### Windowed Pagination (Required)
Display up to 5 page numbers using a sliding window algorithm:

**Algorithm:**
```tsx
const totalPages = Math.ceil((totalCount || 0) / pageSize);

Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
  let pageNum: number;
  if (totalPages <= 5) {
    pageNum = i + 1;
  } else if (page <= 3) {
    pageNum = i + 1;
  } else if (page >= totalPages - 2) {
    pageNum = totalPages - 4 + i;
  } else {
    pageNum = page - 2 + i;
  }
  return (
    <Button
      key={pageNum}
      variant={page === pageNum ? 'default' : 'outline'}
      size="sm"
      onClick={() => setPage(pageNum)}
      className="h-8 w-9 p-0"
    >
      {pageNum}
    </Button>
  );
})
```

**Behavior Examples:**
-   **≤5 total pages:** Show all (1, 2, 3, 4, 5)
-   **Page 1-3:** Show first 5 (1, 2, 3, 4, 5)
-   **Page 8 of 10:** Show last 5 (6, 7, 8, 9, 10)
-   **Page 5 of 10:** Show window (3, 4, **5**, 6, 7)

**Button Styling:**
-   Active page: `variant="default"` with `bg-primary`
-   Inactive pages: `variant="outline"`
-   All buttons: `h-8 w-9 p-0` for consistent sizing
-   Gap between buttons: `gap-1`

**State Requirements:**
-   `page`: Current page number (1-indexed)
-   `pageSize`: Items per page (10, 20, or 50)
-   `totalCount`: Total number of items from API
-   `totalPages`: Calculated as `Math.ceil((totalCount || 0) / pageSize)`
