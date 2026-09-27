# P1 official source verification (research, 2026-09-27): APPROVAL GATE

**Status: research only.**

- No application code, trusted-source configuration or allowlist was changed.
- `OFFICIAL_DOMAINS` and `KNOWN_OFFICIAL_SOURCES` remain empty. The RC baseline `35478a2` is untouched.
- This supersedes the evidence in `CANDIDATES.md`; every candidate listed there was re-checked from scratch.

## Method and evidence types

Supported brands are the manufacturer keys in `src/discovery/registry.ts`: toyota, mazda, hyundai,
kia, skoda, volkswagen, suzuki, honda, yamaha, kawasaki and sym. Honda and Suzuki each have a car
segment and a two-wheeler segment, which gives 13 brand/segment rows.

Evidence types, strongest first:

- **(a) Manufacturer listing.** The manufacturer's own site names or links the Israeli distributor.
- **(b) Government.** The Ministry of Transport importer price list (data.gov.il `mehir_yevuan`,
  model years 2023 and later). It covers cars only; no government importer data exists for
  two-wheelers.
- **(c) Registry.** The public ISOC-IL WHOIS registrant (whois.isoc.org.il, port 43, no captcha).
- **(d) Self-statement.** Importer-controlled pages. Supporting only, never sufficient on its own.
- **TLS certificates.** No evidence: every live certificate checked is domain-validated and names
  no organization.

A domain is **VERIFIED_OFFICIAL_DOMAIN** when (a), (b)+(c) or (a)+(c) holds. For each site,
robots.txt was read first and its disallowed paths were skipped. Terms of use were read for
automation and copying clauses. No login, form submission, captcha or paid service was used.

Classifications:

- **VERIFIED_OFFICIAL_DOMAIN**
- **VERIFIED_OFFICIAL_MAINTENANCE_SOURCE**: publishes a per-model schedule reachable without restriction
- **CANDIDATE_UNVERIFIED**
- **INACCESSIBLE**: blocked by robots, forms, login, bot protection or terms
- **NO_SOURCE_FOUND**

Generic service advice ("every 15,000 km or a year") is never treated as a schedule.

## 1. Importers and verified official domains

