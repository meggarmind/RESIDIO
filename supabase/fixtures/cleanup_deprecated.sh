#!/bin/bash
# Cleanup deprecated fixture files
# Run after verifying all corrected fixtures loaded successfully

echo "╔════════════════════════════════════════════════════════════╗"
echo "║     CLEANUP DEPRECATED FIXTURE FILES                       ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo ""
echo "⚠️  WARNING: This will permanently delete deprecated fixture files."
echo ""
echo "Files to be deleted:"
echo "  - 12-documents.sql"
echo "  - 13-notes.sql"
echo "  - 13-notes-fixed.sql"
echo "  - 14-notifications.sql"
echo "  - 14-notifications-fixed.sql"
echo "  - 15-audit-logs.sql"
echo "  - 15-audit-logs-fixed.sql"
echo "  - 15-audit-logs-corrected.sql.backup"
echo "  - 15-audit-logs-corrected.sql.old"
echo ""
echo "Files to KEEP:"
echo "  ✅ 12-documents-simplified.sql"
echo "  ✅ 13-notes-corrected.sql"
echo "  ✅ 14-notifications-corrected.sql"
echo "  ✅ 15-audit-logs-corrected.sql"
echo ""
read -p "Proceed with cleanup? (y/N): " -n 1 -r
echo ""

if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo ""
    echo "🗑️  Removing deprecated files..."

    # Count files before
    count=0

    # Remove deprecated versions
    for file in 12-documents.sql 13-notes.sql 13-notes-fixed.sql \
                14-notifications.sql 14-notifications-fixed.sql \
                15-audit-logs.sql 15-audit-logs-fixed.sql \
                15-audit-logs-corrected.sql.backup 15-audit-logs-corrected.sql.old; do
        if [ -f "$file" ]; then
            rm -f "$file"
            echo "  ✓ Deleted: $file"
            ((count++))
        fi
    done

    echo ""
    echo "✅ Cleanup complete! Removed $count deprecated files."
    echo ""
    echo "Remaining production-ready fixtures:"
    ls -lh *-corrected.sql *-simplified.sql 2>/dev/null | awk '{print "  ✓", $9, "("$5")"}'
    echo ""
else
    echo ""
    echo "❌ Cleanup cancelled. No files deleted."
    echo ""
fi
