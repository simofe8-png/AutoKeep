import type { PlannedNotification } from '@/features/alerts/notificationPlan';

/**
 * Local-notification port (T130). Only on-device scheduling — no remote push service (that would
 * need an external account: an approval gate). Opening a notification yields its deep link.
 */
export interface NotificationScheduler {
  /** Asks the OS for permission (only ever called after the user opts in). */
  requestPermission(): Promise<boolean>;
  hasPermission(): Promise<boolean>;
  /** Replaces every AutoKeep-scheduled notification with this plan (idempotent). */
  replaceAll(plan: readonly PlannedNotification[]): Promise<void>;
  cancelAll(): Promise<void>;
  /** Subscribes to notification taps; returns an unsubscribe function. */
  onOpen(listener: (url: string) => void): () => void;
}

/** In-memory scheduler for tests. */
export class MemoryScheduler implements NotificationScheduler {
  granted = true;
  asked = 0;
  scheduled: PlannedNotification[] = [];
  private listeners = new Set<(url: string) => void>();

  async requestPermission() {
    this.asked += 1;
    return this.granted;
  }
  async hasPermission() {
    return this.granted && this.asked > 0;
  }
  async replaceAll(plan: readonly PlannedNotification[]) {
    this.scheduled = [...plan];
  }
  async cancelAll() {
    this.scheduled = [];
  }
  onOpen(listener: (url: string) => void) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }
  /** Simulates the user tapping a delivered notification. */
  tap(url: string) {
    this.listeners.forEach((l) => l(url));
  }
}