| Brand / segment    | Manufacturer (official domain)                                             | Israeli importer (legal entity)                           | Verified official domain(s)                             | Evidence                                                                                                                                                                                                    |
| ------------------ | -------------------------------------------------------------------------- | --------------------------------------------------------- | ------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Toyota             | Toyota Motor Corp. (global.toyota; Toyota Motor Europe: toyota-europe.com) | יוניון מוטורס בע"מ (Union Motors Ltd.)                    | toyota.co.il                                            | (b) MoT; (c) WHOIS "Union Motors Ltd."; the site runs on Toyota Europe's platform (assets and APIs on toyota-europe.com). No (a) page found: the country selectors are JavaScript                           |
| Mazda              | Mazda Motor Corp. (mazda.com)                                              | דלק מוטורס בע"מ, ח.פ 510947153                            | mazda.co.il (+ api.mazda.co.il)                         | (a) mazda.com/en/region/ entry `IL … url http://www.mazda.co.il/ … company "Delek Motors Ltd."`; (b); (c) "Delek Motors Ltd."                                                                               |
| Hyundai            | Hyundai Motor Co. (hyundai.com)                                            | כלמוביל (Colmobil Ltd.)                                   | hyundaimotors.co.il, colmobil.co.il                     | (a) hyundai.com "Global Distributors": "Israel – Colmobil Ltd." (the company, no domain); (b) "כלמוביל יונדאי"; (c) both domains "Colmobil Group LTD."                                                      |
| Kia                | Kia Corp. (kia.com, worldwide.kia.com)                                     | טל-קאר (Talcar)                                           | kia-israel.co.il (+ cdnmedia.)                          | (a) worldwide.kia.com/en/kia-global-websites links Israel → kia-israel.co.il; (b) "טל - קאר"; (c) registrant "KMI LTD" (its link to Talcar is unconfirmed)                                                  |
| Škoda              | Škoda Auto (skoda-auto.com)                                                | צ'מפיון מוטורס בע"מ                                       | skoda.co.il                                             | (a) skoda-auto.com/company/importers links Israel → skoda.co.il; (b); (c) "Champion Motors Ltd."                                                                                                            |
| Volkswagen         | Volkswagen AG (volkswagen-group.com)                                       | צ'מפיון מוטורס בע"מ                                       | vw.co.il, vwcv.co.il, championmotors.co.il, champ.co.il | (a) VW Group press release (2018): Champion Motors is "the direct importer and distributor of Volkswagen, Audi, SKODA, SEAT…" (the company, no domain); (b); (c) every domain registered to Champion Motors |
| Suzuki cars        | Suzuki Motor Corp. (globalsuzuki.com)                                      | מכשירי תנועה ומכוניות (2004) בע"מ                         | suzuki.co.il                                            | (a) globalsuzuki.com/globallinks: Israel, car → suzuki.co.il ("Automotive Equipment & Vehicles (2004) Ltd."); (b); (c) "Machsirey Tnuaa"                                                                    |
| Suzuki motorcycles | Suzuki Motor Corp.                                                         | Avnir Motor Co., Ltd. (עופר אבניר)                        | oferavnir.co.il (path /suzuki/)                         | (a) globalsuzuki.com/globallinks: Israel, bike → oferavnir.co.il/suzuki/; (c) registrant "Ofer Motor Co. Ltd." (name differs slightly)                                                                      |
| Honda cars         | Honda Motor Co. (global.honda)                                             | מאיר חברה למכוניות ומשאיות בע"מ                           | honda.co.il, hondacars.co.il, mct.co.il                 | (a) global.honda "Honda World Links": Israel, Mayer's Cars and Trucks, Distributor for Automobiles, Motorcycles and Power Products → honda.co.il; (b); (c) all registered to Mayer                          |
| Honda motorcycles  | Honda Motor Co.                                                            | Same importer as Honda cars (**not** a separate importer) | honda.co.il, hondabike.co.il                            | (a) same listing; (c) "Meir Cars Ltd."                                                                                                                                                                      |
| Yamaha             | Yamaha Motor Co. (global.yamaha-motor.com)                                 | מטרו מוטור שיווק (1981) בע"מ (brand "מטרו freesbe")       | yamaha-motor.co.il                                      | (a) global.yamaha-motor.com sales network: "Israel – Metro Motor Ltd." → yamaha-motor.co.il; (c) "Metro Motor"                                                                                              |
| Kawasaki           | Kawasaki Motors, Ltd. (global-kawasaki-motors.com)                         | מטרו מוטור שיווק (1981) בע"מ                              | metro.co.il, kawasaki.co.il                             | (a) global-kawasaki-motors.com portal: Israel, "Metro Motor Marketing (1981) Ltd." → metro.co.il; (c) kawasaki.co.il "Metro Motors Ltd."                                                                    |
| SYM                | Sanyang Motor Co. (sym-global.com)                                         | מטרו מוטור שיווק (1981) בע"מ                              | sanyang.co.il                                           | (a) sym-global.com/global-distributors: "Israel Metro Motor Marketing(1981)LTD … https://www.sanyang.co.il/"; (c) "Metro Motor Ltd."                                                                        |

**Not official evidence, and never to be allowlisted as authority:**

