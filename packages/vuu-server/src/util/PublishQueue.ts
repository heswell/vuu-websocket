import { ViewPortUpdate } from "../viewport/Viewport";

export abstract class PublishQueue<T> {
  abstract push(entry: T): void;
  abstract pushHighPriority(entry: T): void;
  abstract pop(): T;
  abstract popUpTo(): T;
  abstract isEmpty(): boolean;
  public length = 0;
}

export class OutboundRowPublishQueue extends PublishQueue<ViewPortUpdate> {
  private readonly highPriorityQueue: ViewPortUpdate[] = [];
  private readonly queue: ViewPortUpdate[] = [];

  push(entry: ViewPortUpdate): void {
    this.queue.push(entry);
    this.length += 1;
  }

  pushHighPriority(entry: ViewPortUpdate): void {
    this.highPriorityQueue.push(entry);
    this.length += 1;
  }

  private dequeue(): ViewPortUpdate {
    if (this.highPriorityQueue.length) {
      this.length -= 1;
      return this.highPriorityQueue.shift()!;
    }

    if (this.queue.length) {
      this.length -= 1;
      return this.queue.shift()!;
    }

    throw new Error("OutboundRowPublishQueue is empty.");
  }

  pop(): ViewPortUpdate {
    return this.dequeue();
  }

  popUpTo(): ViewPortUpdate {
    return this.dequeue();
  }

  isEmpty(): boolean {
    return this.length === 0;
  }
}
