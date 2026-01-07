#!/usr/bin/env python3
"""Test impersonation resident search - verifies search returns results."""

from playwright.sync_api import sync_playwright
import time

BASE_URL = "http://localhost:3000"

def test_impersonation_search():
    """Test that impersonation search returns residents."""
    print(f"\n{'='*60}")
    print("IMPERSONATION SEARCH TEST")
    print(f"{'='*60}")

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(viewport={'width': 1280, 'height': 800})
        page = context.new_page()

        console_logs = []
        page.on('console', lambda msg: console_logs.append(f"[{msg.type}] {msg.text}"))

        try:
            # Step 1: Login as Super Admin
            print("\n1. Logging in as Super Admin...")
            page.goto(f"{BASE_URL}/login")
            page.wait_for_load_state('networkidle')

            page.locator('input[type="email"]').first.fill("admin@residio.test")
            page.locator('input[type="password"]').first.fill("password123")
            page.locator('button[type="submit"]').first.click()

            page.wait_for_url(lambda url: '/login' not in url, timeout=15000)
            page.wait_for_load_state('networkidle')
            print(f"   ✓ Logged in, at: {page.url}")

            # Step 2: Navigate to portal with impersonate
            print("\n2. Navigating to /portal?impersonate=true...")
            page.goto(f"{BASE_URL}/portal?impersonate=true")

            # Wait for dialog with longer timeout
            time.sleep(5)  # Allow time for React to render
            try:
                page.wait_for_selector('[role="dialog"]', timeout=10000)
                print("   ✓ Dialog appeared")
            except:
                print("   ⚠ Dialog not found via selector, checking page...")
                page.screenshot(path='/tmp/impersonation_no_dialog.png')
            time.sleep(1)

            # Step 3: Find search input and type a query
            print("\n3. Searching for residents...")

            # Look for search input in dialog
            search_input = page.locator('[role="dialog"] input[placeholder*="earch" i], [role="dialog"] input').first
            if search_input.count() == 0:
                print("   ⚠ No search input found in dialog")
                page.screenshot(path='/tmp/impersonation_no_input.png')
                return False

            # Type search query (need at least 2 chars based on UI)
            # Use type() with delay to trigger debounced search
            search_input.click()
            search_input.type("fe", delay=100)  # Type with delay to trigger events
            print("   Typed 'fe' in search input")

            # Wait for debounce and API call (increased to 10s)
            print("   Waiting for search results (10s)...")
            time.sleep(10)
            page.screenshot(path='/tmp/impersonation_search_results.png')

            # Print console logs to debug
            print("\n   Console logs during search:")
            for log in console_logs[-10:]:
                print(f"   {log[:150]}")

            # Step 4: Check for results
            print("\n4. Checking for results...")

            dialog_content = page.locator('[role="dialog"]').text_content() or ""

            # Look for result indicators
            has_no_residents = "no residents" in dialog_content.lower()
            has_loading = page.locator('[role="dialog"] .animate-spin').count() > 0
            has_resident_items = page.locator('[role="dialog"] [role="option"], [role="dialog"] button:has-text("Select"), [role="dialog"] li').count() > 0

            # Check for resident names or codes in content
            has_resident_content = any(x in dialog_content.lower() for x in ['resident', 'house', '@', 'res-'])

            print(f"   'No residents' text: {has_no_residents}")
            print(f"   Loading spinner: {has_loading}")
            print(f"   Result items: {has_resident_items}")
            print(f"   Resident-like content: {has_resident_content}")
            print(f"   Dialog content preview: {dialog_content[:300]}...")

            # Determine success
            if has_no_residents:
                print("\n❌ SEARCH RETURNED 'NO RESIDENTS FOUND'")

                # Check console for API errors
                api_errors = [log for log in console_logs if '400' in log or 'error' in log.lower()]
                if api_errors:
                    print("\n   API Errors in console:")
                    for err in api_errors[:5]:
                        print(f"   - {err[:100]}")

                return False

            if has_loading:
                print("\n⚠ STILL LOADING - may need more wait time")
                return False

            success = has_resident_items or has_resident_content

            print(f"\n{'='*60}")
            if success:
                print("✅ SUCCESS: Search returned residents!")
            else:
                print("❌ FAILED: Could not verify residents in results")
            print(f"{'='*60}")

            return success

        except Exception as e:
            print(f"\n❌ Error: {e}")
            page.screenshot(path='/tmp/impersonation_search_error.png')
            return False
        finally:
            browser.close()


def main():
    result = test_impersonation_search()
    return 0 if result else 1


if __name__ == "__main__":
    exit(main())
