/**
 * TEST-ONLY populated local database: a profile with a car and a motorcycle, readings, a
 * document + extraction, a schedule, service events with actions and a document link, a garage
 * recommendation, a deferred item and an alert. Used by persistence, adoption and sync tests.
 */
import {
  confirmServiceDraft,
  createAlert,
  createDocument,
  createExtraction,
  createGarageRecommendation,
  createOdometerReading,
  createSchedule,
  createVehicle,
  isoDate,
  newMeta,
  type IdGenerator,
  type LocalProfile,
  type Timestamp,
  type Vehicle,
} from '@/domain';

import { migrate } from '../migrations/runner';
import { MIGRATIONS } from '../migrations';
import { ProfileRepository, OdometerRepository, VehicleRepository } from '../repositories/vehicles';
import {
  AlertRepository,
  DeferredItemRepository,
  DocumentRepository,
  ExtractionRepository,
  GarageRecommendationRepository,
  ScheduleRepository,
  ServiceRepository,
} from '../repositories/records';
import { openTestDatabase, type TestDatabase } from './sqljsDatabase';

export interface PopulatedWorld {
  db: TestDatabase;
  profile: LocalProfile;
  car: Vehicle;
  moto: Vehicle;
}

function must<T>(r: { ok: true; value: T } | { ok: false; issues: unknown }): T {
  if (!r.ok) throw new Error(`fixture: ${JSON.stringify(r.issues)}`);
  return r.value;
}

export async function populatedWorld(ids: IdGenerator, now: Timestamp): Promise<PopulatedWorld> {
  const db = await openTestDatabase();
  await migrate(db, MIGRATIONS, () => now);
  const profile = await new ProfileRepository(db).getOrCreate(ids, now);
  const vehicles = new VehicleRepository(db);
  const car = must(
    createVehicle(
      {
        ownerProfileId: profile.id,
        type: 'car',
        identity: { manufacturer: 'טויוטה', model: 'קורולה', year: 2019, engine: '1.6' },
        registration: '12-345-67',
        vin: 'JTDBR32E720123456',
      },
      ids,
      now,
    ),
  );
  const moto = must(
    createVehicle(
      {
        ownerProfileId: profile.id,
        type: 'motorcycle',
        identity: { manufacturer: 'הונדה', model: 'CB500F', year: 2021 },
        registration: '123-45-678',
      },
      ids,
      now,
    ),
  );
  await vehicles.insert(car);
  await vehicles.insert(moto);

  const odo = new OdometerRepository(db);
  for (const [v, km, date] of [
    [car, 80000, '2026-04-01'],
    [car, 84250, '2026-09-10'],
    [moto, 18420, '2026-06-02'],
  ] as const) {
    await odo.add(
      must(
        createOdometerReading(
          { vehicleId: v.id, valueKm: km, measuredAt: isoDate(date), source: 'user' },
          await odo.listForVehicle(v.id),
          ids,
          now,
        ),
      ),
    );
  }

  const doc = must(
    createDocument(
      {
        vehicleId: car.id,
        kind: 'invoice',
        title: 'חשבונית',
        origin: 'user_upload',
        authority: 'garage_document',
        original: {
          storageKey: 'local/invoice.pdf',
          mimeType: 'application/pdf',
          sizeBytes: 1234,
          sha256: 'c'.repeat(64),
          pageCount: 1,
        },
      },
      ids,
      now,
    ),
  );
  await new DocumentRepository(db).add(doc);
  await new ExtractionRepository(db).add(
    createExtraction(
      {
        documentId: doc.id,
        vehicleId: car.id,
        kind: 'invoice',
        status: 'validated',
        producedBy: 'mock-ocr@1',
        payload: { odometer: 75120 },
        uncertainFields: [],
      },
      ids,
      now,
    ),
  );

  const itemId = ids.next<'MaintenanceItem'>();
  const schedule = must(
    createSchedule(
      {
        vehicleId: car.id,
        intervals: [
          {
            id: ids.next(),
            label: 'oil',
            rule: 'earliest_of',
            everyKm: 15000,
            everyMonths: 12,
            items: [
              {
                id: itemId,
                title: 'שמן מנוע',
                actionType: 'replacement',
                manufacturerText: 'כל 15,000 ק״מ',
                reference: { sourceId: ids.next(), page: 412 },
              },
            ],
          },
        ],
        evidence: [{ authority: 'manufacturer', exactApplicability: true }],
        applicability: { matchedOn: ['model'], exact: true },
      },
      ids,
      now,
    ),
  );
  await new ScheduleRepository(db).add(schedule);

  const services = new ServiceRepository(db);
  const carEvent = must(
    confirmServiceDraft(
      {
        vehicleId: car.id,
        origin: 'document',
        date: '2025-12-10',
        odometerKm: 75120,
        garageName: 'מוסך',
        notes: '',
        actions: [
          {
            title: 'שמן מנוע',
            actionType: 'replacement',
            performed: true,
            maintenanceItemId: itemId,
            unlisted: false,
          },
          {
            title: 'שטיפה',
            actionType: 'other',
            performed: true,
            maintenanceItemId: null,
            unlisted: true,
          },
        ],
        documentIds: [doc.id],
        extractionId: null,
      },
      { confirmedBy: 'user', confirmedAt: now },
      ids,
    ),
  );
  await services.add(carEvent);
  await services.add(
    must(
      confirmServiceDraft(
        {
          vehicleId: moto.id,
          origin: 'manual',
          date: '2026-05-20',
          odometerKm: 18100,
          garageName: '',
          notes: 'שימון שרשרת',
          actions: [
            {
              title: 'שימון שרשרת',
              actionType: 'other',
              performed: true,
              maintenanceItemId: null,
              unlisted: true,
            },
          ],
          documentIds: [],
          extractionId: null,
        },
        { confirmedBy: 'user', confirmedAt: now },
        ids,
      ),
    ),
  );

  await new GarageRecommendationRepository(db).add(
    must(
      createGarageRecommendation(
        {
          vehicleId: car.id,
          text: 'רפידות',
          date: isoDate('2025-12-10'),
          garageName: 'מוסך',
          sourceDocumentId: doc.id,
        },
        ids,
        now,
      ),
    ),
  );
  await new DeferredItemRepository(db).add({
    id: ids.next(),
    vehicleId: car.id,
    maintenanceItemId: itemId,
    deferredAt: isoDate('2025-12-10'),
    serviceEventId: carEvent.id,
    reason: 'נדחה',
    resolvedByServiceEventId: null,
    ...newMeta(now),
  });
  await new AlertRepository(db).add(
    must(
      createAlert(
        {
          vehicleId: car.id,
          kind: 'upcoming',
          basis: {
            scheduleId: schedule.id,
            intervalId: schedule.intervals[0].id,
            facts: { remainingKm: 5750 },
          },
        },
        ids,
        now,
      ),
    ),
  );
  return { db, profile, car, moto };
}
