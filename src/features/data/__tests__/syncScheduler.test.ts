import { BASE_DELAY_MS } from '@/sync/engine';

import type { SyncAttempt } from '../localStore';
import { SyncScheduler } from '../syncScheduler';

/** P2A (Y4): sync triggers, coalescing, debounce and backoff — with a controllable clock. */

function harness(results: (SyncAttempt | 'skipped')[]) {
  const timers: { fn: () => void; ms: number; id: number }[] = [];
  let next = 1;
  let calls = 0;
  let release: (() => void) | null = null;
  let hold = false;
  const scheduler = new SyncScheduler({
    run: async () => {
      calls++;
      if (hold) await new Promise<void>((r) => (release = r));
      return results.shift() ?? { ok: true };
    },
    setTimer: (fn, ms) => {
      const t = { fn, ms, id: next++ };
      timers.push(t);
      return t.id;
    },
    clearTimer: (id) => {
      const i = timers.findIndex((t) => t.id === id);
      if (i >= 0) timers.splice(i, 1);
    },
    debounceMs: 5000,
    random: () => 1,
  });
  const fire = async () => {
    const t = timers.shift();
    t?.fn();
    await flush();
  };
  const flush = () => new Promise((r) => setTimeout(r, 0));
  return {
    scheduler,
    timers,
    fire,
    flush,
    calls: () => calls,
    holdRuns: () => (hold = true),
    releaseRun: async () => {
      hold = false;
      release?.();
      await flush();
    },
  };
}

it('a trigger runs a sync immediately; success leaves nothing scheduled', async () => {
  const h = harness([{ ok: true }]);
  h.scheduler.request('now');
  await h.flush();
  expect(h.calls()).toBe(1);
  expect(h.timers).toHaveLength(0);
});

it('local changes are debounced into one sync after the quiet period', async () => {
  const h = harness([]);
  h.scheduler.request('soon');
  h.scheduler.request('soon');
  h.scheduler.request('soon');
  expect(h.calls()).toBe(0);
  expect(h.timers).toHaveLength(1);
  expect(h.timers[0].ms).toBe(5000);
  await h.fire();
  expect(h.calls()).toBe(1);
});

it('transient failures are retried with growing backoff; success resets it', async () => {
  const h = harness([
    { ok: false, transient: true },
    { ok: false, transient: true },
    { ok: false, transient: true },
    { ok: true },
  ]);
  h.scheduler.request('now');
  await h.flush();
  const delays: number[] = [];
  for (let i = 0; i < 3; i++) {
    expect(h.timers).toHaveLength(1);
    delays.push(h.timers[0].ms);
    await h.fire();
  }
  expect(h.calls()).toBe(4);
  expect(delays).toEqual([BASE_DELAY_MS, BASE_DELAY_MS * 2, BASE_DELAY_MS * 4]);
  expect(h.scheduler.failureCount).toBe(0);
  expect(h.timers).toHaveLength(0);
});

it('a permanent failure is not retried automatically', async () => {
  const h = harness([{ ok: false, transient: false }]);
  h.scheduler.request('now');
  await h.flush();
  expect(h.timers).toHaveLength(0);
});

it('a skipped run (offline, signed out) schedules nothing: the next trigger will run', async () => {
  const h = harness(['skipped']);
  h.scheduler.request('now');
  await h.flush();
  expect(h.timers).toHaveLength(0);
  expect(h.scheduler.failureCount).toBe(0);
});

it('triggers during a run coalesce into exactly one follow-up run', async () => {
  const h = harness([{ ok: true }, { ok: true }]);
  h.holdRuns();
  h.scheduler.request('now');
  await h.flush();
  h.scheduler.request('now');
  h.scheduler.request('now');
  expect(h.calls()).toBe(1);
  await h.releaseRun();
  await h.releaseRun();
  expect(h.calls()).toBe(2);
});

it('a manual trigger replaces a pending backoff retry', async () => {
  const h = harness([{ ok: false, transient: true }, { ok: true }]);
  h.scheduler.request('now');
  await h.flush();
  expect(h.timers).toHaveLength(1);
  h.scheduler.request('now');
  await h.flush();
  expect(h.calls()).toBe(2);
  expect(h.timers).toHaveLength(0);
});

it('after dispose nothing runs', async () => {
  const h = harness([]);
  h.scheduler.request('soon');
  h.scheduler.dispose();
  expect(h.timers).toHaveLength(0);
  h.scheduler.request('now');
  await h.flush();
  expect(h.calls()).toBe(0);
});
