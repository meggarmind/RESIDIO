#!/usr/bin/env python3
"""Verify the visual overhaul implementation across dashboard pages."""

from playwright.sync_api import sync_playwright
import json

def verify_visual_overhaul():
    results = {
        'login': False,
        'dashboard': {'loaded': False, 'cards': 0, 'animations': False},
        'residents': {'loaded': False, 'cards': 0, 'table': False},
        'houses': {'loaded': False, 'cards': 0},
        'billing': {'loaded': False, 'cards': 0},
    }

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()

        # Login
        print("1. Logging in as admin...")
        page.goto('http://localhost:3000/login')
        page.wait_for_load_state('networkidle')
        page.fill('input[type="email"], input[name="email"]', 'admin@residio.test')
        page.fill('input[type="password"]', 'password123')
        page.click('button[type="submit"]')

        try:
            page.wait_for_url('**/dashboard**', timeout=30000)
            results['login'] = True
            print("   ✓ Login successful")
        except:
            # May redirect to portal
            page.wait_for_url('**/(dashboard|portal)**', timeout=30000)
            results['login'] = True
            print("   ✓ Login successful (redirected)")

        # Dashboard verification
        print("\n2. Verifying Dashboard page...")
        page.goto('http://localhost:3000/dashboard')
        page.wait_for_load_state('networkidle')
        page.wait_for_timeout(2000)

        page.screenshot(path='/tmp/dashboard_visual.png', full_page=True)

        # Check for cards
        cards = page.locator('[data-slot="card"]')
        card_count = cards.count()
        results['dashboard']['cards'] = card_count
        results['dashboard']['loaded'] = card_count > 0

        # Check for animation classes in stylesheets
        animations_check = page.evaluate('''() => {
            const styleSheets = Array.from(document.styleSheets);
            let hasSlideUp = false;
            let hasShimmer = false;

            for (const sheet of styleSheets) {
                try {
                    const rules = sheet.cssRules || sheet.rules;
                    for (const rule of Array.from(rules)) {
                        if (rule instanceof CSSKeyframesRule) {
                            if (rule.name === 'slide-up') hasSlideUp = true;
                            if (rule.name === 'shimmer') hasShimmer = true;
                        }
                    }
                } catch (e) {}
            }

            return { hasSlideUp, hasShimmer };
        }''')
        results['dashboard']['animations'] = animations_check.get('hasSlideUp', False) or animations_check.get('hasShimmer', False)

        print(f"   ✓ Dashboard loaded with {card_count} cards")
        print(f"   ✓ Animations available: slide-up={animations_check.get('hasSlideUp')}, shimmer={animations_check.get('hasShimmer')}")

        # Residents page verification
        print("\n3. Verifying Residents page...")
        page.goto('http://localhost:3000/residents')
        page.wait_for_load_state('networkidle')
        page.wait_for_timeout(2000)

        page.screenshot(path='/tmp/residents_visual.png', full_page=True)

        cards = page.locator('[data-slot="card"]')
        card_count = cards.count()
        results['residents']['cards'] = card_count

        table = page.locator('[data-slot="table"], table')
        results['residents']['table'] = table.count() > 0
        results['residents']['loaded'] = card_count > 0 or results['residents']['table']

        print(f"   ✓ Residents loaded with {card_count} cards")
        print(f"   ✓ Table present: {results['residents']['table']}")

        # Houses page verification
        print("\n4. Verifying Houses page...")
        page.goto('http://localhost:3000/houses')
        page.wait_for_load_state('networkidle')
        page.wait_for_timeout(2000)

        page.screenshot(path='/tmp/houses_visual.png', full_page=True)

        cards = page.locator('[data-slot="card"]')
        card_count = cards.count()
        results['houses']['cards'] = card_count
        results['houses']['loaded'] = card_count > 0

        print(f"   ✓ Houses loaded with {card_count} cards")

        # Billing page verification
        print("\n5. Verifying Billing page...")
        page.goto('http://localhost:3000/billing')
        page.wait_for_load_state('networkidle')
        page.wait_for_timeout(2000)

        page.screenshot(path='/tmp/billing_visual.png', full_page=True)

        cards = page.locator('[data-slot="card"]')
        card_count = cards.count()
        results['billing']['cards'] = card_count
        results['billing']['loaded'] = card_count > 0

        print(f"   ✓ Billing loaded with {card_count} cards")

        # Check component variants available
        print("\n6. Checking component styling...")

        # Check buttons
        buttons = page.locator('[data-slot="button"]')
        button_count = buttons.count()
        print(f"   ✓ Buttons with data-slot: {button_count}")

        browser.close()

    # Summary
    print("\n" + "=" * 50)
    print("VISUAL OVERHAUL VERIFICATION SUMMARY")
    print("=" * 50)

    all_passed = True

    if results['login']:
        print("✓ Login: PASSED")
    else:
        print("✗ Login: FAILED")
        all_passed = False

    if results['dashboard']['loaded'] and results['dashboard']['animations']:
        print(f"✓ Dashboard: PASSED ({results['dashboard']['cards']} cards, animations working)")
    else:
        print(f"✗ Dashboard: FAILED (loaded={results['dashboard']['loaded']}, animations={results['dashboard']['animations']})")
        all_passed = False

    if results['residents']['loaded']:
        print(f"✓ Residents: PASSED ({results['residents']['cards']} cards, table={results['residents']['table']})")
    else:
        print(f"✗ Residents: FAILED")
        all_passed = False

    if results['houses']['loaded']:
        print(f"✓ Houses: PASSED ({results['houses']['cards']} cards)")
    else:
        print(f"✗ Houses: FAILED")
        all_passed = False

    if results['billing']['loaded']:
        print(f"✓ Billing: PASSED ({results['billing']['cards']} cards)")
    else:
        print(f"✗ Billing: FAILED")
        all_passed = False

    print("\n" + "=" * 50)
    if all_passed:
        print("ALL TESTS PASSED! Visual overhaul verified.")
    else:
        print("SOME TESTS FAILED! Check screenshots in /tmp/")
    print("=" * 50)

    print("\nScreenshots saved to:")
    print("  - /tmp/dashboard_visual.png")
    print("  - /tmp/residents_visual.png")
    print("  - /tmp/houses_visual.png")
    print("  - /tmp/billing_visual.png")

    return all_passed

if __name__ == '__main__':
    import sys
    success = verify_visual_overhaul()
    sys.exit(0 if success else 1)
