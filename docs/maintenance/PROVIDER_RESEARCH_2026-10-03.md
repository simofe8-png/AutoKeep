# Maintenance data providers: assessment (2026-10-03)

Research only: no account, contact, purchase or acceptance of terms. Sources were read on
2026-10-03.

**Labels:** **V** = verified on the cited page. **I** = inferred. **U** = unknown or not public.

**Why this research:** M-SOURCE web discovery established no core service or oil interval for 16
cross-manufacturer vehicles (`MSOURCE_GENERALIZATION_2026-10-03.md`). This document assesses
professional structured data as the primary source.

## Update: the registry supplies the full VIN

- **Where it comes from:** the Ministry of Transport plate record's `misgeret` field is the VIN.
  Our test fixtures, built from real rows with the serials altered, have 17 characters.
  - The connector stores it as published: `src/providers/registry/dataGovIl.ts` (`vin`), plus
    the registry record's `vin` fact.
  - The UI shows only the last four characters (`RegistryFacts` `factText`).
- **Sanitized form:** `sanitizeVin` (`src/providers/registry/vin.ts`) gives a well-formed
  17-character VIN in the ISO 3779 alphabet, or nothing. It never repairs a value. Only this form
  may ever be sent to a provider.
- **Effect on identification:** a VIN lookup becomes the first identification route for a
  provider proof of concept. Mapping make / model / year / cc / engine code to the provider's
  vehicle ID becomes the fallback.
- **Caveats:**
  - Many European VINs carry filler characters (`VSSZZZ…`, `WF0DXX…`). Decoding them depends on
    the provider's manufacturer data, not on the VIN structure (I).
  - **Sending a VIN to a provider is a new external flow of personal data.** It is an approval
    gate (personal data, provider choice). Nothing sends it today. **Owner decision (2026-10-03):** no
    unmasked VIN leaves the client until a signed Data Processing Agreement and a B2C display
    licence are in place with the selected provider; test suites stay hermetic.

## Priority candidates for the proof of concept

### HaynesPro (Infopro Digital Automotive)