- the CDNs res.cloudinary.com/colmobil (Hyundai PDFs) and khi-new…digitaloceanspaces.com;
- the viewers online.flippingbook.com, calameo.com and cms.ituran.com (Champion's manual summaries);
- library.ymcapps.net (the Yamaha manual library) and pws.ktivs.net (the Kawasaki manual portal), whose ownership is unproven;
- every third-party manual mirror.

## 2. Maintenance data actually available

| Brand / segment          | What official sources expose                                                                                                                                      | Per-model schedule?                                                                                                       | Access                                                                                                                      | Classification                                                                                              |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Toyota                   | toyota.co.il/owners/…/owners-manuals says it provides "לוחות האחזקה" per model and year                                                                           | Claimed, not confirmed                                                                                                    | JavaScript model/year selector (Toyota Europe "pubhub"); no static links; the terms host is behind Incapsula and unreadable | INACCESSIBLE                                                                                                |
| Mazda                    | mazda.co.il/service-plans: per-model replacement plan by model and year ("נכון ל-24/11/2024")                                                                     | Yes (per-model)                                                                                                           | Client-side JavaScript form; no public endpoint; terms forbid copying                                                       | INACCESSIBLE                                                                                                |
| Hyundai                  | 63 Hebrew owner's manuals (for example Tucson Hybrid 2025) as static PDFs on res.cloudinary.com/colmobil, linked from hyundaimotors.co.il/maintenance/            | **Yes**: a periodic maintenance table (15–120k km, 12–96 months) inside the manuals                                       | Reachable, but the **terms ban crawlers/robots and copying/storing**. Hebrew text needs rendering or OCR to read            | Official content, **automation prohibited**                                                                 |
| Kia                      | 35 Hebrew owner's manuals as static PDFs on cdnmedia.kia-israel.co.il (for example Sportage Hybrid 2026)                                                          | **Yes**: a maintenance table in the manuals                                                                               | Reachable, but the **terms ban automated retrieval and copying without Talcar's written permission**                        | Official content, **automation prohibited**                                                                 |
| Škoda                    | Only the legally required "תמצית הוראות שימוש" summaries, on third-party viewers. The manufacturer portal skoda-auto.com/apps/manuals has no Israel/Hebrew locale | None found                                                                                                                | robots `Disallow: /*.pdf$`; terms ban automation                                                                            | NO_SOURCE_FOUND                                                                                             |
| Volkswagen               | Spec sheets; the same summaries. userguide.volkswagen.de returns 401                                                                                              | None found                                                                                                                | Terms ban automation                                                                                                        | NO_SOURCE_FOUND                                                                                             |
| Suzuki cars              | About 35 Hebrew and Arabic driver's manuals as static PDFs (suzuki.co.il/sites/default/files/pdf/…)                                                               | **Yes**: a periodic maintenance table (checked in one Arabic manual; Hebrew not yet checked)                              | robots allows; the **terms explicitly ban "רובוטים, זחלים, עכבישים" and copying**                                           | Official content, **automation prohibited**                                                                 |
| Suzuki motorcycles       | Unknown                                                                                                                                                           | Unknown                                                                                                                   | The site redirects automated requests to an abuse page; robots.txt is unreadable                                            | INACCESSIBLE                                                                                                |
| Honda cars / motorcycles | Brochures; the service price quote needs a plate and phone number; the motorcycle article is generic advice only                                                  | None found                                                                                                                | —                                                                                                                           | NO_SOURCE_FOUND                                                                                             |
| Yamaha                   | Nothing on yamaha-motor.co.il. The Yamaha manual library has no Israel region and sits behind a JavaScript app, a terms modal and bot protection                  | None found                                                                                                                | —                                                                                                                           | NO_SOURCE_FOUND (library: CANDIDATE_UNVERIFIED)                                                             |
| Kawasaki                 | Nothing on the Israeli sites. kawasaki.com (US) `Disallow: /*.pdf`. KTIVS portal: JavaScript/session/search only                                                  | None found                                                                                                                | —                                                                                                                           | NO_SOURCE_FOUND (KTIVS: CANDIDATE_UNVERIFIED)                                                               |
| SYM                      | **sym-global.com model pages link static owner's-manual PDFs** (for example `…/13-1-JOYRIDE-S-E5/download/JoyrideE5MANUAL.pdf`)                                   | **Yes**: "Periodical Maintenance Schedule" (for example oil filter cleaning every 10,000 km, brake fluid every 30,000 km) | robots.txt has no disallow rules; no terms of use found                                                                     | **VERIFIED_OFFICIAL_MAINTENANCE_SOURCE** (manufacturer, global E5 editions); Israeli-model match unverified |

**Bottom line:**

- Only **SYM** (the manufacturer's own site) offers per-model schedules without an automation restriction.
- **Hyundai, Kia and Suzuki cars** publish real per-model schedules in official Hebrew manuals, but their terms prohibit automated retrieval and copying without written permission.
- **Toyota and Mazda** keep theirs behind JavaScript forms, and their terms restrict copying.
- **Škoda, VW, Honda, Yamaha and Kawasaki** have no usable official per-model schedule for Israel.

## 3. Automation restrictions by domain

| Domain                                              | robots.txt (relevant)                  | Terms of use on automation / copying                                                                                      |
| --------------------------------------------------- | -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| toyota.co.il                                        | /owners allowed; Sitemap               | Unreadable (Incapsula on union-motors.toyota.co.il)                                                                       |
| mazda.co.il                                         | Allow /; Sitemap                       | "אין להעתיק, להפיץ… בלא קבלת הסכמתה של דלק מוטורס בכתב"                                                                   |
| hyundaimotors.co.il                                 | /maintenance allowed                   | Bans "Crawlers, Robots… חיפוש, סריקה, העתקה או אחזור אוטומטי" and copying/storing                                         |
| kia-israel.co.il                                    | Only /wp-admin                         | Bans automatic "חיפוש, סריקה, העתקה או אחזור" and copying/storing without Talcar's written permission                     |
| skoda.co.il / vw.co.il                              | `Disallow: /*.pdf$` (skoda); vw allows | Same crawler/robots and copying ban                                                                                       |
| suzuki.co.il                                        | Standard Drupal                        | Explicit ban on "רובוטים, זחלים, עכבישים ו/או כל אמצעי אוטומטי" and copying                                               |
| oferavnir.co.il                                     | Unreadable (abuse redirect)            | Unknown                                                                                                                   |
| honda.co.il / hondacars / hondabike                 | Allow                                  | "אין להעתיק, להפיץ… בלא הסכמת מאיר מראש ובכתב"                                                                            |
| yamaha-motor.co.il / sanyang.co.il / kawasaki.co.il | Allow, except search/login             | Personal use only; no copying for distribution without written approval (kawasaki.co.il: Cloudflare blocks plain clients) |
| sym-global.com                                      | No disallow rules                      | None found                                                                                                                |

**Consequence for the current code (reported, not changed).** The zero-cost
`OfficialSiteDiscoveryProvider` crawls the robots.txt and sitemaps of every domain in
`OFFICIAL_DOMAINS`. Robots rules alone are **not** sufficient: most importer terms forbid automated
retrieval. Adding these domains unchanged would make the app violate those terms.

## 4. Recommended zero-cost production strategy

1. **Authority-only registry first.** Add the verified official domains from §1 as
   _authority_ entries, with a new per-domain flag `automation: 'prohibited' | 'permitted' |
'unknown'`. The flag defaults to `prohibited` wherever the terms ban it, and the crawler never
   touches `prohibited` or `unknown` domains. This keeps classification correct at zero cost and
   crawls nothing that is forbidden.
2. **Curated, hash-pinned schedules only where the source allows it.**
   - Start with **SYM**: the manufacturer publishes the schedules and no restriction was found.
     This only applies after a person verifies that each Israeli model sold on sanyang.co.il
     matches the global E5 manual.
   - Use the existing `npm run curate:check` for the quotes, pages and hash.
3. **Ask the importers for written permission** (free: an e-mail from AutoKeep's owner).
   - **Priority:** Colmobil (Hyundai), Talcar (Kia) and Machsirey Tnuaa (Suzuki cars). Their
     official Hebrew manuals already contain per-model schedules.
   - **Next:** Delek (Mazda) and Union (Toyota), whose per-model plans sit behind JavaScript forms.
   - Until permission is granted, these brands stay "unable to verify". Nothing is inferred.
4. **User-supplied official document (a design option for P2, needs approval).** The user
   downloads the manual themselves from the importer site, as a personal use the terms allow, and
   uploads it. It counts as the official document **only if its SHA-256 equals a hash pinned in
   the verified registry**. This needs a registry of document hashes, which itself implies a
   one-time human download per document; permission status still applies to transcribing the
   schedule into the app.
5. **No source found** (Škoda, VW, Honda, Yamaha, Kawasaki, Suzuki motorcycles): keep them
   "unable to verify". Manual service tracking still works fully. Re-check the manufacturer
   portals if an Israel locale appears.

## 5. Approvals required before P2 implementation

1. **Approve the verified official domain list** in §1, domain by domain, for authority
   classification only. Explicitly reject the CDNs, viewers and portals listed as not official.
2. **Policy: treat terms of use as binding for automation**, in addition to robots.txt.
   Recommendation: yes. This is a code change (the per-domain `automation` flag, with the crawler
   disabled where it is prohibited) and a change to the trusted-source configuration.
3. **SYM pilot.** Approve curating the SYM models sold in Israel from sym-global.com manuals. Each
   entry still needs a person to confirm the Israeli model match, and your sign-off.
4. **Legal position.** Decide whether transcribing maintenance intervals, which are factual data
   points with page references, from an official manual is acceptable without the importer's
   permission. The terms of Hyundai, Kia, Suzuki, Mazda and Honda forbid "copying" site content.
   Recommendation: do not transcribe without written permission.
5. **Importer outreach.** Do you want to request written permission from Colmobil, Talcar,
   Machsirey Tnuaa, Delek and Union Motors? This is an external communication, so it is yours to
   send.
6. **Optional design:** the user-supplied official document with a hash match (§4.4).

## 6. Open questions

- Kia: is the WHOIS registrant "KMI LTD" part of Talcar?
- Suzuki motorcycles: "Ofer Motor Co." versus "Avnir Motor Co."
- Metro Motor's relationship to Carasso Motors (the freesbe group operator named in the
  metro.co.il terms).
- Whether www.kia.co.il is Talcar's.
- Whether the Hyundai service booklet contains a schedule.
- Whether the Toyota "לוחות אחזקה" are per-model PDFs.
- Honda Europe and Mazda Europe owner portals were not checked for Israeli coverage.

## 7. Research conduct and disclosure

About 190 fetches were made by three research agents, all read-only.

For verification only, the agents downloaded a few official documents:

- one Suzuki manual, one Hyundai manual, one Kia manual and one Hyundai service booklet (from sites whose terms restrict copying and storing);
- one SYM manual and one Kawasaki dealer list (from manufacturer sites with no such restriction).

**All downloaded copies and fetched pages were deleted** after the findings were recorded; nothing
is stored in the repository.

Opening the KTIVS portal page auto-created an anonymous guest session; no search or form was
submitted.

## 8. Decision record (user, 2026-09-27)

1. The P1 research is approved as a docs-only checkpoint: one local commit, no amendment of
   `35478a2`, no push.
2. The **21 evidence-backed domains in §1 are approved as VERIFIED AUTHORITY DOMAINS only**. This
   grants **no** automated retrieval, **no** crawler access, **no** verified-maintenance-source
   status, and **no** permission to copy or store schedules.
3. The non-official or unproven hosts and portals listed in §1 are **rejected** as authoritative
   sources unless future evidence establishes ownership.
4. **Production policy:** automated retrieval requires BOTH (a) technical access allowed by
   robots and access controls, AND (b) no known applicable terms or restrictions prohibiting the
   intended automation. If either fails or is uncertain, the app does not crawl.
5. No transcribing, copying or storing of maintenance intervals from a source whose terms
   prohibit that use without written permission.
6. **The SYM verification pilot only is approved.** Before any schedule becomes verified, it must
   be proven that the exact Israeli vehicle, model and version matches the official manufacturer
   document. Global-model similarity alone is insufficient. No fabricated or inferred intervals.
7. **User-supplied documents are approved as a production design path.**
   - Provenance is preserved and vehicle/document matching is verified.
   - Upload alone never makes a document an official verified source.
   - A hash match against a previously verified, pinned official document may strengthen
     verification.
8. **Importer outreach remains a future external-action gate.** No contact yet.

Implementation (P2) has **not** started and waits for an explicit instruction.
