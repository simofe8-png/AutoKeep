# Gate G2 — Runtime providers, hosted backend and release build (M24)

_Status: **awaiting approval** (2026-09-26). This gate follows the G1 decision: "When a real
runtime provider becomes necessary to continue V1, stop at that approval gate and present the
options." V1 RC can't truthfully pass without these decisions, because the core promise (a
verified manufacturer schedule) can't be delivered to real users._

Everything below is **already implemented behind provider-independent ports and tested with labeled
mocks**. Approving an option means configuration, credentials and a thin adapter. It doesn't mean a
redesign. **Prices and limits are approximate and must be checked on the vendor's site before
committing.**

## 1. Source discovery (finding the official manual)

| Option                                                | How it works                                                                                                                                                                                          | Trust                                                       | Cost / effort                                                     |
| ----------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- | ----------------------------------------------------------------- |
| **A. Curated official registry (recommended for V1)** | The team verifies official manufacturer/importer domains and manual URLs per make/model/year for the Israeli market and records the evidence (who and when). The app "discovers" only from that list. | Highest: no search results involved                         | No API cost; editorial effort per model; coverage grows over time |
| B. Web search API + registry filter                   | A search API (e.g. Brave Search API, Google Programmable Search) proposes candidates; only hosts in the verified registry can gain authority.                                                         | High (authority still comes only from the registry)         | Per-query fees; still needs registry entries                      |
| C. AI browsing agent + registry filter                | An LLM with a web-search tool proposes candidates; the registry decides.                                                                                                                              | High for the same reason, but costlier and less predictable | Per-token and per-search fees                                     |

## 2. Document reading (OCR + structured extraction)

| Option                                                                                   | Notes                                                                                                                                                                                                                        | Privacy / cost                                                                                                         |
| ---------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| **A. Anthropic Claude API via a server-side function (recommended)**                     | Native PDF/image input, strong Hebrew, structured output; runs in a Supabase Edge Function, so the API key never ships in the app. The existing untrusted-content boundary, schema validation and grounding apply unchanged. | Documents leave the device (disclose in the privacy notice); per-page token cost                                       |
| B. Cloud OCR (Google Document AI / Azure Document Intelligence) + an LLM for structuring | Two vendors, more integration; OCR quality on Hebrew needs testing                                                                                                                                                           | Two data processors; per-page fees                                                                                     |
| C. On-device OCR only                                                                    | Most private, no cost                                                                                                                                                                                                        | Hebrew support in common on-device OCR SDKs is weak or absent, so it's **not viable** for Hebrew licenses and invoices |

## 3. Hosted Supabase project (T065)

- **Region:** EU (e.g. Frankfurt), for proximity and GDPR-grade handling.
- **Plan:** Free is enough for a pilot. Its projects pause after inactivity and have small storage limits. **Pro** (roughly $25/month) is recommended before real users.
- **SMTP:** a transactional email provider for the sign-in code. The template is in the repo.
- **Deployment:** apply `supabase/migrations/*` and `config.toml` auth settings, then run the cloud test suite against a staging project.

## 4. Release build & distribution

| Option                                        | Notes                                                                                                                                      |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| **A. EAS Build (Expo account) — recommended** | Cloud builds avoid the Windows non-ASCII path problem (ADR-0005) and manage the Android keystore. The free tier has a monthly build quota. |
| B. Local Gradle build                         | Needs a `subst` drive / ASCII path, local keystore management, and Android SDK/NDK setup                                                   |

Both paths also need a **Google Play Console** developer account (one-time fee) for store distribution, or internal APK distribution for a closed pilot.

## What happens after approval

1. Configure the approved providers behind the existing ports. Add the registry entries with their evidence.
2. Create the staging and hosted Supabase project, set EAS secrets and env, and run the cloud suite against staging.
3. Build a release APK and re-verify on the phone: native RTL inputs, camera capture storage, notifications, and the registry lookup on a connected network.
4. Run the final regression, write the RC report, and declare **AUTOKEEP V1 RC PASS** (T184).
