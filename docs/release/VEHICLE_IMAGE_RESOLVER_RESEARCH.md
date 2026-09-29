# Vehicle image resolver: research and proposed architecture (2026-09-29)

**Status:** research only, for owner approval. Nothing is integrated, no image is bundled, nothing
was purchased. The images below were only inspected, not copied into the app.

## 1. Acceptance case: SEAT Ibiza, 2012, engine CGG, registry color "שחור מטלי"

### 1.1 Resolved identity (from official data)

| Attribute    | Value                                             | Evidence                                                                                                                                                         |
| ------------ | ------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Make / model | SEAT Ibiza                                        | data.gov.il `tozeret_nm` / `kinuy_mishari`                                                                                                                       |
| Generation   | **Ibiza IV, Typ 6J** (2008–2017)                  | model code `6J52E4` (`degem_nm`)                                                                                                                                 |
| Body         | **5-door hatchback**                              | WLTP catalog for `tozeret_cd 778` / `degem_cd 26, 45, 58`: `mispar_dlatot 5`, `merkav הצ'בק`. Registry prefix `6J5` = 5-door; `6J1` (`6J13E4`) is the 3-door SC. |
| Engine       | 1.4 16V MPI, 1,390 cc, 85 hp                      | `degem_manoa CGG`; WLTP `nefah_manoa 1390`, `koah_sus 85`                                                                                                        |
| Color        | black metallic                                    | `tzeva_rechev` (authoritative)                                                                                                                                   |
| Facelift     | **Not determinable from "2012" alone**; see below |                                                                                                                                                                  |

**Facelift finding.** The 6J facelift was unveiled in Geneva in March 2012 and went on sale in
spring 2012. It changed the headlamps, grille, bumpers and rear lights. The registry shows why the
year alone is not enough:

- **The population.** There are 2,193 Ibiza 2012 CGG cars, 496 of them black metallic.
- **Registration dates.** Model-year-2012 cars were first registered from January to December 2012.
- **The model code does not change across the year.** The homologation code `degem_cd` does:
  - **`cd 26`** ("IE REFERENCE", 1,896 cars) was already catalogued for 2011 and was registered
    from January to October 2012. It is most likely **pre-facelift**.
  - **`cd 58`** first appears in November 2012 and is likely the facelift. `cd 45` is rare
    (May–December).
- **The resolver's rule.** It must use the plate's own `degem_cd` and `moed_aliya_lakvish` (first
  registration). Example: plate 7788176 (`cd 26`, first registration 2012-08) is **pre-facelift**,
  inferred with medium confidence.
- **Low confidence.** The resolver shows a generation-level image, or asks the user one visual
  question ("which front does your car have?").

The owner's own plate has not been checked; it will resolve the same way.

### 1.2 Sources searched and candidates

| Source class                                                                                                                    | Result                                                                                                                                       |
| ------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Wikimedia Commons: `Category:Seat Ibiza 6J` and its subcategories (186 files), and `Category:SEAT Ibiza 6J facelift` (24 files) | Per-file machine-readable licenses; several black 5-door candidates                                                                          |
| Openverse API (CC-licensed images aggregated from Flickr, Wikimedia and others)                                                 | 45 results for "seat ibiza black" and 157 for "seat ibiza 2012". Almost all Flickr results are NC/ND.                                        |
| Unsplash and Pexels search                                                                                                      | No SEAT Ibiza 6J in black                                                                                                                    |
| Pixabay                                                                                                                         | License forbids commercial use of content with recognisable logos "in relation to goods and services". Every car photo shows the SEAT badge. |
| SEAT / CUPRA Media Center (manufacturer press)                                                                                  | "Editorial use only; all commercial use … strictly prohibited"                                                                               |
| General web (search engines, dealer or classified listings, blogs)                                                              | Discovery only. No image-specific permission, so every candidate is rejected unless it resolves to an explicit license.                      |

### 1.3 Evaluated candidates

