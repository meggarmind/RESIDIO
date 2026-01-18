# Report Schedule Enhancement Plan

## Goal Description
Integrate report scheduling directly into the Report Generation Wizard. Allow users to schedule the report they are currently configuring, preserving all selected options (filters, toggles, etc.). Enhance the `report_schedules` schema to support storing these diverse report options.

## User Review Required
> [!IMPORTANT]
> **Schema Change**: We will add a `configuration` JSONB column to the `report_schedules` table to store flexible report options (e.g., `include_unoccupied`, `payment_status`, `aggregation`). This avoids creating multiple sparse columns.

> [!NOTE]
> **Workflow**: A new "Schedule Report" toggle will be added to the Review step of the wizard. If enabled, users will see additional scheduling fields (Name, Frequency, Recipients).

## Proposed Changes

### Database & Schema
#### [MODIFY] [Supabase Schema]
-   Add `configuration` column (JSONB) to `report_schedules` table.
-   Add `recipients` column (text[] or JSONB) to `report_schedules` table (for "optional additional email recipients").

### Backend types & Actions
#### [MODIFY] [actions/reports/report-schedules.ts](file:///home/feyijimiohioma/projects/Residio/src/actions/reports/report-schedules.ts)
-   Update `ReportSchedule` interface to include `configuration` and `recipients`.
-   Update `CreateScheduleInput` to include these new fields.
-   Update `createReportSchedule` to accept and save these fields.
-   Update `updateReportSchedule` similarly.

### UI Components
#### [MODIFY] [components/reports/report-request-wizard.tsx](file:///home/feyijimiohioma/projects/Residio/src/components/reports/report-request-wizard.tsx)
-   Update `ReviewStep` to include a "Create Schedule" section.
-   This section will include fields for:
    -   Schedule Name (default to Report Name)
    -   Frequency (Daily, Weekly, Monthly, etc.)
    -   Recipients (Admin email default + input for others)
-   Modify adding/edit logic to call `createReportSchedule` if the toggle is checked.
-   Ensure `onGenerate` can handle the "Create Schedule" flow or create a separate handler. Probably separate: "Generate Now" vs "Save Schedule". Or do both? User said: *"step... that allows user select if they want to schedule"*. It implies they might want to just schedule, or Schedule AND Generate. Usually "Save as Schedule" is a separate primary action or a checked option. I will add it as a primary action or a toggle in the review step that changes the "Generate" button to "Generate & Schedule" or "Save Schedule".
    -   *Decision*: I will add a "Schedule this Report" switch. If active, show schedule options. The main button becomes "Generate & Schedule" (if they want both) or we can have two buttons. I'll stick to a Switch that reveals options, and the main action performs the schedule creation.

#### [MODIFY] [components/reports/report-schedules.tsx](file:///home/feyijimiohioma/projects/Residio/src/components/reports/report-schedules.tsx)
-   Update the list view to possibly show more details or just ensure it doesn't break.
-   (Optional) Update `CreateScheduleDialog` to also support the new fields if we want to keep the standalone creator updated, but the main focus is the Wizard.

## Verification Plan

### Manual Verification
1.  **Schema**: Check Supabase dashboard or logs to ensure migration applied.
2.  **Wizard Flow**:
    -   Open Report Wizard.
    -   Select "Financial Overview", "Last Month", specific accounts.
    -   In Options, verify "Include Charts" is ON.
    -   Go to Review Step.
    -   Toggle "Schedule this Report".
    -   Fill in Schedule Name "Monthly Fin Ov", Frequency "Monthly".
    -   Click "Create Schedule".
    -   Verify success toast.
    -   Go to Report Schedules page.
    -   Verify the new schedule exists and has the correct `configuration` (charts: true, etc.).
