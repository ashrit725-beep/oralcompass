---
description: (Optional) Scope a React Native + Expo port of the atlas using react-native-svg and Reanimated, reusing the typed API contracts
---
Only if the team wants a native app in addition to the PWA. Produce `mobile/` with Expo (TypeScript), react-native-svg scenes mirroring `web/src/components/atlas`, Reanimated
for the intro and traveler (reduced-motion aware), a configurable backend base URL (a phone cannot reach the computer's localhost; document LAN IP and tunnels), CORS origins
in the API, and the same copy file (shared package). Verify Expo SDK / package compatibility against current official docs before pinning versions; include a lockfile.
