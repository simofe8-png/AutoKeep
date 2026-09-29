# Maintenance source research (2026-09-29): registry inputs

Read-only research by four research agents for the universal maintenance-discovery engine
(docs/release/MAINTENANCE_DISCOVERY.md). It maps official domains, robots.txt, terms of use and
document-library structure per manufacturer. **No maintenance interval was transcribed.**
Downloaded example documents were deleted. Every host here is `proposed` in
`src/discovery/maintenance/sourceRegistry.ts` until the owner approves it.

---

## Research A: Tesla, MG (SAIC), Peugeot (Stellantis): official source registry inputs

Date: 2026-09-29. Method: curl with a browser UA and plain GETs only, plus WebFetch and WebSearch. No logins, forms or POSTs. The MG and Peugeot Israel library AJAX endpoints were identified from JS and **not called**. Downloaded PDFs were deleted after the check. No maintenance intervals are recorded here.
Policy reminder: uncertain = no automation.

Legend: FETCHED = I retrieved it myself, with the HTTP status shown. INDEX = the fact comes only from search-engine results, not a fetch. UNVERIFIED = not confirmed.

---

## 1. Tesla

### Host www.tesla.com (manufacturer site + owner's manual library)

- **Role:** global manufacturer site and owner's manual library `/ownersmanual/`.
- **Ownership:** Tesla's own primary domain. Israel store and service pages live under `tesla.com/he_il/findus/...` (INDEX).
- **Access:** **Every fetch returned HTTP 403 "Access Denied" from Akamai (errors.edgesuite.net)**, from both curl with a browser UA and WebFetch. That covers `/robots.txt`, `/legal/terms`, `/he_il`, `/ownersmanual/model3/en_eu/`, `/ownersmanual/model3/en_eu/Owners_Manual.pdf`, `/ownersmanual/model3/en_il/Owners_Manual.pdf` and `/ownersmanual/model3/he_il/Owners_Manual.pdf`.
- **robots.txt:** unreadable (403, bot-protected).
- **Terms:** `https://www.tesla.com/legal/terms` returned 403. The clause below is quoted from search-engine results only (INDEX, not fetched): "you may not ... reverse engineer ... or scrape or extract any data from it" (applies to "Tesla Technology"). Search results also mention that access can be suspended or terminated.
- **Automation verdict: PROHIBITED.** Two reasons: active bot blocking, and an anti-scrape clause (INDEX).
- **Library structure (INDEX only, nothing fetched):**
  - The HTML manual is split into GUID-named topic pages: `/ownersmanual/{model}/{locale}/` plus `/ownersmanual/{model}/{locale}/GUID-{uuid}.html`.
  - A whole-manual PDF sits at `/ownersmanual/{model}/{locale}/Owners_Manual.pdf`.
  - Model slugs seen: `model3`, `2017_2023_model3`.
  - Locales seen: en_us, en_eu, en_is, en_ae, en_au, en_kr, en_sa, en_cl, en_mx, en_nz, en_th, **en_il** (the PDF title says "Software version 2026.14 Israel").
  - **No he_il manual was found** (the he_il PDF URL returned 403, so its existence is UNVERIFIED).
  - Manuals are versioned by car software version, not by edition date.
  - Search indexes a maintenance topic, "Maintenance Service Intervals" (`GUID-E95DAAD9-…` in en_us), so a maintenance section exists: **yes (INDEX)**.
- **Example check:** Model 3 en_eu PDF returned 403, so the content-type and text layer are UNVERIFIED.

### Host service.tesla.com

- **Role:** Service Manual and DIY docs, `/docs/{Model}/ServiceManual/{year}/{locale}/` (INDEX).
- **Access:** 403 from Akamai, for both robots.txt and the index page.
- **Automation verdict: PROHIBITED / unknown** (blocked).

### Israel

