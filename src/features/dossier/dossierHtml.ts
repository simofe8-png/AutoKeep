import type { OdometerReadingVM, VehicleDataBundle } from '@/features/data/types';
import { formatDate, formatKm } from '@/features/vehicles/format';
import { vehicleDisplayName, type VehicleSummary } from '@/features/vehicles/types';
import { he } from '@/i18n/he';

/**
 * T147/T148: the vehicle dossier as a self-contained RTL HTML document (printed to PDF for sharing).
 * Generated from the source-of-truth records — never a competing history — with provenance on
 * every fact: user-reported values are labeled as such, verification states stay distinct, and a
 * professional schedule appears only if it is verified.
 */

const esc = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  );

const verification: Record<string, string> = {
  verified: he.verification.verified,
  pending: he.verification.pending,
  unable_to_verify: he.verification.unableToVerify,
};

export function readingSource(r: OdometerReadingVM): string {
  return he.dossier.readingSource[r.source];
}

export function buildDossierHtml(
  vehicle: VehicleSummary,
  bundle: VehicleDataBundle,
  generatedAt: string,
): string {
  const readings = [...(bundle.readings ?? [])].sort((a, b) => b.date.localeCompare(a.date));
  const rows = (cells: string[][]) =>
    cells.map((c) => `<tr>${c.map((x) => `<td>${x}</td>`).join('')}</tr>`).join('');

  const schedule =
    bundle.schedule.status === 'verified' && bundle.schedule.source
      ? `<p>${esc(he.dossier.scheduleVerified)}: ${esc(bundle.schedule.source.sourceTitle)}${
          bundle.schedule.source.version ? ` (${esc(bundle.schedule.source.version)})` : ''
        }</p>`
      : `<p>${esc(he.dossier.scheduleUnavailable)}</p>`;

  const history = bundle.history.length
    ? `<table><thead><tr><th>${he.dossier.col.date}</th><th>${he.dossier.col.odometer}</th><th>${
        he.dossier.col.work
      }</th><th>${he.dossier.col.provenance}</th></tr></thead><tbody>${rows(
        bundle.history.map((e) => [
          esc(formatDate(e.date)),
          esc(formatKm(e.odometerKm)),
          esc(
            e.actions
              .filter((a) => a.performed)
              .map((a) => a.title)
              .join(', '),
          ),
          esc(
            e.sourceAuthority === 'user_report'
              ? he.dossier.userReported
              : `${he.authority[e.sourceAuthority]} · ${verification[e.verification]}`,
          ),
        ]),
      )}</tbody></table>`
    : `<p>${esc(he.garage.noHistory)}</p>`;

  return `<!doctype html><html lang="he" dir="rtl"><head><meta charset="utf-8"/>
<style>
body{font-family:Arial,sans-serif;direction:rtl;margin:24px;color:#14213d}
h1{font-size:22px;margin:0 0 4px} h2{font-size:16px;margin:20px 0 6px;border-bottom:1px solid #ccd}
table{width:100%;border-collapse:collapse;font-size:12px} td,th{border:1px solid #dde;padding:4px 6px;text-align:right}
.muted{color:#556;font-size:11px}
</style></head><body>
<h1>${esc(he.dossier.title)} — ${esc(vehicleDisplayName(vehicle))}</h1>
<p>${esc(he.vehicleType[vehicle.kind])} · ${esc(vehicle.registration)}</p>
<p class="muted">${esc(he.dossier.generatedAt)}: ${esc(formatDate(generatedAt))} · ${esc(he.dossier.intro)}</p>
<h2>${esc(he.dossier.odometerReadings)}</h2>
${
  readings.length
    ? `<table><tbody>${rows(
        readings.map((r) => [esc(formatDate(r.date)), esc(formatKm(r.km)), esc(readingSource(r))]),
      )}</tbody></table>`
    : `<p>—</p>`
}
<h2>${esc(he.dossier.serviceHistory)}</h2>
${history}
<h2>${esc(he.dossier.maintenanceSchedule)}</h2>
${schedule}
<h2>${esc(he.dossier.documents)}</h2>
${
  bundle.documents.length
    ? `<table><tbody>${rows(
        bundle.documents.map((d) => [
          esc(d.title),
          esc(he.authority[d.authority]),
          esc(verification[d.verification]),
        ]),
      )}</tbody></table>`
    : `<p>—</p>`
}
<p class="muted">${esc(he.dossier.footer)}</p>
</body></html>`;
}