| #   | Image                                                                                                                                      | Generation / body / color                             | License                    | Decision                                                                                                                                                             |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------- | -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A   | [2009 SEAT Ibiza Sport 84 1.4](https://commons.wikimedia.org/wiki/File:2009_SEAT_Ibiza_Sport_84_1.4.jpg), by Makizox (Commons), 4255×2221  | 6J **pre-facelift**, **5-door**, **black**, 1.4 85 hp | **CC BY-SA 4.0**           | **Selected for pre-facelift.** Plate blanked by the uploader; clean three-quarter front view; no people.                                                             |
| B   | [2011 Seat Ibiza Chill](https://commons.wikimedia.org/wiki/File:2011_Seat_Ibiza_Chill.jpg), by Calreyn88                                   | pre-facelift, 5-door, black                           | CC BY-SA 4.0               | Legal, but ranked below A: a third party's plate is readable and two identifiable people are in frame                                                                |
| C   | [2014 SEAT Ibiza Toca 1.4 Front](https://commons.wikimedia.org/wiki/File:2014_SEAT_Ibiza_Toca_1.4_Front.jpg), by Vauxford                  | 6J **facelift**, 5-door, black                        | CC BY-SA 4.0               | **Selected for facelift** (plate blanked)                                                                                                                            |
| D   | [2012-03-07 Motorshow Geneva 4647](https://commons.wikimedia.org/wiki/File:2012-03-07_Motorshow_Geneva_4647.JPG), by Norbert Aepli (Noebu) | facelift, 5-door, **green**                           | CC BY 3.0                  | Not needed (black exists). Used as the **recoloring legality example** (§1.5).                                                                                       |
| E   | Seat Ibiza 6J ST Copa Magicoschwarz (Commons)                                                                                              | ST **estate**                                         | Commons                    | Rejected: wrong body style                                                                                                                                           |
| F   | 003866 – Seat Ibiza (Commons, CC BY 2.0)                                                                                                   | **3-door SC**, black                                  | CC BY 2.0                  | Rejected: wrong body style                                                                                                                                           |
| G   | Seat Ibiza ST 1.2 Reference 20100731 (Commons)                                                                                             | ST estate, black                                      | "Attribution"              | Rejected: wrong body style                                                                                                                                           |
| H   | Flickr results via Openverse (e.g. "Seat Ibiza FR 2.0TDI", ND-Photo.nl, Julien Huet)                                                       | mixed                                                 | **CC BY-NC-SA / BY-NC-ND** | Rejected. NC means non-commercial only, and AutoKeep may be commercial. ND forbids adaptation, and a cutout is an adaptation.                                        |
| I   | Flickr "WU64KHB used SEAT IBIZA … FR" (a dealer's listing photo)                                                                           | facelift FR                                           | "Public Domain Mark 1.0"   | Rejected: PDM is a _label_ for works already free of copyright, not a dedication by the author. A 2014 dealer photo is not public domain, so the rights are unclear. |
| J   | SEAT media center press photos                                                                                                             | any                                                   | Editorial only             | Rejected: commercial use prohibited                                                                                                                                  |
| K   | Pixabay / Unsplash / Pexels                                                                                                                | no matching 6J black                                  | n/a                        | No suitable candidate                                                                                                                                                |

### 1.4 Selected image: license and permissions

**Candidate A** (pre-facelift, the likely match for this registry profile) is licensed
**CC BY-SA 4.0** (https://creativecommons.org/licenses/by-sa/4.0/).

- **Allowed.** Commercial use, copying and redistribution, and **adaptation (modification)**:
  background removal, cropping, recoloring.
- **Conditions.**
  - Attribution (creator, title, link to source, link to license).
  - **Indicate that changes were made.**
  - **ShareAlike:** the modified image itself must be released under CC BY-SA 4.0 or a compatible
    license. This applies to the image file only, not to the app.
  - No additional restrictions or DRM on the image.
- **Moral rights.** CC 4.0 waives or limits moral rights only as far as the licensed uses require.
  Israeli law recognises moral rights, including against distortion, so a respectful adaptation
  such as a cutout or faithful recolor is acceptable; caricature-like edits are not.
- **Not granted.** CC licenses give no trademark rights. The SEAT badge stays as photographed
  (nominative depiction of the model). AutoKeep must not alter it or imply endorsement.

### 1.5 Black image available, and recoloring legality

- **A black / black-metallic image exists** for both facelift states (A, B, C). **No recoloring is
  needed** for this case.
- **Recoloring legality (demonstrated on D):**
  - D is licensed CC BY 3.0, so adaptations are allowed with attribution and a note of the change.
    A recolored derivative of D (green → black) **would be permitted**.
  - The provenance record must show the original (green), the target (registry "שחור מטלי"), the
    method, and "modified by AutoKeep".
  - Under an **ND** license (e.g. H), recoloring **and** background removal are forbidden, so
    those candidates are skipped.

## 2. Proposed automated resolver architecture (for approval)

### 2.1 Identity resolution (deterministic, in the app or backend)

Inputs:

- the registry record: make, commercial name, `degem_nm`, `degem_cd`, first registration, color;
- the WLTP catalog: doors, body (`merkav`);
- user-confirmed fields.

A small **curated generation table** per model covers generation code, production years, facelift
date and body codes. For example, Ibiza: 6L 2002–08, 6J 2008–17 (facelift 2012), 6F 2017–.

Output: a **vehicle class key** plus a confidence level, e.g.
`seat/ibiza/6j/pre-fl/5d-hatch/black` (confidence medium). No plate or owner data is in the key.

### 2.2 Candidate discovery (backend or operator tool, never on the device)

- **License-bearing APIs first:** Wikimedia Commons API (categories + search), Openverse API.
  Unsplash and Pexels APIs are optional; their _API_ terms add attribution and hotlinking duties
  beyond the photo license.
- **The general web** (a search API) is a **discovery hint only**. A candidate is kept only if it
  resolves to a page with an explicit, image-specific license or permission.

### 2.3 Rights verifier (fail-closed)

**Allow-list:**

- CC0;
- CC BY 2.0–4.0;
- CC BY-SA 2.0–4.0, with ShareAlike tracked;
- Unsplash License / Pexels License, subject to their API terms;
- Public Domain Mark **only** from institutional sources for genuinely old works.

**Reject:** NC, ND (when modification is needed), editorial-only, "all rights reserved", unknown,
self-applied PDM on recent photos, and Pixabay content with visible logos.

**Stored evidence per image:**

- the source URL and the license URL;
- the creator and the attribution text;
- the license metadata captured at retrieval (e.g. Commons `extmetadata`) with a timestamp;
- the SHA-256 of the original.

### 2.4 Applicability verifier

Automated visual verification (generation, facelift, body, color) needs a **vision model**. That is
a provider/cost/privacy decision, similar to gate G1.

**Proposal for V1:**

1. The resolver ranks candidates by metadata: title, categories, year and body words, with a
   color estimate from pixels.
2. A **human operator approves** each class → image mapping in a review list, e.g. "A: pre-FL,
   5-door, black ✓".
3. Approved mappings go into the catalog.

This keeps quality high with no new AI provider. Automation can come later, with a separately
approved vision provider.

### 2.5 Processing (operator side, at build/publish time)

- Background removal (local open-source tool) **only when the license allows adaptation**.
- Recolor only if no correctly colored legal image exists **and** the license allows adaptation.
- Never alter badges, plates or other content to fake an exact match.
- Every output records the transformation, the original color and the target color, and inherits
  the ShareAlike license where it applies.

### 2.6 Distribution and privacy

- The catalog is served from AutoKeep's own storage (or bundled for common models), keyed by
  **class key**.
- The device asks only for a class key (make/model/generation/body/color). No plate, owner data or
  user photo is sent.
- Licenses permit caching. The attribution travels with the image.

### 2.7 Display rules in the app

| Priority | Display                                                                                                                                                                                       |
| -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1        | **The user's own photo** (always wins once supplied)                                                                                                                                          |
| 2        | **Verified model reference** with the label **"תמונת דגם להמחשה"**, plus the credit: photographer · license · "עובד ע״י AutoKeep" if modified. Tapping it shows the source and license links. |
| 3        | Color illustration by body type (if the owner wants it; the preview was rejected)                                                                                                             |
| 4        | Neutral illustration                                                                                                                                                                          |

- An "image credits" section in Settings lists every reference image shown.
- A low-confidence facelift match shows the generation-level image with the same label.

## 3. Decisions requested from the owner

1. Approve the fail-closed rights allow-list (§2.3). Specifically:
   - CC BY-SA ShareAlike on AutoKeep-modified images;
   - no NC, ND or editorial sources.
2. Approve V1 **human-approved** applicability instead of an automated vision provider (§2.4).
3. Approve the catalog storage and distribution model (§2.6): AutoKeep storage vs bundling.
4. Approve the facelift rule: registry `degem_cd` + first registration, with a fallback to a
   generation-level image or one user question.
5. For this case: candidate **A** (pre-facelift, likely for `cd 26`) and **C** (facelift), both
   CC BY-SA 4.0, with background removal as the only modification.
