import { router } from 'expo-router';
import { useEffect } from 'react';

import { useAppData } from '@/features/data/DataContext';
import { notificationScheduler } from '@/features/data/dataSource';

import { planNotifications } from './notificationPlan';

/**
 * Keeps device notifications in step with the current alerts (T130) and routes notification taps
 * to the alert, which switches the app to that alert's vehicle (T131). Does nothing unless the
 * user opted in and the OS granted permission.
 */
export function NotificationsBridge() {
  const { vehicles, getBundle, notificationsEnabled, isDemoData } = useAppData();
  const scheduler = isDemoData ? null : notificationScheduler();

  useEffect(() => {
    if (!scheduler) return;
    let cancelled = false;
    void (async () => {
      if (!notificationsEnabled || !(await scheduler.hasPermission())) {
        if (!cancelled) await scheduler.cancelAll();
        return;
      }
      if (!cancelled)
        await scheduler.replaceAll(planNotifications(vehicles, getBundle, new Date()));
    })().catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [scheduler, vehicles, getBundle, notificationsEnabled]);

  useEffect(() => {
    if (!scheduler) return;
    return scheduler.onOpen((url) => router.push(url as never));
  }, [scheduler]);

  return null;
}
