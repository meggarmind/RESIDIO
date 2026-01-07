#!/usr/bin/env python3
"""Test the impersonation search API directly."""

from playwright.sync_api import sync_playwright
import json

BASE_URL = "http://localhost:3000"

def test_search_api():
    """Test the search API by intercepting network requests."""
    print(f"\n{'='*60}")
    print("IMPERSONATION SEARCH API TEST")
    print(f"{'='*60}")

    api_responses = []

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(viewport={'width': 1280, 'height': 800})
        page = context.new_page()

        # Capture all network responses
        def handle_response(response):
            url = response.url
            if 'impersonation' in url.lower() or 'resident' in url.lower():
                try:
                    body = response.text()
                    api_responses.append({
                        'url': url,
                        'status': response.status,
                        'body': body[:500] if body else None
                    })
                except:
                    api_responses.append({
                        'url': url,
                        'status': response.status,
                        'body': 'Could not read body'
                    })

        page.on('response', handle_response)

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
            page.wait_for_load_state('networkidle')

            import time
            time.sleep(3)

            # Step 3: Type search query
            print("\n3. Searching for 'fe'...")
            search_input = page.locator('[role="dialog"] input').first
            search_input.click()
            search_input.type("fe", delay=150)

            # Wait for API response
            print("   Waiting for API response (15s)...")
            time.sleep(15)

            # Print API responses
            print("\n4. API Responses captured:")
            if not api_responses:
                print("   ⚠ No relevant API responses captured")
            else:
                for resp in api_responses:
                    print(f"\n   URL: {resp['url'][:80]}...")
                    print(f"   Status: {resp['status']}")
                    if resp['body']:
                        print(f"   Body: {resp['body'][:200]}...")

            # Check dialog content
            print("\n5. Final dialog state:")
            dialog_content = page.locator('[role="dialog"]').text_content() or ""
            print(f"   Content: {dialog_content[:300]}...")

            # Check for success
            has_results = 'feyijimi' in dialog_content.lower() or 'adewole' in dialog_content.lower()
            no_results = 'no residents' in dialog_content.lower()

            print(f"\n{'='*60}")
            if has_results:
                print("✅ SUCCESS: Found expected resident in results!")
            elif no_results:
                print("❌ FAILED: Search returned 'No residents found'")
            else:
                print("⚠ UNKNOWN: Could not determine result state")
            print(f"{'='*60}")

            return has_results

        except Exception as e:
            print(f"\n❌ Error: {e}")
            import traceback
            traceback.print_exc()
            return False
        finally:
            browser.close()


if __name__ == "__main__":
    result = test_search_api()
    exit(0 if result else 1)
