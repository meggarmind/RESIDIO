# Gmail Email Integration

The Gmail Integration automates the process of importing bank statements and reconciling payments by connecting directly to a designated estate bank notification email address.

## Overview

Instead of manually uploading PDF statements, Residio can securely fetch emails from a Gmail account, extract attached bank statements, and process them for reconciliation.

## Key Components

### Secure OAuth Connection
- **Gmail API**: Uses Google OAuth 2.0 for secure access to the mailbox.
- **Granular Scopes**: Requests only the minimum necessary permissions (`gmail.readonly`).
- **Configuration**: Setup is performed via the `/settings/system` (or `/settings/billing`) page where admins can manage the client ID, secret, and refresh tokens.

### PDF Processing
- **Decryption**: The system includes automatic decryption for password-protected bank statements using `qpdf`.
- **Parsing**: Extracts transaction details (date, amount, reference, desc) from standard bank statement formats.
- **Mapping**: Matches transactions to residents based on provided payment references.

## Security Measures

- **Command Injection Prevention**: Uses `execFile` instead of `exec` for system calls related to PDF processing.
- **Data Protection**: Imported statements are processed in memory or secure temporary storage and are not permanently stored unless explicitly saved.
- **Audit Logging**: Every email fetch and attachment processing event is logged for administrative review.

## Setup Instructions

1. **Google Cloud Project**: Create a project in the Google Cloud Console.
2. **Enable Gmail API**: Activate the API for your project.
3. **Credentials**: Generate OAuth 2.0 Client IDs.
4. **App Settings**: Enter the Client ID and Secret in Residio's Email Integration settings.
5. **Authorize**: Use the "Authorize" button to grant Residio permission to read notifications.
