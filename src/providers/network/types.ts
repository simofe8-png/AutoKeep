/** Connectivity port (T151): the app works offline; this only tells it when the network is back. */
export interface NetworkMonitor {
  isOnline(): Promise<boolean>;
  /** Subscribes to connectivity changes; returns an unsubscribe function. */
  subscribe(listener: (online: boolean) => void): () => void;
}

/** Test double with a switchable connection. */
export class MemoryNetwork implements NetworkMonitor {
  private listeners = new Set<(online: boolean) => void>();
  constructor(private online = true) {}
  async isOnline() {
    return this.online;
  }
  subscribe(listener: (online: boolean) => void) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }
  set(online: boolean) {
    this.online = online;
    this.listeners.forEach((l) => l(online));
  }
}
