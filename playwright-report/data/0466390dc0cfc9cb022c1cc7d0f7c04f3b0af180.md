# Page snapshot

```yaml
- generic [active] [ref=e1]:
  - generic [ref=e4]:
    - generic [ref=e5]:
      - generic [ref=e6]: Residio
      - generic [ref=e7]: Resident engagement, simplified
    - generic [ref=e9]:
      - generic [ref=e10]:
        - generic [ref=e11]: Email
        - textbox "Email" [disabled]:
          - /placeholder: you@example.com
          - text: admin@residio.test
      - generic [ref=e12]:
        - generic [ref=e13]: Password
        - textbox "Password" [disabled]:
          - /placeholder: ••••••••
          - text: password123
      - button "Signing in..." [disabled]
  - region "Notifications alt+T"
  - button "Open Next.js Dev Tools" [ref=e19] [cursor=pointer]:
    - img [ref=e20]
  - alert [ref=e23]
```