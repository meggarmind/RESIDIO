#!/usr/bin/env python3
"""Test impersonation feature - v2 with better waits."""

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
            print("   ✓ Login page loaded")

            # Step 2: Fill in login form
            print("\n2. Filling login form...")
            page.wait_for_selector('input[type="email"], input[name="email"]', timeout=10000)
            email_input = page.locator('input[type="email"], input[name="email"]').first
            email_input.fill(email)
            password_input = page.locator('input[type="password"], input[name="password"]').first
            password_input.fill(password)
            print("   ✓ Form filled")

            # Step 3: Submit login
            print("\n3. Submitting login...")
            submit_button = page.locator('button[type="submit"]').first
            submit_button.click()

            # Wait for redirect away from login page
            page.wait_for_url(lambda url: '/login' not in url, timeout=15000)
            page.wait_for_load_state('networkidle')
            print(f"   ✓ Logged in, redirected to: {page.url}")

            # Step 4: Navigate to portal with impersonate param
            print("\n4. Navigating to /portal?impersonate=true...")
            page.goto(f"{BASE_URL}/portal?impersonate=true")
            page.wait_for_load_state('networkidle')

            # Wait for potential dialog to appear
            print("   Waiting for dialog to render...")
            time.sleep(5)  # Allow time for React state to settle

            # Try to wait for dialog specifically
            try:
                page.wait_for_selector('[role="dialog"]', timeout=10000)
                print("   ✓ Dialog found!")
            except:
                print("   ⚠ No dialog element found, checking page content...")

            # Take screenshot
            screenshot_path = f'/tmp/impersonation_v2_{user_label.lower().replace(" ", "_")}.png'
            page.screenshot(path=screenshot_path, full_page=True)
            print(f"   Screenshot saved: {screenshot_path}")

            # Check page content
            page_content = page.content()
            current_url = page.url

            # Look for various indicators
            checks = {
                'Dialog element': page.locator('[role="dialog"]').count() > 0,
                'Search input visible': page.locator('input[placeholder*="earch" i]').count() > 0,
                'Resident text': 'resident' in page_content.lower(),
                'Select text': 'select' in page_content.lower(),
                'Permission error': 'permission' in page_content.lower() and 'not' in page_content.lower(),
                'Impersonation text': 'impersonat' in page_content.lower(),
            }

            print("\n5. Page analysis:")
            for check, result in checks.items():
                status = "✓" if result else "✗"
                print(f"   {status} {check}: {result}")

            # Determine success
            can_impersonate = not checks['Permission error'] and (
                checks['Dialog element'] or
                checks['Search input visible'] or
                (checks['Resident text'] and checks['Select text'])
            )

            print(f"\n{'='*60}")
            if can_impersonate:
                print(f"✅ SUCCESS: {user_label} CAN access impersonation")
            else:
                print(f"❌ FAILED: {user_label} CANNOT access impersonation")
            print(f"{'='*60}")

            return can_impersonate

        except Exception as e:
            print(f"\n❌ Error: {e}")
            page.screenshot(path=f'/tmp/impersonation_v2_{user_label.lower().replace(" ", "_")}_error.png')
            return False
        finally:
            browser.close()


def main():
    print("\n" + "="*70)
    print("IMPERSONATION FEATURE TEST v2")
    print("="*70)

    results = {}

    # Test Super Admin
    results['Super Admin'] = test_impersonation(
        email="admin@residio.test",
        password="password123",
        user_label="Super Admin"
    )

    # Test Chairman
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
    print("="*70)

    return 0 if all(results.values()) else 1


if __name__ == "__main__":
    exit(main())
