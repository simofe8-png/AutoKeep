import { Redirect } from 'expo-router';
import { useEffect, useState } from 'react';

import { createVehicle, timestamp } from '@/domain';
import {
  ActiveVehicleStore,
  migrate,
  MIGRATIONS,
  ProfileRepository,
  VehicleRepository,
} from '@/persistence';
import { openExpoDatabase } from '@/persistence/db/expoDatabase';
import { uuidIds } from '@/persistence/ids';
import { AppText, Screen } from '@/ui';

/**
 * DEVELOPMENT-ONLY on-device persistence self-check (M05 evidence). Uses a throwaway database file;
 * never touches user data. Not reachable in production builds.
 */
export default function DbCheck() {
  const [lines, setLines] = useState<string[]>(['running…']);

  useEffect(() => {
    if (!__DEV__) return;
    const log: string[] = [];
    const now = () => timestamp(new Date().toISOString());
    (async () => {
      const name = `devcheck-${Date.now()}.db`;
      const db = await openExpoDatabase(name);
      const m = await migrate(db, MIGRATIONS, now);
      log.push(`MIGRATE ${m.from}->${m.to}`);
      const profile = await new ProfileRepository(db).getOrCreate(uuidIds, now());
      const v = createVehicle(
        {
          ownerProfileId: profile.id,
          type: 'car',
          identity: { manufacturer: 'בדיקה', model: 'X', year: 2020 },
          registration: '1234567',
        },
        uuidIds,
        now(),
      );
      if (!v.ok) throw new Error('vehicle');
      await new VehicleRepository(db).insert(v.value);
      await new ActiveVehicleStore(db).set(v.value.id, now());
      log.push(`UUID ${/^[0-9a-f-]{36}$/.test(v.value.id) ? 'OK' : 'BAD'}`);
      await db.close();
      // Reopen the same file to simulate an app restart.
      const db2 = await openExpoDatabase(name);
      const again = await migrate(db2, MIGRATIONS, now);
      const back = await new VehicleRepository(db2).get(v.value.id);
      const active = await new ActiveVehicleStore(db2).get();
      log.push(
        `REOPEN ${again.from}->${again.to} vehicle=${back?.identity.manufacturer === 'בדיקה'} active=${active === v.value.id}`,
      );
      let rolledBack = false;
      try {
        await db2.transaction(async (tx) => {
          await tx.run("UPDATE vehicles SET model = 'changed' WHERE id = ?", [v.value.id]);
          throw new Error('abort');
        });
      } catch {
        rolledBack = (await new VehicleRepository(db2).get(v.value.id))?.identity.model === 'X';
      }
      log.push(`ROLLBACK ${rolledBack ? 'OK' : 'BAD'}`);
      await db2.close();
      log.push('DBCHECK PASS');
    })()
      .catch((e: unknown) => log.push(`DBCHECK FAIL ${String(e)}`))
      .finally(() => setLines([...log]));
  }, []);

  if (!__DEV__) return <Redirect href="/" />;
  return (
    <Screen testID="screen-db-check">
      {lines.map((l) => (
        <AppText key={l} testID="db-check-line">
          {l}
        </AppText>
      ))}
    </Screen>
  );
}