- Tesla sells directly. The legal entity is **Tesla Motors Israel Ltd (טסלה מוטורס ישראל בע"מ), company no. 516106986, Petah Tikva**. Source: INDEX via checkid.co.il and kycisrael.com; the Israeli Registrar was not checked, so treat as UNVERIFIED.
- There is no separate Israeli domain: the country pages are `tesla.com/he_il/...`.
- `tesla-israel.co.il` is a **third-party financing site, not Tesla**. Do not register it.
- No Israeli maintenance publication beyond the en_il manual was found.

---

## 2. MG (SAIC Motor)

### Host www.saicmotor.com (parent group)

- FETCHED 200: corporate site of 上海汽车集团 (SAIC Motor, stock code 600104).
- robots.txt returned 404, meaning none is published.
- No owner documents found there. Not a library source.

### Host www.mgmotor.eu (MG Motor Europe)

- **Ownership:** Impressum (FETCHED): **SAIC Motor Europe B.V., Amsterdam**.
- **robots.txt** (FETCHED 200): contains only `sitemap:` lines for about 25 country domains (mgmotor.de/.fr/.it/.es/...). There are no User-agent or Disallow rules, so nothing is formally disallowed.
- **Terms:** no terms-of-use page was found. The footer has only Impressum, Privacy, Cookie, Accessibility, Open Source and EU Data Act, and the Impressum has no content-use clause. **Terms: not found.**
- **Automation verdict: UNKNOWN**, so no automation.
- **Library:** `https://www.mgmotor.eu/owners/user-manuals` (FETCHED 200).
  - The primary path is **VIN-based lookup** (17-digit VIN) rendered by JS. There are no PDF links in the HTML and no public API was discoverable.
  - Model pages are linked from the footer.
- **Host cdn.mgmotor.eu:** direct PDFs (pattern from INDEX: `/manuals/{Model}-owner-manual-EN_compressed.pdf`).
  - Example `MG3-owner-manual-EN_compressed.pdf`: **200, application/pdf, 8.16 MB**. It has a text layer and **a maintenance section: yes** ("Maintenance" / "Maintenance Instructions").
  - `MG3-service-manual-EN.pdf` returned 404.
  - The CDN's robots.txt returned 404 (Cloudflare).
- **Host rmi.mgmotor.eu:** paid, registered RMI portal. robots.txt is `User-agent: * / Disallow: /`. **Excluded.**

### Host www.mg.co.uk (MG Motor UK)

- **Ownership:** Terms (FETCHED 200): "operated by MG MOTOR UK Ltd (registered number 05779958)", a subsidiary chain up to SAIC.
- **robots.txt** (FETCHED 200): `User-agent: *` with an empty `Disallow:`, which allows everything.
  - Anomaly: its `Sitemap:` lines point to **mazda.eu**, so they look misconfigured. Ignore them.
- **Terms** (`https://www.mg.co.uk/terms-and-conditions`, curl 200; WebFetch got 403):
  - "You may view, use, download and store the material on this website for personal and research use only. Commercial use is not permitted."
  - "The re-distribution, re-publication, or otherwise making available of the material … to third parties is prohibited."
  - There is no explicit robots or scraping clause.
- **Automation verdict: RESTRICTED.** Fetching on a user's behalf for personal reference may fit "personal use". Commercial storage or redistribution is prohibited. Legal review is needed, so the default is **no bulk automation**.
- **Library:** `https://www.mg.co.uk/owner-manuals` is **static HTML with about 50 direct PDF links** (owner manuals plus quick guides).
  - Pattern: `/sites/default/files/{YYYY-MM}/{free-form name}.pdf`, for example `/sites/default/files/2021-11/MG%20ZS%20Owner%20Manual.pdf`.
  - Filenames are not normalized, so the model-to-document mapping must come from the page anchor text.
  - Locale: UK English only.
  - Related pages: `/servicing` and `/mg-service-plans`.

### Israel: mg-israel.co.il

- **Importer:** **Car East Vehicle Import Ltd. (קאר איסט יבוא רכב בע"מ)**, part of the **Lubinski Group**. Evidence:
  - the site terms name the entity;
  - `ai.txt` says "imported by Lubinski Group";
  - the WordPress theme is `wp-content/themes/lubinski`;
  - lubinski.co.il/our-brands lists MG.
- **robots.txt** (200): `Allow: /`. It disallows `/wp-admin/` and `/my-order/`, explicitly allows GPTBot and OAI-SearchBot, and points to `ai.txt` and `llms.txt`.
  - `ai.txt` says content "may be used for informational summaries and user assistance".
- **Terms** (`https://mg-israel.co.il/site-regulations/`):
  - §4.2: "אין להעתיק את תכני האתר… אין לפרסם, להעתיק, להפיץ, לשכפל…"
  - §10.1: download, print or copy allowed only "לשימושך האישי והלא מסחרי".
  - There is no automated-access clause.
- **Automation verdict: RESTRICTED / conflicting.** robots.txt and ai.txt are permissive, but the ToS prohibits copying except for personal non-commercial use. Treat as **no automated storage** until legal review.
- **Library:** `https://mg-israel.co.il/guide-books/` is a model-and-year selector.
  - The HTML embeds a JSON array `modelsYears = [{modelName, yearRanges[], docType:[{range, docType, docTypeId, docId}]}]` covering 20 models.
  - Document links are produced by a **POST to `/wp-admin/admin-ajax.php` with `action=get_clearmash_doc_url`** (docIds, model, docs, docTypes). **This was not called**: it is a form-style POST.
  - Document types offered (Hebrew): ספר נהג, מדריך מקוצר, חוברת ניווט ומולטימדיה, נספח לספר נהג.
  - **No dedicated maintenance plan or service booklet type** is offered. The site also has `/mg_warranty/`, `/recall/` and `/software-updates/`.

---

## 3. Peugeot (Stellantis)

### Host www.peugeot.com, www.peugeot.co.uk, www.peugeot.fr, www.stellantis.com

- **Access:** all returned **403 Akamai "Access Denied"** for robots.txt and pages (curl and WebFetch).
- **robots.txt:** unreadable.
- **Terms (INDEX only):** the peugeot.co.uk legal information (`/tools/legal-info.html`) is reported as saying no part "may be reproduced … or stored in any retrieval system without the written permission of the copyright holder"; personal non-trading use is allowed.
- **Automation verdict: PROHIBITED** (bot-blocked, plus a reproduction and storage restriction).

### Host public.servicebox.peugeot.com: APddb "INFOTEC" handbook library (the key source)

- **Ownership:** the legal notice PDF at `/contenu/AC/contenu_en.pdf` (FETCHED 200, then deleted) says the site is "owned by STELLANTIS AUTO SAS" and operated by Automobiles Peugeot SA and others. The APddb page footer links to stellantis.com.
  - Caveat: that notice's heading names `public.servicebox-parts.com` (the independent-operator portal), so its applicability to APddb is likely but UNVERIFIED.
- **robots.txt:** connection failed (curl status 000). An earlier try on the wrong hostname, public-servicebox, returned a PSA 503 "Access Denied". **Treat as unreadable.**
- **Terms:** "any reproduction, use, representation, adaptation … by any means and on any medium … of any element of the Website is prohibited without the prior written authorisation".
- **Automation verdict: PROHIBITED** (no reproduction or storage; robots unknown).
- **Library structure (FETCHED, all 200, static files):**
  - Entry point: `https://public.servicebox.peugeot.com/APddb/index.html` (a mootools JS app).
  - Language list: `/APddb/interface/hard_divs/langues.xml`, 36 locales **including `he_il`** (also en_us, fr_fr, de_de, …).
  - Vehicle and edition catalog per language: `/APddb/interface/hard_divs/carnav_{lang}.xml`. Each entry is `dCar(mode, vehicule, silhouette, edition)`, with mode = `pdfsimple` or `eGuide`, and carries the validity date range.
  - Edition manifest: `/APddb/modeles/{vehicule}/{silhouette}/{edition}/{lang}/edition.xml`.
  - Viewer page: `/APddb/modeles/{vehicule}/{silhouette}/{edition}/{lang}/index.html`, which iframes the PDF.
  - eGuide PDFs (INDEX): `/APddb/modeles/{vehicule}/eGuide_{code}_{edition}/pdfs/9999_9999_{n}_{locale}.pdf`.
  - Format: PDF with a text layer.
- **Example check:** Peugeot 2008 (2008.p2 / p24 / ed05-25 / he_il).
  - `edition.xml` returned 200 (`type="pdfsimple"`).
  - `index.html` returned 200 and references `P2008BO2505he-1.pdf`.
  - The PDF returned **200, application/pdf, 14.7 MB, Hebrew text layer**.
  - **Maintenance section: yes**, chapter "תחזוקה וטיפוח הרכב".
  - The handbook refers to a **separate service booklet ("חוברת השירות")**. No public service booklet was found in the library.

### Israel: Peugeot importer

- **Importer:** **David Lubinski Vehicle Import Ltd. (דוד לובינסקי יבוא רכב בע"מ)**, Lubinski Group. Evidence:
  - the site terms name the entity;
  - lubinski.co.il/our-brands lists Peugeot, Citroën, Opel, DS, MG and IM.
- **Host www.peugeot.co.il:** 403 Akamai (Stellantis platform). robots.txt, pages and terms are unreadable. Verdict: **PROHIBITED/unknown**.
- **Host online.peugeot.co.il** (Lubinski WordPress):
  - robots.txt (200): `Allow: /`; it disallows `/wp-admin/` and `/my-order/`.
  - Terms (`/site-regulations/`): §8.1 "אין להעתיק, לשנות, להתאים, לפרסם, לשדר, להפיץ…". Personal non-commercial download is allowed. There is no automated-access clause.
  - **Verdict: RESTRICTED**, so no automated storage.
- **Library:** `https://online.peugeot.co.il/guide-books/` uses the same `modelsYears` JSON and admin-ajax mechanism as MG Israel. **It was not called.**
  - It covers 16 models.
  - Only two document types are offered: מדריך מקוצר and נספח לספר נהג.
  - For the full Hebrew handbook it **links to `public.servicebox.peugeot.com/APddb/index.html`**.
  - **No maintenance plan or service booklet was found.**
- **Host www.lubinski.co.il** (group site):
  - robots.txt: `Allow: /`, disallows `/wp-admin/`.
  - Terms (`/תקנון/`): §4.2 and §8.2 prohibit copying and distribution; §8.1 allows personal non-commercial use.
  - It has no manual library.

---

## Registry takeaways

| Host                                | Role                                                | robots                 | Terms (auto/copy)                                 | Verdict                   |
| ----------------------------------- | --------------------------------------------------- | ---------------------- | ------------------------------------------------- | ------------------------- |
| www.tesla.com /ownersmanual         | Tesla OM (HTML GUID pages + PDF, en_il)             | 403 unreadable         | anti-scrape (INDEX)                               | PROHIBITED                |
| service.tesla.com                   | Tesla service manual                                | 403                    | n/a                                               | PROHIBITED/unknown        |
| www.mgmotor.eu, cdn.mgmotor.eu      | MG EU OM (VIN JS; CDN PDFs)                         | sitemaps only / 404    | none found                                        | UNKNOWN, so no automation |
| rmi.mgmotor.eu                      | paid RMI                                            | Disallow /             | paid                                              | EXCLUDED                  |
| www.mg.co.uk                        | MG UK OM (static PDF list)                          | allow all              | personal and research use only; no redistribution | RESTRICTED                |
| mg-israel.co.il                     | MG IL importer (Car East / Lubinski)                | allow, AI bots allowed | no copying except personal                        | RESTRICTED                |
| peugeot.com/.co.uk/.fr/.co.il       | Stellantis brand sites                              | 403                    | no reproduction/storage                           | PROHIBITED                |
| public.servicebox.peugeot.com/APddb | Peugeot handbook library (XML catalog, PDFs, he_il) | unreadable             | reproduction prohibited                           | PROHIBITED                |
| online.peugeot.co.il                | Peugeot IL importer (Lubinski)                      | allow                  | no copying except personal                        | RESTRICTED                |

**Common pattern:** none of these hosts publish a standalone public maintenance schedule document, except Tesla's owner's manual, which has a maintenance topic but is bot-blocked. The MG and Peugeot handbooks have maintenance chapters, and Peugeot defers intervals to a service booklet that is not publicly available.

**Safest engine behaviour:** link out to the source (a deep link the user opens), or let the user upload a document they obtained themselves. Do not fetch or store from these hosts automatically.

---

## B: Mazda / Toyota / Suzuki: manufacturer & regional owner-manual sources

Research date: 2026-09-29. Method: curl with a browser UA and WebSearch/WebFetch, read-only. No logins, forms, captchas or click-through acceptance.
Israeli importer sites were out of scope because they were already researched. No maintenance intervals are transcribed here.
Policy applied: if the terms are uncertain or prohibit automation, the source is not automated.

Verdict legend:

- **PERMITTED**: robots and terms both allow automated access.
- **PROHIBITED**: the terms explicitly bar automated access or copying.
- **UNKNOWN**: the terms were not readable, which counts as no automation.

---

## 1. MAZDA

### 1a. owners-manual.mazda.com (Mazda Motor Corporation global e-manual host)

- **Role:** HTML e-manuals and full PDF owner's manuals for the "gen" (general/export) markets, including EU ("Market: EC").
- **Ownership evidence:** it is a subdomain of mazda.com. The page `js/string.js` sets `inquiryUrl: 'https://www.mazda.com/en/about/d-list/'`, and the manual front matter names "Authorised Mazda Repairers". No separate imprint was found. Ownership is inferred from the domain.
- **robots.txt:** `https://owners-manual.mazda.com/robots.txt` returned **404**, so there is no robots file. The host root `/` returns **403**, so there is no directory listing or index.
- **Terms:** the host has no terms of its own. The Mazda Motor Corporation site terms (https://www.mazda.com/en/siteinfo/, **200**) are the closest:
  - "Use/reproduction of any of this Web site's contents without permission is strictly prohibited."
  - The page also says it is "generally prohibited to use or reprint … content" for reproduction, public transmission, translation, and similar uses.
  - There is no explicit robots or scraping clause.
- **Automation verdict:** **PROHIBITED** for copying and storing (reproduction needs permission). Automated fetching is not explicitly addressed, so under the policy it is not automated.
- **Library structure:**
  - Entry pattern: `https://owners-manual.mazda.com/gen/{lang}/{model}/{model}_{editionCode}/` with `index.html`, `howto.html`, `visual.html` and `contents/{id}.html`.
  - Example edition codes: `cx-5_8gj1ee18b`, `mazda3_8hc8ee19b`, `mazda2_8gl7ee18c`.
  - Each edition's `js/string.js` holds a JS `variables` object with `pdfUrl`, for example `https://owners-manual.mazda.com/gen/en/cx-5/cx-5_8gj1ee18b.pdf`.
  - The page `<meta>` tags carry `ModelName`, `Modelyear` and `Market` (for example `EC`).
  - There is no public index, sitemap or JSON API. Editions are discoverable only through web search or links from regional sites.
  - Locale: the English "gen" edition was confirmed. Other `{lang}` values and non-EU markets are **UNVERIFIED**, although `string.js` carries fr/es/de/ar UI strings.
- **Example check:** CX-5 (MY2017, Market EC, edition 8GJ1EE18B).
  - `howto.html`: **200** text/html.
  - PDF `cx-5_8gj1ee18b.pdf`: **200** application/pdf, about 20.7 MB, with a text layer (pdftotext works).
  - **Contains a maintenance schedule: YES.** It is chapter 6, "Maintenance and Care", section "**Scheduled Maintenance**" (6-3). The PDF was deleted after checking.

### 1b. www.mazda.co.uk (Mazda Motors UK Ltd)

- **Role:** the owners section at `/owners/manuals-and-help/manuals-know-your-mazda/` (**200**). It links to a few leaflet and start-guide PDFs on `media-assets.mazda.eu/raw/upload//mazdauk/globalassets/...pdf`. It does not host a per-model owner's-manual library; manuals are pointed to the MyMazda app. There is a VIN-validation form widget.
- **robots.txt (200):** `User-agent: *` / `Disallow:` (empty, so everything is allowed), plus a sitemap. Oddly, it also lists many mgmotor sitemaps.
- **Terms:** https://www.mazda.co.uk/terms-and-conditions/ (**200**) says: "Duplication, distribution, reproduction and transmission, storage or other use is expressly prohibited without our prior written consent."
- **Verdict:** **PROHIBITED**, because storage and reproduction are barred.
- mazda.eu robots.txt (200) is also empty-allow. Its terms were not checked.

### 1c. www.mazdausa.com (Mazda Motor of America)

- **Role:** US e-manuals and PDFs.
  - HTML: `https://www.mazdausa.com/static/manuals/{year}/{model}/` returned **200**, a meta-refresh to `howto.html`, with meta `Market=USA` and `Modelyear`.
  - PDF: `https://www.mazdausa.com/siteassets/pdf/owners-optimized/{year}/{code}/{year}-{model}-owners-manual.pdf`.
  - The year/model selector is on the MyMazda portal (portal.mazdausa.com, not fetched).
- **robots.txt (200):** `User-agent: *` disallows only `/EPiServer/CMS/`, `/Util/` and `/component-library/`. About 60 named bots get `Disallow: /`, including CCBot and Scrapy. There is a `Crawl-Delay: 5`.
- **Terms:** https://www.mazdausa.com/site/terms-of-use (**200**) says: "You agree not to use any automated means to collect information or content from or otherwise access the Online Services, including … robots, spiders, or scrapers, without our prior permission."
- **Verdict:** **PROHIBITED**.
- **Example check:** 2023 Mazda3 Hatchback PDF returned **200** application/pdf, about 16 MB, with a text layer.
  - **Contains a schedule: YES.** Sections are titled "Scheduled Maintenance (U.S.A. and Puerto Rico)", "(Canada)" and "(Mexico)".
  - It also refers to a separate **Warranty Booklet** for the maintenance record. The PDF was deleted.

---

## 2. TOYOTA

### 2a. www.toyota-europe.com plus the national TME sites (Toyota Motor Europe)

- **Role:** the owner's-manual portal at `/customer/manuals` (**200**). The same component runs on the national sites, for example toyota.co.uk/customer/manuals and toyota.ie, .de, .it, .pl, .cz and others. The page lists about 40 hreflang national URLs.
- **Ownership evidence:** the footer reads "Toyota Motor Europe". The page links to /legalandcompliance.
- **robots.txt (200), toyota-europe.com and toyota.co.uk identical:** `User-agent: *` with disallows for `/content/forms/af/`, `*/_jcr_content/*`, `/sys*`, `*?dealer=*` and similar. `/customer/manuals` is not disallowed.
- **Terms:**
  - TME ToU at https://www.toyota-europe.com/ToU.html returned **200**, but the body is JS-rendered and the clause text was not in the static HTML. **UNVERIFIED.** A search snippet suggests reproduction is allowed only under narrow non-profit conditions.
  - Toyota GB legal page https://www.toyota.co.uk/footer/legal (**200**): "You may only view, electronically copy and print the text, images and other content displayed on this website for your own information." It adds that reuse for any other purpose without consent "is prohibited". There is no explicit bot clause.
- **Verdict:** **PROHIBITED** (UK) or **UNKNOWN** (TME). Either way, no automation.
- **Library structure:** a **JS-only app**.
  - The page has `<div id="ownersManualContainer">`, which loads `https://cp-common.toyota-europe.com/cp-owners-manual/core.js` and then `/cp-owners-manual/2.0.0/scripts/index.js`.
  - The data comes from customer-portal aggregator/gateway hosts: `customerportal-aws.toyota-europe.com` (Kong gateway, `/robots.txt` returns a 404 JSON "no Route matched"), `cpb2cs.toyota-europe.com` and `/api/or/content`.
  - An optional "PubHub" iframe is hosted by the third party Tweddle (`customerportal.tweddle-aws.eu`) and takes a `&vin=` parameter. It is currently disabled (`enablePubhubForOwnerManuals: ""`).
  - `pubhub.toyota-europe.com` does not resolve (DNS). `my.toyota.eu` failed its TLS name check.
  - There is no public or documented API. The endpoints are internal portal APIs and must not be used.
- **Document host:** `myportalcontent.toyota-europe.com` (Amazon S3/CloudFront).
  - Pattern: `/Manuals/Toyota/{Model}_{Region}_(OM{code}).pdf`.
  - `/robots.txt` returns **403** (S3 AccessDenied), and there is no listing.
- **Example check:** `Aygo_WE_(OM99E37E).pdf` returned **200** application/pdf, 14.4 MB, text layer yes.
  - **Maintenance schedule in the manual: NO.** Section 6 "MAINTENANCE REQUIREMENTS" says: "Maintenance schedule — Please refer to the separate 'Toyota Service Booklet' or 'Toyota Warranty Booklet'."
  - EU schedules are therefore in a separate booklet, which was not found publicly. The PDF was deleted.

### 2b. www.toyota.com (Toyota Motor North America, US)

- **Role:** `/owners/warranty-owners-manuals/` (**200**). It refers to the "Owner's Warranty & Maintenance Guide" as a separate document, and the selector is JS-driven.
- **robots.txt (200, dated 2026-09-01):**
  - Training crawlers (GPTBot, ClaudeBot, anthropic-ai, CCBot and others) get `Disallow: /`.
  - Every group, including `User-agent: *`, has **`Disallow: /t3portal/` and `/t3Portal/`**. This is the historical manual and document path; the pattern `/t3Portal/document/om-s/...` is **UNVERIFIED** in this run.
  - `/owners/my-vehicle/service-history*`, `/owners/vehicle-specification*` and `/owners/parts-service/toyota-service-care` are also disallowed.
- **Terms:** https://www.toyota.com/support/legal-terms/ (**200**):
  - "These Sites are for your personal, non-commercial use."
  - "You may not copy, download, distribute … use, reuse or create derivative works of any of the Content … for any purpose whatsoever without our written consent."
- **Verdict:** **PROHIBITED**.

---

## 3. SUZUKI (cars)

### 3a. www.globalsuzuki.com (Suzuki Motor Corporation)

- **Role:** corporate site. No automobile owner's-manual library was found on `/` or `/automobile/` (both **200**).
- **robots.txt (200):** `User-agent: *` / `Allow: /`.
- **Terms:** https://www.globalsuzuki.com/foruse/ (**200**): "Making copies of, reproducing, changing or modifying any part or all of the Contents beyond the personal use … without express permission are prohibited."
- **Verdict:** **PROHIBITED** for copying and storing. There is nothing to index anyway.

### 3b. cars.suzuki.co.uk (Suzuki GB PLC)

- **Role:** `/owners/using-your-car/owners-handbooks/` (**200**). It is a **VIN-entry form**. The page says "Owners manuals are only available online for Suzuki vehicles up to approximately 2017." That makes it form-gated, so it is out of bounds.
- **robots.txt (200):** `User-agent: *` / `Disallow:` (empty) plus disallows for `/*.json$` and `/*.js$`. It also declares `LLMS: https://cars.suzuki.co.uk/llms.txt`, which lists no manual resources.
- **Terms:** https://cars.suzuki.co.uk/terms-of-use/ (**200**):
  - Clause 24(f): "you must not access our website via a means we have not authorised in writing in advance, including automated devices, scripts, bots, spiders, crawlers or scrapers (except for standard search engine technologies)".
  - Clause 15: "No part of the website may be reproduced or stored in any … electronic retrieval system … without our prior written permission."
- **Verdict:** **PROHIBITED**.

### 3c. www.suzuki.at (Suzuki Austria) and www.suzuki.ch (SUZUKI Schweiz AG, Emil Frey Strasse, Safenwil)

These are regional distributors. Suzuki Austria's corporate relationship to SMC is **UNVERIFIED**. Suzuki Schweiz appears to be an importer within the Emil Frey group (**UNVERIFIED**).

- **Role:** the only open-ish per-model manual libraries found.
  - suzuki.at `/zubehoer-service/dokumente/auto/bedienungsanleitungen` (**200**) is static HTML listing per-model PDFs, for example "ACROSS ab 2026 (pdf…)". Pattern: `/service/dokumente/bedienungsanleitungen/auto/BA_{MODEL}.pdf`.
  - suzuki.ch `/de/bedienungsanleitung` (**200**) serves PDFs via `auto.suzuki.ch/fileadmin/media/pdf/pages/bedienungsanleitung/*.pdf`, which 301-redirects to `cdn.builder.io`. Locale: German. Other languages are **UNVERIFIED**.
- **robots.txt:**
  - suzuki.at (200): `Disallow:` (empty), `Crawl-delay: 10`.
  - suzuki.ch (200): Cloudflare "content signals" preamble. It says access is conditional on the signals and cites EU DSM Directive Art. 4 reservations. The fetched body contained only the preamble, with no explicit signals or rules. **UNVERIFIED.**
- **Terms:** both sites show **manual-specific click-through terms** in the SMC template. Access is framed as accepting them "Wenn Sie auf die Schaltfläche unten klicken". They prohibit "das Kopieren, Bearbeiten oder Veröffentlichen oder Verkaufen von Bedienungsanleitungen ohne unsere vorherige schriftliche Zustimmung" and use "zum Zwecke … der Erbringung von Dienstleistungen in Bezug auf eine Bedienungsanleitung für Dritte". Rights are attributed to SUZUKI MOTOR CORPORATION.
- **Verdict:** **PROHIBITED**. It is a click-through gate, and copying or third-party service use is barred.
- **Example check:** `https://www.suzuki.at/service/dokumente/bedienungsanleitungen/auto/BA_e_VITARA.pdf` returned **200** application/pdf, 197 MB, checked by HEAD only. The content was not downloaded because of the click-through terms. Whether it has a schedule section is **UNVERIFIED**.

---

## Summary table

| Host                              | Role                                   | robots                        | Terms re automation/copying                     | Verdict                    |
| --------------------------------- | -------------------------------------- | ----------------------------- | ----------------------------------------------- | -------------------------- |
| owners-manual.mazda.com           | Mazda global e-manual + PDF (EU "gen") | 404 (none)                    | MMC: reproduction w/o permission prohibited     | Prohibited / no automation |
| mazda.co.uk                       | UK owners pages, few PDFs              | allow all                     | storage/reproduction prohibited                 | Prohibited                 |
| mazdausa.com                      | US e-manual + PDF                      | allow manuals; crawl-delay 5  | explicit anti-robots/scrapers                   | Prohibited                 |
| toyota-europe.com (+national)     | JS manual app                          | manuals path allowed          | ToU JS-rendered (UNVERIFIED); UK: own info only | No automation              |
| myportalcontent.toyota-europe.com | S3 PDF host                            | 403                           | covered by TME terms                            | No automation              |
| toyota.com                        | US owners                              | /t3Portal/ disallowed for all | no copy/download for any purpose                | Prohibited                 |
| globalsuzuki.com                  | corporate, no car manuals              | allow                         | copying beyond personal use prohibited          | Prohibited                 |
| cars.suzuki.co.uk                 | VIN form (≤2017)                       | allow (not .js/.json)         | explicit anti-bots + no storage                 | Prohibited                 |
| suzuki.at / suzuki.ch             | static manual PDF lists                | allow / content-signals       | click-through, no copying/third-party service   | Prohibited                 |

## Implication for the registry

None of these hosts can be an automated fetch source.

- **Mazda:** the owner's manual contains the schedule, in both the EU "gen" and US editions. The US manual also refers to a separate Warranty Booklet. The only permissible registry use is as a **user-directed reference**, meaning a deep link the user opens themselves, with the user supplying the document.
- **Toyota EU:** schedules live in a separate Service/Warranty Booklet that is not publicly hosted.
- **Toyota US:** schedules live in a separate Warranty & Maintenance Guide.
- **Suzuki:** open libraries exist only at distributor level and sit behind click-through terms.

URLs fetched, with HTTP status, are cited inline above. Search-only (not fetched) items are marked UNVERIFIED.

---

## C: Kia / Hyundai / Škoda: manufacturer owner-manual sources (research 2026-09-29)

Scope: the manufacturer and regional portals only. The Israeli importer sites were covered elsewhere and prohibit automation.
Method: curl with a browser user agent (read-only GETs with no login, forms or captcha) plus WebSearch. I checked 3 PDFs for structure only and deleted them afterwards. No intervals or schedules were transcribed.
Policy note: when terms are uncertain, treat the source as not automatable.

## Cross-cutting finding

Kia and Hyundai run the **same owner-manual platform** (Hyundai AutoEver). It has a Vue SPA with a public, unauthenticated JSON API under `/api/v2|v3/{siteId}/...`, where siteId is `kia` or `hmc`. It covers **Israel (countryCode `D06`, `he_IL`)**. Technically this is the best structured source, but **neither host publishes terms of its own**. The parent-company site terms (Kia Corporation, HMC) prohibit copying and reproduction without written consent, so **automation verdict: prohibited/unknown, needs written permission**.

---

## KIA

### Host 1: ownersmanual.kia.com (global Kia Owner's Manual portal)

- **Role:** global digital owner's manual. Per model, year, country and language it serves an Owner's Manual (HTML "webhelp", sometimes PDF), a Quick Reference Guide, AVN manuals and warranty. It also backs the official "Kia Owner's Manual" app.
- **Ownership evidence:** Kia branding and favicon; Kia's official app listing points here; the page title is "Kia Owner's Manual"; the SPA footer says "© 2023 Kia. All rights reserved."; the JS has a `https://www.kia.com` link. Separate WHOIS was not checked (UNVERIFIED).
- **robots.txt** (200): `User-agent: * / Allow: /` and `Sitemap: https://ownersmanual.kia.com/sitemap.xml`. The sitemap index returned 200 with 1,578 sub-sitemaps, but a sampled sub-sitemap returned the SPA HTML shell instead of XML, so the sitemap is effectively broken.
- **Terms:** none found on the host. Applicable fallback: Kia Corporation T&C at https://worldwide.kia.com/en/terms-and-conditions (200; redirected from /int/disclaimer): "Users may not reproduce, distribute, transmit, modify, sell, lease, exhibit, or create derivative works from such content in any form without the Company's prior written consent."
- **Automation verdict:** **PROHIBITED for copying/storing** under the parent terms. Crawling itself is not addressed there (robots allows it). Treat it as needing written permission.
- **Library structure:** a JS-only SPA backed by a public JSON API with no auth or token. The endpoint shapes below were observed in the bundle and several were called:
  - `GET /api/v2/kia/country-lang-mappings/dealer` → 200 JSON, 210 countries. Israel = `D06`, langs `he_IL`, `ar_AA`, `en_GB`. Germany = `C07`.
  - `GET /api/v2/kia/models?countryCode=D06&langCode=he_IL&year=` → 200 JSON (IL model list: projCode + name).
  - `GET /api/v3/kia/model?modelName=Picanto&countryCode=D06&langCode=he_IL` → 200 JSON (years 2024–2027).
  - `GET /api/v2/kia/model/owners-manuals?projectCode=JA&year=2025&langCode=he_IL&countryCode=D06` → 200 JSON with `omManual.webhelpManual`, `webhelpToc`, `webhelpDocId` and pub dates (`pdfManual` appears when a PDF exists).
  - Other endpoints seen but not called: `/api/v3/kia/model/warranty?...`, `/model/service-tips`, `/model/warning-lights`, `/search/latest-manuals`, `/search/vin?vin=`.
  - Document URL patterns: `https://ownersmanual.kia.com/full_webhelp/{projCode}/{year}/{lang_CC}/index.html`, `.../toc.html` and `.../topics/chapterN_M.html`. QRG: `/qrg_webhelp/{proj}/{year}/{lang}/index.html`.
  - Format: HTML webhelp with real text and a TOC with stable per-topic URLs.
  - Locales: worldwide, **including Israel in Hebrew**.
- **Example:** Picanto (JA) 2025, he_IL. `toc.html` 200 text/html (561 TOC links). The TOC has chapter 8 "תחזוקה" with topics "שירות תחזוקה מתוזמן" (chapter8_4.html, 200 text/html) and "הסבר על פריטי תוכנית התחזוקה". **Maintenance schedule section: YES.** It was not extracted.

### Host 2: www.kia.com/uk (Kia UK, part of the kia.com AEM estate)

- **Role:** UK owners section "Reference guides & manuals" at https://www.kia.com/uk/owners/manual/ (200).
- **robots.txt** (www.kia.com, 200): `User-agent: *` with `Allow: /content/dam/` and Disallows for `/kr/my/`, `/content/kwcms/kme/`, `/content/kwcms/kme/eu/en/`, `/eut/`, `*/search/`, among others. `ia_archiver` is fully disallowed. **Note:** the prefix `Disallow: /content/kwcms/kme/` does not match `/content/dam/kwcms/kme/...`, so the UK PDFs sit under the allowed `/content/dam/` path. `/api/` is not disallowed.
- **Terms:** https://www.kia.com/uk/terms-of-use/ (200). Clause 4.3: without express written consent you must not "copy (including storing and downloading), distribute, publish, transmit … or otherwise exploit … the material on the website". Clause 4.3.6: "frame, harvest or link to the website or its content". Clause 4.2 allows personal, non-commercial download only.
- **Automation verdict:** **PROHIBITED.**
- **Library:** a jQuery widget fed by a public JSON API: `GET /api/kia_uk/car.categories` and `GET /api/kia_uk/car.list?manualPage=true` (200 JSON, 42 cars, 32 with a `docList` of `{carCode, fileName, fileReference, fileSize, year}`). The PDF pattern is `/content/dam/kwcms/kme/uk/en/assets/static/owners/reference-guide-and-manual/reference-guide-and-manual/{Model Year}.pdf`, and downloads go through `/api/kia_uk/common/file?p={fileReference}`. **These are Quick Reference Guides, not full owner's manuals.**
- **Example:** "Sportage 2022-.pdf": 200 application/pdf, 487 KB, has a text layer, titled "Sportage Quick Reference Guide". **Maintenance schedule: NO.**
- Other EU markets (for example https://www.kia.com/ie/service/warranty-guides/kia-owners-manual-and-guides/, 200) use a JS "select model/year" filter. The endpoint was not identified (UNVERIFIED), and per-market terms were not checked (UNVERIFIED).

### Host 3: owners.kia.com (Kia America owner portal, US)

- Manuals page: https://owners.kia.com/us/en/manuals.html (200; redirected from /content/owners/en/manuals.html). It is an Angular app that calls `/apps/services/owners/apiGateway` with a CSRF token.
- **robots.txt** (200): `Disallow: /content/`, `/apps/`, `/api/`, `/etc/` and others. **The data gateway is disallowed.**
- **Terms:** https://owners.kia.com/us/en/terms-of-service.html (200): "you will not monitor, gather, copy, or distribute such Content … by using any robot, rover, 'bot', spider, scraper, crawler …"
- **Automation verdict:** **PROHIBITED.** US market only, so it is not relevant to Israel. No example was fetched.

---

## HYUNDAI

### Host 1: ownersmanual.hyundai.com (global Hyundai Owner's Manual portal, same platform as Kia)

- **Ownership evidence:** title "Hyundai Owner's Manual"; same codebase as ownersmanual.kia.com; files served under `/api/v2/hmc/files/...` (hmc = Hyundai Motor Company); the domain is under hyundai.com.
- **robots.txt:** **404** (none). `/sitemap.xml` also returns 404. The first attempt at the JS bundle timed out (curl exit 6) and succeeded on retry. It sits behind Cloudflare, but I saw no challenge.
- **Terms:** none on the host. Fallback: HMC legal at https://www.hyundai.com/worldwide/en/footer/contact-legal/legal (200): "You may not copy, reproduce, modify, distribute, republish, display, post or transmit any part of this Site without the written permission of HMC. You may view or print individual pages only for your personal use."
- **Automation verdict:** **PROHIBITED/UNKNOWN.** There is no host-specific terms page, and the parent terms prohibit copying without written permission.
- **Library:** the same API as Kia with siteId `hmc`: `/api/v2/hmc/country-lang-mappings/dealer` (200, 220 countries; ISRAEL = `D06`, `he_IL` only), `/api/v2/hmc/models?countryCode=&langCode=&year=`, `/api/v3/hmc/model?modelName=&countryCode=&langCode=`, `/api/v2/hmc/model/owners-manuals?projectCode=&year=&langCode=&countryCode=`, and `/api/v3/hmc/model/warranty?...`. The PDF pattern is `https://ownersmanual.hyundai.com/full_pdf/{projCode}/{year}/{lang_CC}`, and some models are webhelp only (as on Kia).
  - Israel coverage looks **sparse**. `models?countryCode=D06&langCode=he_IL&year=` returned `{}`, while a variant with a year param returned only IONIQ 3. Germany (C07, de_DE) returned 27 models. No UK entry was found in the country list, because the UK uses hyundai.com/uk.
- **Example:** TUCSON (NX4e) 2025, de_DE. The API returned `omManual.pdfManual`, and the PDF fetch was 200 application/pdf, 50.9 MB, PDF 1.6, **with a text layer**. **Maintenance schedule: YES.** Chapter 9 references "Standard-Wartungsplan (für Europa)". It was not extracted, and the file was deleted.

### Host 2: www.hyundai.com/uk (Hyundai Motor UK)

- Entry point: https://www.hyundai.com/uk/en/owners/owning-a-hyundai/owners-manuals.html (200). **Static HTML** with 55 unique links to `https://dmassets.hyundai.com/is/content/hyundaiautoever/{Name}pdf` (Adobe Scene7 DAM URLs with no `.pdf` extension, for example `Kona+OSpdf` and `IONIQ+9+Owners+Manualpdf`; 7 are AVN/nav manuals). A HEAD request to one returned 200 application/pdf (8.4 MB). The dmassets robots.txt returns 404.
- **robots.txt** (www.hyundai.com, 200): `User-agent: *` with `Allow: /` and a few disallows (`/kr/ko/...`, `/sg/owners/`, `/files/kr/` and others). `/uk/` is not disallowed, and ClaudeBot/GPTBot are explicitly allowed. `ScrapeHero` is fully disallowed.
- **Terms:** https://www.hyundai.com/uk/en/legal-disclaimer.html (200): "You may not copy, reproduce, modify, distribute, republish, display, post or transmit any part of this site without the written permission of Hyundai. You may view or print individual pages only for your own personal use."
- **Automation verdict:** **PROHIBITED** for copying and storing. robots is permissive, but the terms are not.
- Locale: UK, English.

### Host 3: manuals.hyundai.co.uk (legacy UK split-chapter manuals)

- The site root returned 200 and `/user-manuals-ioniq-5` returned 200 with static links `/umanuals/{model}/{model}-{year}-{chapter}.pdf`, including a `...-maintenance.pdf` chapter (HEAD 200 application/pdf, 2.27 MB) and a full `{model}-{year}.pdf`.
- robots.txt returned 404. Its legal link (www.hyundai.co.uk/legal/legal) **does not resolve (DNS failure)**, so the terms cannot be read and the verdict is **UNKNOWN → no automation**. The site looks legacy, since the parent domain is retired.

### Host 4: owners.hyundaiusa.com (Hyundai Motor America, US)

- https://owners.hyundaiusa.com/us/en/resources/manuals-warranties (200). A jQuery page loads `/content/myhyundai/us/en/service/manualsandwarrantiesdata.json` and `/content/myhyundai/us/en/manualsCategory/{category}/manuals.json`. **robots disallows `/content/` and `/api/`**, so I did not fetch these. Some links go to `digitalownersmanual.hyundai.com/{MODEL}/{year}/us/en/...`, which did not resolve from here.
- The terms linked from the page (https://www.hyundaiusa.com/us/en/terms-conditions, 200) say you may not "Use any robot, 'bot,' spider, crawler, engine, device, software, tool, routine, or any other automatic device … on the Site for any purpose whatsoever without our written permission". They also prohibit "web-scraping".
- **Automation verdict:** **PROHIBITED.** US market only.

---

## ŠKODA

### Host 1: www.skoda-auto.com/apps/manuals (Škoda Auto a.s. global owner's manuals app)

- Entry point: https://www.skoda-auto.com/apps/manuals/ (200). `manual.skoda-auto.com` redirects to `/apps/manuals/Models`.
- **Ownership:** the skoda-auto.com corporate domain; the copyright page says "© ŠKODA AUTO a.s."
- **robots.txt** (200): `User-agent: * / Disallow:` (empty, so everything is allowed) and `Sitemap: https://www.skoda-auto.com/sitemap.xml`.
- **Terms:** https://www.skoda-auto.com/other/copyright (200): "Duplication and distribution of any other parts of the company's web pages are prohibited and constitutes unlawful conduct, unless a prior consent from ŠKODA AUTO has been obtained." It says nothing about crawlers or robots.
- **Automation verdict:** **PROHIBITED** for duplication/storage without consent. Crawling is not addressed.
- **Library:** a React app with a public JSON API under base `/apps/manuals/{bid}/{culture}/`, for example `/apps/manuals/004/en-COM/`. The model, edition, market and language steps need no token; only the VIN lookup uses a `ReCaptcha-Token` header, and I did not use it.
  - `GET api/Models` → 200 JSON (42 model types, for example `Octavia_NX`, `Kodiaq_PS`, `Fabia_PJ`).
  - `GET api/Editions?model=Octavia_NX` → 200 (codes like `11-2024`, meaning month-year editions).
  - `GET api/Markets?model=&edition=` → 200 (for Octavia_NX 11-2024, only `A` = Market_Other).
  - `GET api/Languages?model=&edition=&market=` → 200 (39 languages, **including `he` with omsCode `il`**).
  - `GET api/Manuals?model=&edition=&market=&language=` → 200. Each result is either `manualType: "Pdf"` with `pdfManual.pdfFileUrl`, or `"Digital"` with `{partNumber, uiLanguage}`.
  - PDF pattern: `https://ownersmanuals.blob.core.windows.net/ownersmanuals/{omsLang}/{modelType}/{edition}/OwnersManual.pdf` (Azure Blob, a Škoda-controlled container; blob robots.txt returns 400).
  - Digital manuals: the app submits a form (partNumber, uiLanguage, importerId) to `https://digital-manual.skoda-auto.com/api/entrypoint/V1/direct/`. That host's robots.txt returns **401** with a JSON auth error. I treated it as off-limits (form submission) and did not use it.
  - Locales: global. English is often "Digital" only, while Hebrew is a PDF.
- **Example:** Octavia_NX, edition 11-2024, market A, language he. `pdfFileUrl` returned 200 `application/octet-stream`, 31.6 MB, %PDF-1.4, **Hebrew text layer present**; the cover reads "ספר התפעול והאחזקה … he_IL". **Maintenance section: YES**, a "מרווחי שירות" (service intervals) section. It appears to be general text that points to an authorised service partner, and a full schedule table was not observed (a separate service-schedule document may exist, UNVERIFIED). Not extracted; the file was deleted.

### Other Škoda hosts

- www.skoda-storyboard.com: a media site, robots allows all, not a manual library.
- The PDF front matter points to `go.skoda.eu/owners-manuals` and `/video-manuals-*` short links, which I did not follow.

---

## URLs fetched (HTTP status)

- robots: www.kia.com 200, owners.kia.com 200, ownersmanual.kia.com 200, www.hyundai.com 200, ownersmanual.hyundai.com 404, manuals.hyundai.co.uk 404, owners.hyundaiusa.com 200, www.hyundaiusa.com 200, www.skoda-auto.com 200, digital-manual.skoda-auto.com 401, www.skoda-storyboard.com 200, dmassets.hyundai.com 404, ownersmanuals.blob.core.windows.net 400.
- DNS failures: www.kia-uk.com, www.hyundai.co.uk, digitalownersmanual.hyundai.com. webmanual.hyundai.com redirects to ownersmanual.hyundai.com/error/not-active.
- Terms pages: all as cited above, each 200. Two did not work: kia.com/uk/legal (404 page) and owners.hyundaiusa.com/us/en/legal (404).
- APIs and documents: as listed per host above.

---

## D: Official manual sources for Yamaha, Honda, SYM, SEAT and Ford Europe

Research date: 2026-09-29. Method: read-only curl (browser UA) plus WebFetch/WebSearch. No logins, forms, captchas or accounts were used.
This file maps domains, access rules and library structure only. It deliberately contains no maintenance intervals.
All downloaded example PDFs were deleted after the check.

Policy reminder: when the terms are uncertain, do not automate. "robots allows" does NOT override terms that restrict copying.

---

## 1. Yamaha (motorcycles/scooters)

### 1a. www.yamaha-motor.eu (Yamaha Motor Europe N.V.): regional entry point

- **Role:** EU/UK regional site. It has an owner-manual finder at `/{cc}/{lang}/service-support/owner-manuals/` and `/.../owner-manuals/library/` (filters: Category, Segment, Model, Build year, Language), plus `/.../owner-manuals/vin/`.
- **Ownership:** The legal statement names Yamaha Motor Europe N.V. It was fetched as AEM JSON at `https://www.yamaha-motor.eu/gb/en/legal-statement.model.json` (200).
- **Fetched:**
  - `/gb/en/service-support/owner-manuals/` 200 text/html (12 KB React shell)
  - `/gb/en/service-support/owner-manuals.model.json` 200 application/json
  - `/gb/en/service-support/owner-manuals/library.model.json` 200 (component `yme/components/owner-manuals`, labels only, no document data)
  - `/gb/en/owners/manuals/` 404
- **robots.txt** (200): `User-agent: *`, then `Disallow: /apps`, `/bin`, `/conf`, `/home`, `/libs`, `/system`, `/temp`, `/var`, `/eu/en`, plus many per-locale `Sitemap:` lines. It does not disallow `/{cc}/{lang}/service-support/`.
- **Terms** (legal statement, gb/en):
  - "You may not copy, modify, upload, download, transmit, re-publish, display for redistribution to third parties for commercial purposes, or otherwise distribute any Code or Content from the Sites witho[ut]…"
  - "The Sites are available only for your personal use, which shall be limited to viewing the Sites, providing information to the Sites, downloading product information for your personal review…"
  - The page contains no explicit robots/crawler/scraping clause.
- **Library structure:** JS-only (React micro-frontend loaded from `d3p4it9p4cf1ca.cloudfront.net/moduleEntry.js`). The data endpoint for the manual finder was not found in the static bundles (UNVERIFIED). The code shows the ymcapps library below is embedded as an iframe for EU "base codes".
- **Verdict:** Automation is **prohibited/uncertain**. The terms limit use to personal viewing and personal review downloads. Treat as a user-guided deep-link target only.

### 1b. library.ymcapps.net: Yamaha Motor Owner's Manual Library (global)

- **Role:** Global owner's-manual library. Title: "YAMAHA MOTOR Owner's Manual Library".
  - Entry point: `https://library.ymcapps.net/library/om/app/` (200).
  - The root `/` returns 403 (Incapsula). `/robots.txt` returns 404 (Incapsula-fronted; DNS is a CNAME to `*.x.incapdns.net`).
- **Ownership evidence (now reasonably established):**
  1. The app's `index.js` calls POST JSON APIs on **`https://parts.yamaha-motor.co.jp/ypec_b2c/services/omb2c/`**, which is Yamaha Motor Co., Ltd.'s own .co.jp domain. Endpoints: `product_list/`, `model_name_list/`, `model_year_list/`, `model_list/`, `model_list_pub/`, `access_log/`.
  2. The app's `assets/database.xlsx` UI text includes the copyright line "© Yamaha Motor Co., Ltd." and a terms text naming "YAMAHA".
  3. The code has an `isEuroSite(baseCode)` list and switches to iframe mode, so it is embedded in yamaha-motor.eu.
  4. RDAP for ymcapps.net: registrar Japan Registry Services, registered 2015-05-08. Registrant is redacted.
  5. A web search shows a support address `ymcapps-support@yamaha-motor.co.jp` (seen only in a search snippet, UNVERIFIED).
- **robots.txt:** none (404). There is active bot protection (Incapsula).
- **Terms** (in-app modal "Terms of Use", which requires ticking "I agree to the terms of service."; text read from `assets/database.xlsx`):
  - "YAMAHA owns copyrights and other intellectual property rights for online owner's manuals. You may not copy, modify, or distribute any part of the online owner's manuals provided through this site without our permission."
  - "the URL of each electronic online owner's manual is subject to change without notice."
  - "Use the online owner's manual as reference information only."
- **Library structure:**
  - The API is JSON POST keyed by a region object `{baseCode, langId}` (default `{baseCode:"6210", langId:"02"}`).
  - Search modes: model name, VIN, manual number.
  - PDF URL pattern: `https://library.ymcapps.net/library/om/contents/pdf/{productId}/{MANUALNO}_{langId}.pdf`, e.g. product 10 = motorcycle, 30 = generator. An HTML edition also exists (a "HTML" button; URL pattern UNVERIFIED).
  - Regions/destinations in `database.xlsx` include **"Kesher Yami Ltd. (Israel)"**, so an Israel destination exists (its baseCode was not resolved).
- **Example check:** `https://library.ymcapps.net/library/om/contents/pdf/10/B5W-F8199-13_02.pdf` returned 200 application/pdf (8.0 MB).
  - It is the MT03P owner's manual (US edition, Yamaha Motor Corporation U.S.A.) and has a text layer.
  - Maintenance section: **yes**, "Periodic maintenance and adjustment" (ch. 7) with "General maintenance and lubrication chart".
- **Verdict:** Automation is **prohibited** without permission (the terms forbid copying and require click-through agreement; there is bot protection). A deep link for the user to open is acceptable. Do not store or copy.

### 1c. yamaha-motor.com (Yamaha Motor Corp. USA). Noted only.

- robots.txt (200) begins "# Machine-readable access notice. Enforced together with the site Terms of Use." It disallows `/api` and `/search`. The Terms of Use were not read. **Verdict: unknown, so no automation.**

---

## 2. Honda (motorcycles/scooters)

### 2a. www.hondamotopub.com: "MOTOPUB", Honda Motorcycle Service Publications (global)

- **Ownership:**
  - Footer: "(C) Honda Motor Co., Ltd. and its subsidiaries and affiliates. All Rights Reserved."
  - Linked from `https://www.honda.co.uk/motorcycles/owners/owners-manual.html` (200) and from other Honda EU country sites at the same path (honda.de, honda.it, honda.es, moto.honda.fr, and others).
  - Links to global.honda after-sales.
- **Fetched:**
  - `/` 200
  - `/HMEE` 200
  - `/license/HMEE` 200
  - `/model/HMEE/K1Y250/` 200
  - `/om/HMEE/WW125_A (PCX)/2025` 200 (HTML licence-gate page)
  - `/robots.txt` 302 to `/`, so there is no robots file.
- **Terms** (`https://www.hondamotopub.com/license/HMEE`, "LICENSE AGREEMENT"; the download page repeats it with an "agree" checkbox):
  - "Online service publications or parts of online owner's manuals cannot be copied, reproduced, altered, or distributed without Honda's permission."
  - "you can print out online service publications content for the use of your product. The number of copies … limited to one per product."
  - Download requires agreeing to the Licence Agreement.
- **Library structure:** static HTML plus public jQuery GET JSON (needs the `X-Requested-With: XMLHttpRequest` header).
  - `/ajax/get_model_names/{REGION}/{ccRange}` returns a list of model names.
  - `/ajax/get_model_years/{REGION}/{modelName}` returns years.
  - `/ajax/get_data_model_code/{REGION}/{ccRange}/{modelName}/{year}/{pdfType}` returns `[{model_code, model_name, model_year}]`.
  - Model page: `/model/{REGION}/{model_code}/`, with per-language links `/om/{LANGREGION}/{modelName}/{year}`.
  - Licence page: holds the PDF href on the S3/CloudFront host **`2rom-prd-data.hondamotopub.com`**, e.g. `/om/HMEE/WW125_A%20%28PCX%29/2025/WW125A_OM_32K1YC20_web.pdf`.
  - Regions: `HMEE` (EU English), `HMEF`, `HMES`, `HMEI`, `HMED`, `HMEG`, `HMEPl`, `HMEPt`, `HMECz`, `HMESk`, `HMEGR`, and many non-EU regions, including **Israel = `/MCT`** (200, Hebrew UI).
- **Example check:** a HEAD request to the PCX 2025 EN PDF returned 200 application/pdf, 6.1 MB, AmazonS3 via CloudFront.
  - The file was **not downloaded**, because it sits behind the licence click-through. Maintenance-section presence: UNVERIFIED.
  - `2rom-prd-data.hondamotopub.com/robots.txt` returned 403 (S3 AccessDenied).
- **Verdict:** Automation is **prohibited** (click-through licence, no copying). Use a user-guided deep link only (region + model page URL).

### 2b. www.honda.co.uk (Honda Motor Europe Ltd): entry page only

- robots.txt (200): `User-agent: *`, `Allow: /`, `Disallow: */search.html?*`, `Disallow: /contact-dealer.html?*`.
- Terms (`/motorcycles/useful-links/terms-and-conditions.html`, read via WebFetch):
  - "you may print off one copy, and may download extracts … for your personal use"
  - "you may not use any part of the content … in any other public or commercial manner without … prior written permission"
  - There is no automated-access clause.
- **Verdict:** automation is unknown or restricted. The page only links to MOTOPUB.

### 2c. powersports.honda.com (American Honda, US)

- `/robots.txt` and `/downloads/owners-manuals` both returned **403 Akamai "Access Denied"** (via curl and WebFetch). This is active bot protection. **Verdict: no automation.**

---

## 3. SYM (Sanyang Motor)

### www.sym-global.com

- **Ownership:** The footer reads "Copyright © 2026 Sanyang Motor Co., Ltd. All rights reserved." It also gives the "TAIWAN SANYANG MOTOR Co., Ltd." HQ address in Hukou, Hsinchu.
- **robots.txt** (200, text/plain): only `User-agent: *` with no Disallow lines, so crawling is not restricted.
- **Terms:** No terms-of-use or legal page was found.
  - `/terms-of-use`, `/terms` and `/legal` all returned 500.
  - The footer links only to a Privacy Policy (`/privacy-policy`, 200), which has no clause on copying or automation.
  - Copyright is "All rights reserved". **Verdict: unknown**, so under the policy there is no automated copying or storage. Rate-limited link discovery may be acceptable only if the product owner explicitly decides so, since robots permits it. Flag this for an approval decision.
- **Library structure** (static HTML, no JS needed):
  - Model list: `https://www.sym-global.com/sitemap.xml` (200, 284 `<loc>`s; model pages are single-slug URLs such as `/joyride-s`, `/jetx`, `/adxtg-400`, `/maxsymtl-508`). Also `/product` and category slugs.
  - Model page: `https://www.sym-global.com/{model-slug}` (optionally `?engine=125cc`).
  - The manual link sits in `div.spec-button-wrap`: `<a class="c-link main" href="/storage/architecture/product~{id}/…/product~{id}/{File}.pdf" title="{displacement}" rel="nofollow">`. The title attribute is the engine displacement, e.g. "125cc".
  - Crawler path: sitemap, then each model slug, then select `a.c-link.main[href$=".pdf"]`.
  - Not every model has one; `/symphony` had none.
  - Older `storage/system/products/.../download/*.pdf` URLs (seen in search results) now return 500.
  - Format: PDF with a text layer, global English edition. There are no per-market locales on this site. The Israeli edition is via the importer (out of scope).
- **Example check:** `/joyride-s` returned 200. `/storage/architecture/product~126/product~134/product~166/product~185/JoyrideE5MANUAL.pdf` returned 200 application/pdf (3.4 MB).
  - Maintenance section: **yes**, "16. Periodical Maintenance Schedule".
  - More link confirmations: jetx (`JETX_MANUAL.pdf`), adxtg-400 (`adxtg_Owners-Manual.pdf`), maxsymtl-508 (`MAXSYMTL508Manual.pdf`).
- **Verdict:** robots permits crawling. The terms are absent, so the copying/storing right is unknown. **No automated storage without an approval decision.**

---

## 4. SEAT

### 4a. www.seat.com (SEAT, S.A.U.): global manuals portal

- **Ownership:** The legal note (`https://www.seat.com/company/legal-note`, 200) says "© SEAT, S.A.U. 2018. Total or partial reproduction is forbidden."
- **robots.txt** (200): `User-Agent: *`, `Allow: /`, plus Sitemaps `/sitemap.xml` and `/sitemap-hreflang.xml`.
- **Bot note:** curl without `Accept`/`Accept-Encoding` headers hung (status 000). It returns 200 with normal browser headers. This is mild bot filtering (Akamai-like).
- **Terms:**
  - "the use, reproduction, transmission, dissemination, … distribution, transformation or exploitation of them by the User is prohibited, in any way, except as part of the service that includes the Web Portal and for private purposes only."
  - There is no explicit robots/scraping clause.
- **Library structure:** AEM with **public JSON (GET, no login)**.
  - Model list: `https://www.seat.com/owners/about-my-car/manuals/_jcr_content/par/modellist.data.manualsModelList.json`, giving `models.new[]` and `models.old[]` with `{modelName, modelId, modelUrl}`.
  - Model details: `https://www.seat.com/owners/about-my-car/manuals/manual-details/_jcr_content/par/modeldetails.data.manualsModelDetails.{modelId}.json`, giving:
    - `modelYears[]{modelYear, editions[]{editionName, manualId}}`
    - `manuals[]{manualId, categories[]{categoryId, categoryName, languages[]{languageId, languageName, pdfPath}}}`
  - Categories include "Owner's manual", **"Maintenance"**, "Safety", "Driving", "Technical data" and appendices.
  - PDF pattern: `https://www.seat.com/datamanual-manual/manuals/seat/{locale}/SEAT_{Model}[_{Section}]_{MM}_{YY}_{LANG}.pdf`, where `_Mantenimiento_` is the maintenance booklet.
  - seat.com Leon JSON: all 83 language entries were EN.
- **Verdict:** **prohibited** (reproduction forbidden except private use within the portal). The JSON can drive a _user-initiated_ deep link (model, year, edition, then the Maintenance PDF URL), not bulk copying.

### 4b. www.seat.co.uk (SEAT UK, a division of Volkswagen Group UK Ltd)

- robots.txt (200): `User-Agent: *`, `Allow: /`, plus Sitemaps.
- **Terms** (`https://www.seat.co.uk/legal-notes`, 200):
  - "Permission is hereby granted to electronically copy and to print in hard copy portions of this web site for the sole purpose of using this as an information resource for SEAT UK products."
  - "Any other use … including reproduction for purposes other than the above, modification, distribution or republication without the prior written permission of SEAT UK is prohibited."
  - There is also a "Misuse Statement".
- **Structure:** identical AEM component, under `/owners/your-seat/manuals-offline/…`:
  - `…/_jcr_content/par/modellist.data.manualsModelList.json` (200)
  - `…/manual-details/_jcr_content/par/modeldetails.data.manualsModelDetails.leon.json` (200, 104 KB)
  - PDFs at `https://www.seat.co.uk/datamanual-manual/manuals/seat/en-gb/…`
- **Example check:** `https://www.seat.co.uk/datamanual-manual/manuals/seat/en-gb/SEAT_Leon_Mantenimiento_11_25_EN.pdf` returned 200 application/pdf (138 KB, text layer).
  - It is a dedicated **Maintenance** booklet with a "Service work and the Digital Maintenance Plan" section (flexible/fixed service described).
  - Whether it has a full interval table is UNVERIFIED; it may defer to the service display or Digital Maintenance Plan.
- **Verdict:** narrow personal-information permission only. **No automated bulk copying.** A user-guided deep link is acceptable.
- Israel: seat.com has no Hebrew locale in the Leon JSON. The Israeli edition would come via the importer (out of scope).

---

## 5. Ford (Europe/UK)

### 5a. www.ford.co.uk (Ford Motor Company Limited)

- **Fetched:**
  - curl to `https://www.ford.co.uk/*` **timed out (000)** even with browser headers, i.e. bot filtering.
  - WebFetch of `/robots.txt` succeeded: `User-agent: *`, `Allow: /`, several Disallows (overlays, error pages, forms, dashboards, search), `Sitemap: https://www.ford.co.uk/sitemap.xml`. There are no manual- or PDF-specific rules.
  - Owner-manual help page `/support/how-tos/owner-resources/vehicle-documents/where-can-i-get-an-owners-manual`: WebFetch returned only a heading, so it is JS-rendered.
  - A dev-host search hit suggests the tool path `/owner/my-vehicle/download-your-manual`. WebFetch of that path returned empty content (JS app). Its selection is by VIN or model/year (per search snippet, UNVERIFIED).
- **Terms** (`https://www.ford.co.uk/useful-information/terms-and-privacy/terms-and-conditions`, via WebFetch):
  - "You may not copy, reproduce, republish, download, post, broadcast or transmit any text, images, graphic, logo…"
  - "…or use it for any other purpose other than for your personal non-commercial use."
  - There is no explicit robots clause.
- **Verdict:** **prohibited** (copying and downloading are restricted; there is bot filtering).

### 5b. www.fordservicecontent.com (Ford Motor Company document CDN)

- **Role:** hosts owner-manual PDFs for EU (and other) markets.
  - EU pattern: `https://www.fordservicecontent.com/Ford_Content/Catalog/owner_information/CG{docNo}{lang}-{YYYYMM}-{timestamp}.pdf`, e.g. `CG3851en-…` (Kuga en-GB) and `CG3980en-…` (Puma en-GB), with `esESP` variants.
  - Legacy: `/Ford_Content/catalog/owner_guides/*.pdf` (US and older EU).
- **Ownership:** the PDF imprint reads "© Ford Motor Company 2021 All rights reserved." It is also linked from ford.com support (search results).
- **robots.txt:**
  - curl returned **403 Akamai "Access Denied"**.
  - WebFetch returned 404 on one attempt and a DNS error on another. Result: no readable robots file, and active bot protection.
- **Terms:** no host-specific terms were found. The PDF imprint says: "No part of this publication may be reproduced, transmitted, stored in a retrieval system … without our written permission."
- **Example check:** `…/owner_information/CG3851en-202104-20210407114440.pdf`:
  - curl got 403 (Akamai). WebFetch got application/pdf, 7.4 MB, "FORD KUGA Owner's Manual" with a text layer.
  - The Puma `CG3980en-…` PDF exceeded 10 MB via WebFetch, so it exists.
  - Maintenance section: **UNVERIFIED**. Only the first 12 pages were inspected before the temp file was deleted.
- **Discovery:** there is no public index. URLs are opaque (document number plus timestamp) and resolved by the JS tool on ford.co.uk. **Verdict: prohibited** ("stored in a retrieval system" is explicitly forbidden; Akamai blocks non-browser clients).

---

## Registry-oriented summary

| Manufacturer | Host                                                 | Discovery mechanism                                                                 | robots                    | Terms                                | Automation                             |
| ------------ | ---------------------------------------------------- | ----------------------------------------------------------------------------------- | ------------------------- | ------------------------------------ | -------------------------------------- |
| Yamaha       | library.ymcapps.net (+ API parts.yamaha-motor.co.jp) | POST JSON API; PDF `/library/om/contents/pdf/{pid}/{manualNo}_{langId}.pdf`         | none (404), Incapsula     | no copying; click-through            | prohibited                             |
| Yamaha       | yamaha-motor.eu                                      | JS app (iframe of above)                                                            | allows service-support    | personal use only                    | prohibited                             |
| Honda        | hondamotopub.com + 2rom-prd-data.hondamotopub.com    | GET JSON `/ajax/...`, `/model/{R}/{code}/`, `/om/{R}/{model}/{year}`; Israel = MCT  | none                      | licence click-through; no copying    | prohibited                             |
| SYM          | sym-global.com                                       | sitemap.xml → `/{slug}` → `a.c-link.main[href$=.pdf]`                               | allow all                 | none found                           | unknown (needs approval)               |
| SEAT         | seat.com / seat.co.uk                                | public AEM JSON modellist → modeldetails.{id}.json → pdfPath (Maintenance category) | allow all                 | private use only / narrow permission | prohibited for bulk; user deep-link OK |
| Ford EU      | ford.co.uk + fordservicecontent.com                  | JS tool, opaque PDF URLs                                                            | ford.co.uk allow; fsc 403 | no copy/store                        | prohibited                             |
