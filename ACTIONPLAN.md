# Action Plan: PDF Import Extension

Created: 2026-01-17T22:50:00Z
Status: IN PROGRESS

## Dependencies & APIs

| Dependency   | Purpose                                      | Free Tier? | Docs Link | Approved |
|--------------|----------------------------------------------|------------|-----------|----------|
| pdfjs-dist   | Core PDF text extraction                     | Free (MIT) | [Link](https://github.com/mozilla/pdf.js) | Yes      |
| qpdf (CLI)   | PDF decryption (server-side)                 | Free (GPL) | [Link](https://github.com/qpdf/qpdf) | Yes      |
| @thednp/dommatrix | Polyfill for DOMMatrix in Node.js        | Free (MIT) | [Link](https://github.com/thednp/dommatrix) | Yes      |

## Build Steps

- [x] Step 1: Extend `fileTypeEnum` and `fileUploadSchema` to support PDF.
  - Completed: Prior Session
- [x] Step 2: Update `StatementUpload` component to accept PDFs and conditional password input.
  - Completed: Prior Session
- [x] Step 3: Create `parsePdfStatement` server action.
  - Completed: Prior Session
- [x] Step 4: Fix `pdfjs-dist` worker bundling in Next.js using `serverExternalPackages`.
  - Completed: Prior Session
- [x] Step 5: Implement coordinate-based transaction parsing in `first-bank-pdf.ts`.
  - Completed: Prior Session
- [x] Step 6: Integrate saved password retrieval for bank accounts.
  - Completed: Prior Session
- [ ] Step 7: Finalize visual polish for the PDF upload section (Tactile depth, micro-animations per AGENTS.md).
- [ ] Step 8: Comprehensive API/Infrastructure Test CLI (MANDATORY).
- [ ] Step 9: Final manual verification with real sample PDF.

## Checkpoints

- [x] Checkpoint 1: PDF infrastructure working (worker loading successfully).
- [x] Checkpoint 2: Correct transaction categorization (Deposit vs Withdrawal).
- [ ] Checkpoint 3: Visual polish and Saved Password flow verification.

## Change Log

- 2026-01-17: Initialized ACTIONPLAN.md based on new Antigravity workflow.
- 2026-01-17: Implemented coordinate-based parsing fix.
- 2026-01-17: Added saved password support.
