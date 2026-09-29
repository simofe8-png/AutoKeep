# Approved vehicle model reference images

Operator data for AutoKeep's reference-image catalog. It is **not** imported by the app and
**not** bundled in the APK. The app downloads approved images from AutoKeep-controlled storage.

Each approved image is two files:

- `<id>.json`: the full provenance and rights record (source, original hash, Commons metadata
  snapshot, license flags, derivative operations, review).
- `<id>.png`: the approved derivative. Its SHA-256 is `derivative.resultSha256` in the record.

Publish with `node tools/reference-images.mjs --target <local|staging> publish <id>`. The tool
**fails closed**: it refuses a record that is not approved or not commercially usable, a modified
image whose license does not allow adaptations, and a binary whose hash does not match.

## Licenses of the images in this folder

| File                                           | Original                                                                                                     | Author                         | License                                                         | Changes                                          |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------ | ------------------------------ | --------------------------------------------------------------- | ------------------------------------------------ |
| `ref_seat_ibiza_6j_prefl_hatch5d_black_01.png` | [2009 SEAT Ibiza Sport 84 1.4](https://commons.wikimedia.org/wiki/File:2009_SEAT_Ibiza_Sport_84_1.4.jpg)     | Makizox (account now Vauxford) | [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/) | Background removed, cropped, resized by AutoKeep |
| `ref_seat_ibiza_6j_fl1_hatch5d_black_01.png`   | [2014 SEAT Ibiza Toca 1.4 Front](https://commons.wikimedia.org/wiki/File:2014_SEAT_Ibiza_Toca_1.4_Front.jpg) | Vauxford                       | [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/) | Background removed, cropped, resized by AutoKeep |

These adapted **images** are released under **CC BY-SA 4.0** (ShareAlike). This applies to the
image files only, not to the AutoKeep application.

CC licenses grant no trademark rights. Manufacturer badges are shown unaltered.
