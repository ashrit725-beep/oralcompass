---
description: Local accounts with hashed passwords + server-side sessions and a clearly labeled Demo login (no real SSO; never request insurer credentials)
---
Add `api/app/auth_local.py`: register/login with argon2/bcrypt hashing, httpOnly session cookies validated server-side, logout, rate limiting, and a "Demo login (judges)"
button that creates a throwaway account seeded with the Alex sample journey. Keep the Cognito JWT path for production and `ORALCOMPASS_DEV_AUTH` for tests. UI: a login
screen before My journey with OralCompass branding and no slogans. Tests: wrong password, session expiry, cross-account 404 unchanged.