| Topic                          | Finding                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Ownership                      | Infopro Digital acquired Haynes / HaynesPro in 2020 (V: [infopro-digital-automotive.com](https://www.infopro-digital-automotive.com/news/infopro-digital-acquires-haynes-pro-and-becomes-a-world-leader-in-the-automotive-technical-data-sector/))                                                                                                                                                                                                                           |
| Maintenance data               | OEM-based maintenance schedules, wear-part and timing-belt intervals, fluids, service-indicator reset (V: [launch-europe.eu](https://launch-europe.eu/database-by-haynespro/), [hickleys.com](https://www.hickleys.com/diagnostics/haynespro.php)). Infopro's workshop product (Atelio Data, now RepairPro) shows manufacturer requirements "by periodicity or by mileage" (V: [infopro-digital-automotive.com/?p=3025](https://www.infopro-digital-automotive.com/?p=3025)) |
| Regimes                        | API method names `getMaintenanceSystemsV7` / `getMaintenanceTasksV9` suggest several maintenance systems per vehicle, e.g. fixed vs flexible (I: unofficial Postman workspace, seen only in search snippets). Normal vs severe: U                                                                                                                                                                                                                                            |
| VIN                            | Identification by VIN is offered by a reseller (V: [autoresource.co.uk](https://www.autoresource.co.uk/?p=17856)) and by Atelio Data, which also lists plate and make/model (V: [infopro-digital-automotive.com/?p=3025](https://www.infopro-digital-automotive.com/?p=3025)). Which VIN markets are covered: U                                                                                                                                                              |
| Plate lookup                   | AU, BR, DK, FI, FR, DE, IE, IT, NL, NZ, NO, PT, ES, SE, CH, UK, US. **Israel is not listed** (V: [VRM service](https://www.infopro-digital-automotive.com/vrm-vehicle-identification-service/))                                                                                                                                                                                                                                                                              |
| API                            | Partner "Web Services" (V: [haynespro-data](https://www.infopro-digital-automotive.com/uk/haynespro-data/)). No official public docs, no public sandbox                                                                                                                                                                                                                                                                                                                      |
| Price                          | Contract; PRICE UNKNOWN. Workshop UI for reference: £175 + VAT a year (V, UK reseller)                                                                                                                                                                                                                                                                                                                                                                                       |
| Consumer use, caching, storage | No public terms. REQUIRES COMMERCIAL CONFIRMATION. Fleet and leasing are named target segments; consumer apps are not (V)                                                                                                                                                                                                                                                                                                                                                    |
| Coverage                       | 127 makes, "OEM data for 99% of passenger cars", pan-European (V: [haynespro](https://www.infopro-digital-automotive.com/haynespro/)). The 12 sample vehicles: likely (I), not verified                                                                                                                                                                                                                                                                                      |

### TecAlliance TecRMI

| Topic                                          | Finding                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Maintenance data                               | Maintenance plans, service intervals, fluid specs; sourced from manufacturers and importers where possible (V: [products](https://www.tecalliance.net/products?solution=repair-maintenance&highlight=tecrmi-data), [GTC](https://a.storyblok.com/f/297549/x/8c46fa46ab/gtc-en.pdf) §3.1.1.1). About 230,000 service plans (V: [factorfocus.ie](https://www.factorfocus.ie/index.php/rmi-technical-service-data-from-tecalliance-2/13877)). Severe and flexible-regime fields: U |
| Identification                                 | TecDoc standard IDs (KType) (V: GTC §3.1.2.2). See the VIN route below                                                                                                                                                                                                                                                                                                                                                                                                          |
| VIN                                            | The public TecDoc Pegasus 3.0 WSDL has `getVehiclesByVIN` and `getVehicleDataByVINExt` (V: [WSDL](https://webservice.tecalliance.services/pegasus-3-0/services/TecdocToCatDLB.soapEndpoint?wsdl))                                                                                                                                                                                                                                                                               |
| VIN caveats                                    | The operations are labelled "VIN Services, Option 2", come from a third-party vendor, and are outside TecAlliance's SLA (V: [SLA](https://public.tecalliance.services/SLA-Data-Manager-Catalogue-Solutions.html)). These are **catalogue** operations: the route is VIN → KType → TecRMI (I). VIN market coverage: U                                                                                                                                                            |
| Plate lookup                                   | DE, NO, CH, NL, IT, PT, UK, SE, DK, FI, each licensed separately. **Israel is not listed** (V: [Service Book description](https://a.storyblok.com/f/297549/x/fa41a78cbc/service-description-tecrmi-service-book.pdf))                                                                                                                                                                                                                                                           |
| API                                            | API "available"; TecRMI docs not public (V). Per-request web service only, no bulk download (V: GTC §1.9.1). A 60-day implementation phase follows a signed contract (V: §1.8)                                                                                                                                                                                                                                                                                                  |
| Price                                          | Contract, minimum term 2 years (V: §1.10.3); PRICE UNKNOWN                                                                                                                                                                                                                                                                                                                                                                                                                      |
| **Terms that conflict with AutoKeep** (V, GTC) | B2B customers only (§1.1.7). Caching tied to a request, until the next data update and at most 30 days; pay-per-retrieval data may not be cached (§1.9.2). **No AI or machine-learning use** (§1.6.6). Per-end-user identifiers and billing (§3.1.2.5). "TecRMI inside" logo (§3.1.3.1). End-user disclaimer (§3.1.5.3). Per-country licences; Israel is not in the standard list (§1.1.4, §3.1.2.1). An "Open Access" licence variant exists (§1.6.4)                          |

## Other providers

- **Autodata (Solera)**
  - REST API, JSON/XML, OAuth2, with a "Service schedules" module (V: [developer portal](https://developer.autodata-group.com/)). Its corporate API page mentions "an app to the general public" (V: [autodata-group.com/corporate/api](https://www.autodata-group.com/corporate/api/)).
  - Docs are behind a login, and VIN support is U.
  - Contract; PRICE UNKNOWN. Site terms require a licence for commercial use (V).
  - A strong third candidate, despite the directive's HaynesPro / TecRMI priority.
- **ALLDATA Europe:** manufacturer maintenance schedules for 61 brands, launched Nov 2025 (V: [alldata.com](https://www.alldata.com/eu/en/maintenance-schedules)). No data API; partner tiers only. Israel is not in its countries (V).
- **Unsuitable as the main source (US-market data):** MOTOR, Mitchell 1, DataOne, Vehicle Databases, CarMD (V). Vehicle Databases also forbids caching or storage (V: [terms](https://vehicledatabases.com/terms-and-conditions)).
- **Cost-forecasting focus, schedule depth unproven:** Autovista SMR (13 European countries, no Israel) and DAT SilverDAT (V/I).
- **Manufacturer repair-information portals:** licensed for workshop use only. Stellantis prohibits using the data to develop products without a publishing licence (V: [Stellantis terms](https://public-servicebox.opel.com/cgv/AC/DOCTECH_cgv_en.pdf)).
- **Israel:** no public schedule dataset and no Israeli distributor of these providers found (U). The 2016 vehicle-services law obliges importers to give information to garages, not to publish schedules.

## How provider data would fit M-SOURCE

1. **Identification:** fingerprint plus sanitized VIN → provider vehicle ID. Match it against registry facts; a mismatch means no schedule.
2. **Schedule retrieval:** the provider's maintenance schedule is a source document with provenance: provider, data version, provider vehicle ID, retrieval date, response hash.
3. **Normalization:** item-level evidence records go through applicability, conflict checks against manufacturer and web evidence (never averaged), the local schedule, and the next-service engine.
4. **Source grading:** provider data is a separate source class, "licensed, manufacturer-derived". It is not graded official automatically.
5. **Contract-dependent constraints:**
   - Storage limits (TecRMI: at most 30 days) would require re-fetching instead of permanent local storage.
   - AI restrictions (TecRMI) mean provider data must never reach the research assistant.

## Next step (owner decision; approval gates: provider choice, paid service, personal data)

Request evaluation access, first from HaynesPro / Infopro, then TecAlliance (TecRMI), with
Autodata as an alternative. Ask each:

1. Is a VIN lookup available for Israeli-registered European-spec vehicles? Which VIN markets are
   covered?
2. Does the data carry normal vs severe conditions, fixed vs flexible regimes, and km + months per
   item?
3. May AutoKeep display schedules to consumers in Israel?
4. May normalized schedules be stored on the device indefinitely?
5. May the data be processed alongside AI components?
6. What do evaluation and production cost?

**Proof of concept (offline, no production integration):** three sample vehicles (Ibiza 1.4 CGG
2012, Fiesta 1.25 SNJB 2015, Corolla 1.6 2017), run through VIN → vehicle ID → schedule.
Compare the result with the official SEAT MY12 interval M-SOURCE already holds and with the
matrix items.
