# Announcements & Community Communication

The announcements system allows estate administrators to communicate efficiently with residents through scheduled updates and emergency alerts.

## Key Features

### Announcement Management
- **Full CRUD**: Admins can create, edit, delete, and publish announcements.
- **Scheduling**: Announcements can be scheduled to go live at a future date and time.
- **Expiry**: Admins can set an expiry date for announcements to automatically remove old content.

### Communication Channels
- **In-App Notifications**: New announcements trigger a notification in the resident portal's notification center.
- **Emergency Broadcasts**: Critical announcements can be flagged as "Emergency" to give them higher visual priority (e.g., banner notifications).

### Engagement Tracking
- **Read Receipts**: The system tracks which residents have read each announcement.
- **Analytics**: Admins can view read statistics to measure communication effectiveness.

## Resident Portal Experience
Residents can access the community announcement board at `/portal/announcements`.
- Each announcement shows the publishing date and category.
- Unread announcements are highlighted to ensure residents don't miss important information.

## Access Control
- `announcements.view`: Standard for all residents.
- `announcements.manage`: Restricted to Admins and specified Staff roles.
