# Environment & Secrets Conventions

- `.env.example` documents every variable and is the only committed env file. `.env`, `.env.*` are git-ignored.
- **Client (`EXPO_PUBLIC_*`)**: embedded in the JS bundle, so it is public. Only URLs, anon keys (RLS-protected) and feature modes go here.
- **Server secrets** (service-role key, provider API keys) live only in Supabase secrets, CI secrets or local shell env. They never use the `EXPO_PUBLIC_` prefix and are never read by app code.
- Config is read through `src/config/env.ts` only, never scattered `process.env` reads.
- `EXPO_PUBLIC_PROVIDER_MODE` defaults to `mock`. Mock providers are labeled in the UI and are never reported as real integrations.
- Local Supabase (M07+) runs in Docker via `npx supabase start`, and its keys are local-only.
- CI (`.github/workflows/ci.yml`) runs `npm ci`, `npm run verify` and an Android JS bundle export. It needs no secrets. Nothing is pushed without user approval, so CI runs only once the user pushes.
