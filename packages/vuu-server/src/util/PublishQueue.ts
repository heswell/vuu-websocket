import type { ViewPortUpdate } from "../viewport/Viewport";

const NO_DATA = [] as const;
const SIZE_KEY = -1;

export abstract class PublishQueue<T> {
  abstract push(entry: T): void;
  abstract pushHighPriority(entry: T): void;
  abstract pop(): T | undefined;
  abstract popUpTo(i: number): T[];
  abstract isEmpty(): boolean;
  public length = 0;
}

/**
 * Updates are merged while they wait to be sent. A newer update for the same
 * viewport row index (or a newer SIZE update for the same viewport) replaces
 * the pending entry in place, so it keeps its queue position, the queue stays
 * bounded by the size of the client's viewports and stale rows are never sent.
 */
export class OutboundRowPublishQueue extends PublishQueue<ViewPortUpdate> {
  private readonly highPriorityQueue: ViewPortUpdate[] = [];
  private readonly queue: ViewPortUpdate[] = [];
  private readonly pending = new Map<object, Map<number, ViewPortUpdate>>();

  push(entry: ViewPortUpdate): void {
    if (!this.merge(entry)) {
      this.queue.push(entry);
      this.length += 1;
    }
  }

  pushHighPriority(entry: ViewPortUpdate): void {
    if (!this.merge(entry)) {
      this.highPriorityQueue.push(entry);
      this.length += 1;
    }
  }

  private merge(entry: ViewPortUpdate) {
    const key = entry.vpUpdate === "SIZE" ? SIZE_KEY : entry.index;
    let pendingForVp = this.pending.get(entry.vp);
    if (pendingForVp === undefined) {
      pendingForVp = new Map();
      this.pending.set(entry.vp, pendingForVp);
    }
    const existing = pendingForVp.get(key);
    if (existing === undefined) {
      pendingForVp.set(key, entry);
      return false;
    }
    existing.vpRequestId = entry.vpRequestId;
    existing.table = entry.table;
    existing.key = entry.key;
    existing.size = entry.size;
    existing.ts = entry.ts;
    existing.row = entry.row;
    return true;
  }

  private release(entries: readonly ViewPortUpdate[]) {
    const pending = this.pending;
    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i];
      const pendingForVp = pending.get(entry.vp);
      if (pendingForVp !== undefined) {
        pendingForVp.delete(entry.vpUpdate === "SIZE" ? SIZE_KEY : entry.index);
        if (pendingForVp.size === 0) pending.delete(entry.vp);
      }
    }
    return entries as ViewPortUpdate[];
  }

  private dequeue(): ViewPortUpdate | undefined;
  private dequeue(i: number): ViewPortUpdate[];
  private dequeue(
    i?: number,
  ): ViewPortUpdate | readonly ViewPortUpdate[] | undefined {
    if (i === undefined) {
      const entry = this.highPriorityQueue.length
        ? this.highPriorityQueue.shift()
        : this.queue.shift();
      if (entry === undefined) {
        throw new Error("OutboundRowPublishQueue is empty.");
      }
      this.length -= 1;
      this.release([entry]);
      return entry;
    }

    const hpCount = this.highPriorityQueue.length;
    let entries: ViewPortUpdate[];
    if (hpCount >= i) {
      entries = this.highPriorityQueue.splice(0, i);
    } else if (hpCount === 0) {
      entries = this.queue.splice(0, i);
    } else if (this.length) {
      entries = this.highPriorityQueue
        .splice(0, hpCount)
        .concat(this.queue.splice(0, i - hpCount));
    } else {
      return NO_DATA;
    }
    this.length -= entries.length;
    return this.release(entries);
  }

  pop(): ViewPortUpdate | undefined {
    return this.dequeue();
  }

  popUpTo(i: number): ViewPortUpdate[] {
    return this.dequeue(i);
  }

  isEmpty(): boolean {
    return this.length === 0;
  }
}
