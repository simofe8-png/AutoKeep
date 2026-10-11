# AutoKeep network behaviour

Local-first (ADR-0023): AutoKeep has no server that receives or stores user vehicle data. This is
every path in the app that can use the network, as of 2026-10-11. The guard test
`src/__tests__/secrets-boundary.test.ts` fails if another app file starts making network calls or
if a backend client, URL variable or account module appears.

| Path                            | Where                                     | What is sent                                                                                    | Why it is kept                                                                     |
| ------------------------------- | ----------------------------------------- | ----------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| Ministry of Transport open data | `src/providers/registry/dataGovIl.ts`     | The plate number the owner typed (and model codes from the answer), as a query to `data.gov.il` | Owner-initiated vehicle lookup on a public government API; nothing is stored there |
| Connectivity state              | `src/providers/network/netInfoNetwork.ts` | Nothing from the app; reads the OS network state                                                | Explains that the registry lookup needs a connection                               |
| App updates (EAS Update)        | `expo-updates` (native)                   | Runtime version, channel, platform; downloads the JS bundle                                     | Distribution of app updates                                                        |
| App installs and native updates | Google Play                               | Handled by the OS store                                                                         | Distribution                                                                       |

Not network paths:

- **Backup files** are written to a place the user picks (device folder via the Storage Access
  Framework, or the share sheet, e.g. Google Drive). Whatever the user picks moves the file;
  AutoKeep does not upload it.
- **OCR and PDF reading** run in WebViews whose Content-Security-Policy is `default-src 'none'`
  with `connect-src blob: data:` (no network); the PDF host also refuses any navigation that is
  not `about:`. Tesseract language data ships inside the app.
- **Licence OCR** (`modules/license-ocr`, Tesseract4Android) runs on the device.
- **Notifications** are scheduled locally; no push token is requested.
- **VIN, documents, photos, history and the database** are never sent anywhere by the app.
