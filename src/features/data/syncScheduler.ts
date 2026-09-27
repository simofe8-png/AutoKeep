import { backoffDelay } from '@/sync/engine';

import type { SyncAttempt } from './localStore';

export type SyncRun = () => Promise<SyncAttempt | 'skipped'>;

export interface SyncSchedulerDeps {
  run: SyncRun;
  setTimer?: (fn: () => void, ms: number) => unknown;
  clearTimer?: (handle: unknown) => void;
  /** Quiet period after a local change before it is backed up. */
  debounceMs?: number;
  random?: () => number;
}

/**
 * Decides WHEN to sync (P2A, Y4). Local-first: every trigger is best effort and nothing waits for
 * it. Triggers (app start, foreground, network back, manual) run now; local changes run after a
 * short quiet period. One run at a time; triggers during a run coalesce into one follow-up run.
 * A transient failure is retried with exponential backoff (full jitter); a permanent one is not.
 */
export class SyncScheduler {
  private readonly setTimer: (fn: () => void, ms: number) => unknown;
  private readonly clearTimer: (handle: unknown) => void;
  private readonly debounceMs: number;
  private running = false;
  private again = false;
  private timer: unknown = null;
  private dueAt = Infinity;
  private failures = 0;
  private disposed = false;

  constructor(private readonly deps: SyncSchedulerDeps) {
    this.setTimer = deps.setTimer ?? ((fn, ms) => setTimeout(fn, ms));
    this.clearTimer = deps.clearTimer ?? ((h) => clearTimeout(h as ReturnType<typeof setTimeout>));
    this.debounceMs = deps.debounceMs ?? 5_000;
  }

  /** 'now': run as soon as possible. 'soon': after the quiet period (local change). */
  request(when: 'now' | 'soon' = 'now'): void {
    if (this.disposed) return;
    if (when === 'soon') {
      this.at(this.debounceMs);
      return;
    }
    this.cancelTimer();
    if (this.running) {
      this.again = true;
      return;
    }
    void this.runOnce();
  }

  /** Consecutive transient failures (drives the backoff). */
  get failureCount(): number {
    return this.failures;
  }

  dispose(): void {
    this.disposed = true;
    this.cancelTimer();
  }

  private at(ms: number): void {
    const due = Date.now() + ms;
    // An earlier pending run already covers this request.
    if (this.timer !== null && this.dueAt <= due) return;
    this.cancelTimer();
    this.dueAt = due;
    this.timer = this.setTimer(() => {
      this.timer = null;
      this.dueAt = Infinity;
      this.request('now');
    }, ms);
  }

  private cancelTimer(): void {
    if (this.timer !== null) this.clearTimer(this.timer);
    this.timer = null;
    this.dueAt = Infinity;
  }

  private async runOnce(): Promise<void> {
    this.running = true;
    let result: SyncAttempt | 'skipped';
    try {
      result = await this.deps.run();
    } catch {
      result = { ok: false, transient: true };
    } finally {
      this.running = false;
    }
    if (this.disposed) return;
    if (result !== 'skipped') {
      if (result.ok) {
        this.failures = 0;
      } else if (result.transient) {
        this.failures += 1;
        this.at(Math.max(result.retryInMs ?? 0, backoffDelay(this.failures, this.deps.random)));
      }
    }
    if (this.again) {
      this.again = false;
      this.request('now');
    }
  }
}
