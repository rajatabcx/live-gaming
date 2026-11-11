/**
 * A minimal external store for HUD state: the game loop writes rarely,
 * React reads with useSyncExternalStore(store.subscribe, store.get).
 */
export class Store<T extends object> {
  private listeners = new Set<() => void>();

  constructor(private state: T) {}

  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  };

  get = () => this.state;

  set(patch: Partial<T>) {
    this.state = { ...this.state, ...patch };
    this.listeners.forEach((fn) => fn());
  }

  clear() {
    this.listeners.clear();
  }
}
