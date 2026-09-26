import Constants, { ExecutionEnvironment } from 'expo-constants';
import { Platform } from 'react-native';

import type { PlannedNotification } from '@/features/alerts/notificationPlan';

import type { NotificationScheduler } from './types';

type NotificationsModule = typeof import('expo-notifications');

const CHANNEL = 'maintenance';

/**
 * Expo Go (SDK 53+) throws when expo-notifications is merely imported on Android (device-verified),
 * so the module is loaded lazily and local notifications are offered only in development/release
 * builds. In Expo Go this returns null and Settings says notifications are unavailable here.
 */
export function createExpoNotifications(): NotificationScheduler | null {
  if (Constants.executionEnvironment === ExecutionEnvironment.StoreClient) return null;
  let mod: NotificationsModule | null = null;
  const load = (): NotificationsModule => {
    if (!mod) {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      mod = require('expo-notifications') as NotificationsModule;
      mod.setNotificationHandler({
        handleNotification: async () => ({
          shouldShowBanner: true,
          shouldShowList: true,
          shouldPlaySound: false,
          shouldSetBadge: false,
        }),
      });
    }
    return mod;
  };
  const ensureChannel = async () => {
    if (Platform.OS === 'android') {
      const N = load();
      await N.setNotificationChannelAsync(CHANNEL, {
        name: 'תזכורות תחזוקה',
        importance: N.AndroidImportance.DEFAULT,
      });
    }
  };

  return {
    async requestPermission() {
      await ensureChannel();
      return (await load().requestPermissionsAsync()).granted;
    },
    async hasPermission() {
      return (await load().getPermissionsAsync()).granted;
    },
    async replaceAll(plan: readonly PlannedNotification[]) {
      const N = load();
      await N.cancelAllScheduledNotificationsAsync();
      await ensureChannel();
      for (const n of plan) {
        await N.scheduleNotificationAsync({
          identifier: n.key,
          content: { title: n.title, body: n.body, data: { url: n.url } },
          trigger: { type: N.SchedulableTriggerInputTypes.DATE, date: n.at, channelId: CHANNEL },
        });
      }
    },
    async cancelAll() {
      await load().cancelAllScheduledNotificationsAsync();
    },
    onOpen(listener) {
      const sub = load().addNotificationResponseReceivedListener((r) => {
        const url = r.notification.request.content.data?.url;
        if (typeof url === 'string' && url.startsWith('/alerts/')) listener(url);
      });
      return () => sub.remove();
    },
  };
}
