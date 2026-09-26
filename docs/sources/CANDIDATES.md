# Official-source candidates: PENDING HUMAN APPROVAL

Researched 2026-09-26 by Claude with free web search and fetch (read-only). **Nothing here is
trusted yet.** `OFFICIAL_DOMAINS` and `KNOWN_OFFICIAL_SOURCES` stay empty until a person approves
entries under `docs/sources/REGISTRY_PROCEDURE.md`.

**Main evidence gap:** every row rests only on importer-controlled websites plus search snippets.
The Ministry of Transport direct-importer dataset (data.gov.il `mehir_yevuan`) returned HTTP 403
to automated fetch, and the manufacturers' global distributor lists were not checked.
**Recommended before approval:** for each row, confirm the importer through the MoT list or the
manufacturer's distributor page.

## Candidate official domains (`OFFICIAL_DOMAINS`, kind `official_importer`, market IL)

| Key           | Importer (per evidence)                    | Candidate domain(s)                                       | Evidence (what the page says)                                                                                                                   | Confidence  | robots.txt / sitemap                                              |
| ------------- | ------------------------------------------ | --------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | ----------- | ----------------------------------------------------------------- |
| toyota        | Union Motors (יוניון מוטורס)               | toyota.co.il                                              | https://www.toyota.co.il/discover-toyota/toyota-in-israel: "חברת יוניון מוטורס הינה המשווקת הרשמית של רכבי TOYOTA בישראל"                       | High        | Present; sitemap.xml; PDFs not blocked                            |
| hyundai       | Colmobil (כלמוביל)                         | hyundaimotors.co.il (PDF hosts: prodmedia.colmobil.co.il) | https://www.hyundaimotors.co.il/maintenance/: footer "© כל הזכויות שמורות לקבוצת כלמוביל", "יונדאי מבית כלמוביל"                                | High / Med  | Present; sitemap.xml                                              |
| kia           | Talcar (טלקאר), indirect evidence          | kia-israel.co.il, cdnmedia.kia-israel.co.il               | The warranty page mentions "הארכת אחריות טלקאר"; the homepage does not name the importer                                                        | Medium      | Present (WordPress); no sitemap line                              |
| mazda         | Delek Motors (דלק מוטורס)                  | mazda.co.il, api.mazda.co.il                              | The mazda.co.il footer names "קבוצת דלק מוטורס ... מטעם המותג MAZDA"; service e-mail @delekmotors.co.il                                         | High        | Present; Allow /; sitemap.xml                                     |
| skoda         | Champion Motors (צ'מפיון מוטורס)           | skoda.co.il                                               | https://www.championmotors.co.il/ lists Skoda among the VW-group brands it represents; the skoda.co.il accessibility page names Champion Motors | High        | **`Disallow: /*.pdf$`**, so the crawler must not fetch PDFs there |
| volkswagen    | Champion Motors                            | vw.co.il (not volkswagen.co.il), vwcv.co.il               | Linked from championmotors.co.il                                                                                                                | High / Low  | Not checked                                                       |
| suzuki (cars) | מכשירי תנועה ומכוניות (2004) בע"מ          | suzuki.co.il                                              | The homepage names the importer; the company number comes from a snippet only                                                                   | Medium      | Not checked                                                       |
| honda         | Mayer's Cars and Trucks (קבוצת מאיר)       | honda.co.il, hondacars.co.il, hondabike.co.il             | https://www.mct.co.il/en/brand/הונדה/honda-cars/: "obtained the concession to import Honda cars in 1989"; motorcycles are unconfirmed           | Medium      | Not checked                                                       |
| yamaha        | Metro Motor ("מטרו freesbe")               | yamaha-motor.co.il                                        | https://www.yamaha-motor.co.il/page/אודות-ימאהה: "מיובא לישראל באופן בלעדי על ידי קבוצת מטרו freesbe"                                           | Medium-High | Not checked                                                       |
| kawasaki      | Metro Motor (מטרו מוטור שיווק (1981) בע"מ) | kawasaki.co.il                                            | Footer copyright names Metro Motor; there is no explicit "official importer" sentence                                                           | Medium      | Not checked                                                       |
| sym           | Metro Motor                                | sanyang.co.il                                             | The page title "... מטרו freesbe (מטרו מוטור) יבואן רשמי" appeared in search results only                                                       | Medium      | Not checked                                                       |

## Documents found (candidates for `KNOWN_OFFICIAL_SOURCES` / curation)

**None of the sources found has an official per-model maintenance schedule as a static PDF.**
Toyota and Mazda publish schedules behind model/year selectors. Hyundai and Kia give out owner
manuals only through e-mail forms, which are out of bounds. Warranty and service booklets that
may contain generic schedules:

- Hyundai service and warranty booklet (search result, not yet downloaded): https://prodmedia.colmobil.co.il/media/sites/2/2023/07/%D7%A1%D7%A4%D7%A8-%D7%A9%D7%99%D7%A8%D7%95%D7%AA-%D7%95%D7%9B%D7%AA%D7%91-%D7%90%D7%97%D7%A8%D7%99%D7%95%D7%AA-%D7%99%D7%95%D7%A0%D7%93%D7%90%D7%99.pdf
- Kia warranty booklet: https://kia-israel.co.il/wp-content/uploads/2025/07/חוברת-אחריות-קיה-יולי-25.pdf
- Suzuki driver's manuals (per model, Hebrew and Arabic): https://suzuki.co.il/content/ספרי-נהג-סוזוקי

Each document must be downloaded, have its coverage read **from the document itself**, and pass
`npm run curate:check` before an entry is proposed.

## Decisions needed from a person

1. Approve, reject or request more evidence for each domain row above.
2. **Policy:** Champion Motors hosts its manuals on third-party viewers (FlippingBook, Calameo,
   ituran). Recommendation: do **not** register those hosts as official, because authority would
   extend to every document on them.
3. Record legal entity names separately from brand names. For example, "Metro freesbe" is the
   brand of מטרו מוטור שיווק (1981) בע"מ.
4. Suzuki cars and Suzuki motorcycles have different importers. Motorcycles need their own
   research.

## Explicitly excluded (third-party, never authoritative)

manualpdf.co.il, automax.co.il, f2h.io, xn----2hc3awpyb.com and every other non-importer manual
mirror.
