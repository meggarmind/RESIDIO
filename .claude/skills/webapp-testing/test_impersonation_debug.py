#!/usr/bin/env python3
"""Debug impersonation - capture console logs and wait longer."""

from playwright.sync_api import sync_playwright
import time
import json

BASE_URL = "http://localhost:3000"

def test_with_debug(email: str, password: str, user_label: str):
    """Test with console log capture."""
    print(f"\n{'='*60}")
    print(f"DEBUG TEST: {user_label}")
    print(f"{'='*60}")

    console_logs = []
    network_errors = []

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(viewport={'width': 1280, 'height': 800})
        page = context.new_page()

        # Capture console logs
        page.on('console', lambda msg: console_logs.append(f"[{msg.type}] {msg.text}"))
        page.on('pageerror', lambda err: console_logs.append(f"[ERROR] {err}"))
        page.on('requestfailed', lambda req: network_errors.append(f"{req.method} {req.url} - {req.failure}"))

        try:
            # Login
            print("\n1. Logging in...")
            page.goto(f"{BASE_URL}/login")
            page.wait_for_load_state('networkidle')

            page.locator('input[type="email"]').first.fill(email)
            page.locator('input[type="password"]').first.fill(password)
            page.locator('button[type="submit"]').first.click()

            page.wait_for_url(lambda url: '/login' not in url, timeout=15000)
            page.wait_for_load_state('networkidle')
            print(f"   ✓ Logged in, at: {page.url}")

            # Go to portal with impersonate
            print("\n2. Navigating to /portal?impersonate=true...")
            page.goto(f"{BASE_URL}/portal?impersonate=true")

            # Wait and take screenshots at intervals
            for i in range(4):
                time.sleep(3)
                page.screenshot(path=f'/tmp/debug_{user_label.lower().replace(" ", "_")}_{i+1}.png')
                print(f"   Screenshot {i+1} taken at {(i+1)*3}s")

                # Check if dialog appeared
                if page.locator('[role="dialog"]').count() > 0:
                    print("   ✓ Dialog appeared!")
                    break

            # Final state
            print("\n3. Final page state:")
            print(f"   URL: {page.url}")

            # Check page content
            body_text = page.locator('body').text_content() or ""
            print(f"   Body text preview: {body_text[:200]}...")

            # Check for specific elements
            has_dialog = page.locator('[role="dialog"]').count() > 0
            has_spinner = page.locator('.animate-spin').count() > 0
            has_error = 'error' in body_text.lower() or 'permission' in body_text.lower()

            print(f"\n   Dialog visible: {has_dialog}")
            print(f"   Spinner visible: {has_spinner}")
            print(f"   Error detected: {has_error}")

            # Console logs
            if console_logs:
                print(f"\n4. Console logs ({len(console_logs)} entries):")
                for log in console_logs[-20:]:  # Last 20
                    print(f"   {log[:100]}")

            if network_errors:
                print(f"\n5. Network errors ({len(network_errors)}):")
                for err in network_errors:
                    print(f"   {err}")

            return not has_error and (has_dialog or 'select' in body_text.lower())

        except Exception as e:
            print(f"\n❌ Error: {e}")
            return False
        finally:
            browser.close()


def main():
    # Test Super Admin only first
    result = test_with_debug(
        email="admin@residio.test",
        password="password123",
        user_label="Super Admin"
    )

    print(f"\n{'='*60}")
    print(f"Result: {'✅ PASS' if result else '❌ FAIL'}")
    print(f"{'='*60}")

    return 0 if result else 1


if __name__ == "__main__":
    exit(main())
