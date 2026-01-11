#!/usr/bin/env python3
"""Verify the login page is working by taking a snapshot."""

from playwright.sync_api import sync_playwright

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page()

    print("Navigating to login page...")
    page.goto('http://localhost:3000/login')
    page.wait_for_load_state('networkidle')

    print("Taking screenshot...")
    page.screenshot(path='/tmp/login_page.png', full_page=True)
    print("Screenshot saved to /tmp/login_page.png")

    # Get page title and content summary
    title = page.title()
    print(f"Page title: {title}")

    # Check for key elements
    email_input = page.locator('input[type="email"], input[name="email"]')
    password_input = page.locator('input[type="password"]')
    submit_button = page.locator('button[type="submit"]')

    print(f"Email input found: {email_input.count() > 0}")
    print(f"Password input found: {password_input.count() > 0}")
    print(f"Submit button found: {submit_button.count() > 0}")

    browser.close()
    print("Done!")
