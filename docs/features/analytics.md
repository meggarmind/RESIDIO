# Analytics Dashboard

The Analytics Dashboard provides a comprehensive visual overview of the estate's financial health, occupancy status, and collection performance.

## Overview

The dashboard is accessible at `/analytics` and is protected by Role-Based Access Control (RBAC). Only users with appropriate permissions (e.g., Admin, Chairman, Financial Secretary) can view this data.

## Key Features

### Interactive Charts
The dashboard features six primary interactive charts powered by Recharts:
- **Revenue Trend**: Visualizes income over time.
- **Collection Rate**: Shows the percentage of invoices paid vs. total billed.
- **Occupancy Gauge**: Displays the percentage of properties currently occupied.
- **Payment Compliance**: Tracks how many residents pay on time.
- **Payment Methods Pie**: Breakdown of payments by method (Bank Transfer, Cash, etc.).
- **Category Breakdown**: Shows revenue distribution across different billing types (Service Charge, Levies, etc.).

### Date Range Filtering
Users can filter analytics data using a centralized date range picker with presets:
- This Month
- Last Month
- Last Quarter
- Year to Date (YTD)
- Last Year
- Custom Range

### Real-time Updates
- **Auto-refresh**: The dashboard automatically refreshes data every 2 minutes via TanStack React Query.
- **URL Persistence**: Filter states are stored in the URL, allowing users to share specific views or bookmark them.

## Access Control

Analytics access is restricted to the following roles by default:
- `super_admin`
- `admin`
- `chairman`
- `financial_secretary`

Permissions required: `view_analytics`
