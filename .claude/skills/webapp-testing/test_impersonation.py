#!/usr/bin/env python3
"""Test impersonation feature for Super Admin and Chairman roles."""

from playwright.sync_api import sync_playwright
import time

BASE_URL = "http://localhost:3000"

def test_impersonation(email: str, password: str, user_label: str):
    """Test impersonation for a specific user."""
    print(f"\n{'='*60}")
    print(f"Testing impersonation as: {user_label}")
    print(f"Email: {email}")
    print(f"{'='*60}")

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(viewport={'width': 1280, 'height': 800})
        page = context.new_page()

        try:
            # Step 1: Go to login page
            print("\n1. Navigating to login page...")
            page.goto(f"{BASE_URL}/login")
            page.wait_for_load_state('networkidle')
            page.screenshot(path=f'/tmp/impersonation_test_{user_label.lower().replace(" ", "_")}_01_login.png')
            print("   ✓ Login page loaded")

            # Step 2: Fill in login form
            print("\n2. Filling login form...")
            # Wait for the form to be ready
            page.wait_for_selector('input[type="email"], input[name="email"]', timeout=10000)

            # Find and fill email
            email_input = page.locator('input[type="email"], input[name="email"]').first
            email_input.fill(email)

            # Find and fill password
            password_input = page.locator('input[type="password"], input[name="password"]').first
            password_input.fill(password)

            page.screenshot(path=f'/tmp/impersonation_test_{user_label.lower().replace(" ", "_")}_02_filled.png')
            print("   ✓ Form filled")

            # Step 3: Submit login
            print("\n3. Submitting login...")
            submit_button = page.locator('button[type="submit"]').first
            submit_button.click()

            # Wait for navigation after login
            page.wait_for_load_state('networkidle', timeout=15000)
            time.sleep(2)  # Extra wait for auth to settle

            current_url = page.url
            print(f"   Current URL after login: {current_url}")
            page.screenshot(path=f'/tmp/impersonation_test_{user_label.lower().replace(" ", "_")}_03_after_login.png')

            # Step 4: Navigate to portal with impersonate param
            print("\n4. Navigating to /portal?impersonate=true...")
            page.goto(f"{BASE_URL}/portal?impersonate=true")
            page.wait_for_load_state('networkidle', timeout=15000)
            time.sleep(3)  # Wait for dialogs/components to render

            page.screenshot(path=f'/tmp/impersonation_test_{user_label.lower().replace(" ", "_")}_04_portal.png')

            # Step 5: Check for impersonation dialog/selector
            print("\n5. Checking for impersonation elements...")
            page_content = page.content()

            # Look for dialog or selector indicators
            has_dialog = page.locator('[role="dialog"]').count() > 0
            has_select_resident = "select" in page_content.lower() and "resident" in page_content.lower()
            has_search = page.locator('input[placeholder*="search" i], input[placeholder*="resident" i]').count() > 0
            has_impersonation_text = "impersonat" in page_content.lower()
            has_permission_error = "permission" in page_content.lower() and ("not" in page_content.lower() or "denied" in page_content.lower())

            print(f"   - Dialog found: {has_dialog}")
            print(f"   - 'Select resident' text: {has_select_resident}")
            print(f"   - Search input found: {has_search}")
            print(f"   - Impersonation-related text: {has_impersonation_text}")
            print(f"   - Permission error detected: {has_permission_error}")

            # Take final screenshot
            page.screenshot(path=f'/tmp/impersonation_test_{user_label.lower().replace(" ", "_")}_05_final.png', full_page=True)

            # Determine result
            can_impersonate = (has_dialog or has_search or has_select_resident) and not has_permission_error

            print(f"\n{'='*60}")
            if can_impersonate:
                print(f"✅ SUCCESS: {user_label} CAN access impersonation feature")
            else:
                print(f"❌ FAILED: {user_label} CANNOT access impersonation feature")
            print(f"{'='*60}")

            return can_impersonate

        except Exception as e:
            print(f"\n❌ Error during test: {e}")
            page.screenshot(path=f'/tmp/impersonation_test_{user_label.lower().replace(" ", "_")}_error.png')
            return False
        finally:
            browser.close()


def main():
    print("\n" + "="*70)
    print("IMPERSONATION FEATURE TEST")
    print("="*70)

    results = {}

    # Test 1: Super Admin
    results['Super Admin'] = test_impersonation(
        email="admin@residio.test",
        password="password123",
        user_label="Super Admin"
    )

    # Test 2: Chairman
    results['Chairman'] = test_impersonation(
        email="feyijimiohioma@gmail.com",
        password="@Justice1J!mru13$",
        user_label="Chairman"
    )

    # Summary
    print("\n" + "="*70)
    print("TEST SUMMARY")
    print("="*70)
    for user, success in results.items():
        status = "✅ PASS" if success else "❌ FAIL"
        print(f"  {user}: {status}")

    print("\nScreenshots saved to /tmp/impersonation_test_*.png")
    print("="*70)

    # Return exit code
    return 0 if all(results.values()) else 1


if __name__ == "__main__":
    exit(main())
