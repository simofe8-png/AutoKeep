# ADR-0022: Maintenance is the booklet's table and the periodic service it derives

- Status: accepted (owner decisions 2026-10-06)
- Date: 2026-10-06
- Amends: ADR-0021 (the schedule still comes only from the owner; its form changes)

## Context

The owner uploaded a photo of the Ford Fiesta 2012 booklet table ("תכנית טיפולים תקופתיים",
pages 143–144) and the app could not read it: a full-page OCR pass reads the item names but drops
almost every single letter inside the grid. The owner also found the maintenance menu cluttered,
and the per-item manual entry (item / every km / every months) did not match how the booklet
states the schedule: items × service columns, with an action letter in each cell.

## Decision

1. **Maintenance has two screens** (the earlier plan screen is replaced):
   - **"לוח טיפולים"**: the owner's table drawn like the booklet. Items are rows under the
     booklet's system headings. The service columns carry the km (× 1000) and months header rows.
     The cells hold the booklet letters ב בדוק · כ כוונן · ה החלף · ס סוך · ח חזק · נ נקה, alone
     or combined (ב/ח). Rule rows are written across the columns ("החלף כל שנתיים",
     "ללא החלפה"). The table also carries the booklet's footnotes. A phone shows 8 columns at a
     time.
   - **"טיפול תקופתי"**: the next service and the one after, derived deterministically
     (`src/engine/serviceTable.ts`).
     - Service _n_ is due at _n_ × kmStep km, or monthsStep months after the previous periodic
       service, whichever comes first.
     - Its content is the table column of its km. After the last column the table starts again,
       so 255,000 is like 15,000.
     - Rule rows count from when that item was last done. Unknown stays unknown, and no date is
       invented.
     - The owner checks every item performed. Saving writes ONE history record (user report,
       manual origin) and, in the same transaction, what the table completed.
2. **Manual entry is the same table.** The owner sets the shape (every km, every months,
   columns), adds rows (optionally filling every column with one action), and edits any cell.
3. **Reading a photo or scan is free and on the device.** The existing Tesseract WebView gets a
   table mode (`tools/ocr/table-reader.js`):
   - It finds the ruled grid (adaptive binarisation, skew ≤ 4°, line projections) and erases the
     lines.
   - It reads labels per cell, reads rules written across the columns as text, and reads the
     header rows as numbers.
   - It clusters look-alike letters and reads each cluster by majority vote.
   - A scanned PDF is read through its page JPEGs. A text-only PDF asks for a photo.

   The result is always a **proposal**. Uncertain cells and every rule row are marked, and only an
   approved table counts. On the owner's own scan, the result is the right shape (16 columns,
   15,000 km / 12 months, all 38 items in order). One cell was wrong without a mark. Every other
   misread cell was marked.

4. **The Fiesta table transcribed from the owner's scan** is offered as a proposal to a Ford
   Fiesta of model year 2012 only (`src/features/maintenance/table/fiesta2012.ts`).
5. **Storage**: migration v19 adds `service_tables` (JSON table, proposed | confirmed, source
   manual | photo | transcribed, uncertain cells) and `service_table_done`. Both are LOCAL ONLY.
   With the owner's approval, the earlier per-item rows (`manual_schedule_items`) are removed;
   recorded services stay in the history. A table service whose history record is deleted no
   longer counts.

## Consequences

- The earlier plan screen, its booklet-review flow and the per-item table UI are removed, along
  with their UI tests. The requirement engine, the service journal and the next-service screen
  (garage mode) are unchanged.
- Home's "next service" tile and the profile item "לוח טיפולים" use the approved table first.
- Cloud backup of the v14–v19 local tables remains an open approval gate.
- The table reader is verified on the owner's scan in Node (same Tesseract build). A phone check
  of photographing the booklet is still due.
