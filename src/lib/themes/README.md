# Residio Visual Theme System

Residio now uses a **tweakcn** based theming system.

- **Registry**: `tweakcn-registry.ts` - Contains all theme definitions.
- **Documentation**: See `docs/ui/visual-theme-system.md` for full details.

## Adding a New Theme

1. Go to [tweakcn.com](https://tweakcn.com)
2. Create/customize a theme
3. Copy the JSON output
4. Add it to `tweakcn-registry.ts`

## Key Files

- `src/contexts/visual-theme-context.tsx`: Provider component
- `src/lib/themes/tweakcn-registry.ts`: Theme definitions
- `src/types/theme.ts`: Type definitions
