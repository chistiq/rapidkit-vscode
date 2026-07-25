export type WorkspaceGraphProjectionCoalescerStats = {
  received: number;
  emitted: number;
  coalesced: number;
};

export class WorkspaceGraphProjectionCoalescer<T> {
  private pending: T | null = null;
  private hasPending = false;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private disposed = false;
  private readonly statsValue: WorkspaceGraphProjectionCoalescerStats = {
    received: 0,
    emitted: 0,
    coalesced: 0,
  };

  public constructor(
    private readonly emit: (value: T, stats: WorkspaceGraphProjectionCoalescerStats) => void,
    private readonly intervalMs = 80
  ) {}

  public push(value: T): void {
    if (this.disposed) {
      return;
    }
    this.statsValue.received += 1;
    if (this.hasPending) {
      this.statsValue.coalesced += 1;
    }
    this.pending = value;
    this.hasPending = true;
    if (!this.timer) {
      this.timer = setTimeout(() => this.flush(), this.intervalMs);
    }
  }

  public flush(): void {
    if (this.timer) {
      clearTimeout(this.timer);
    }
    this.timer = null;
    const pending = this.pending;
    this.pending = null;
    const hadPending = this.hasPending;
    this.hasPending = false;
    if (!hadPending || this.disposed) {
      return;
    }
    this.statsValue.emitted += 1;
    this.emit(pending as T, this.stats());
  }

  public clear(): void {
    if (this.timer) {
      clearTimeout(this.timer);
    }
    this.timer = null;
    this.pending = null;
    this.hasPending = false;
  }

  public dispose(): void {
    this.clear();
    this.disposed = true;
  }

  public stats(): WorkspaceGraphProjectionCoalescerStats {
    return { ...this.statsValue };
  }
}
