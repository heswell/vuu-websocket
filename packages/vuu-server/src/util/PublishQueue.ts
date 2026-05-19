import { ViewPortUpdate } from "../viewport/Viewport";

export abstract class PublishQueue<T> {
  abstract push(entry: T): void;
  abstract pushHighPriority(entry: T): void;
  abstract pop(): T | undefined;
  abstract popUpTo(i: number): T[];
  abstract isEmpty(): boolean;
  public length = 0;
}

export class OutboundRowPublishQueue extends PublishQueue<ViewPortUpdate> {
  private readonly highPriorityQueue: ViewPortUpdate[] = [];
  private readonly queue: ViewPortUpdate[] = [];

  push(entry: ViewPortUpdate): void {
    // console.log(
    //   `[OutboundRowPublishQueue] push (queue length : ${this.length})`,
    // );
    this.queue.push(entry);
    this.length += 1;
  }

  pushHighPriority(vpu: ViewPortUpdate): void {
    // console.log(
    //   `[OutboundRowPublishQueue] pushHighPriority, type ${vpu.vpUpdate} (queue length : ${this.length})`,
    // );
    this.highPriorityQueue.push(vpu);
    this.length += 1;
  }

  private dequeue(): ViewPortUpdate | undefined;
  private dequeue(i: number): ViewPortUpdate[];
  private dequeue(i?: number): ViewPortUpdate | ViewPortUpdate[] | undefined {
    // console.log(
    //   `[OutboundRowPublishQueue] dequeue ${i} length = ${this.length})`,
    // );

    if (i === undefined) {
      if (this.highPriorityQueue.length) {
        this.length -= 1;
        return this.highPriorityQueue.shift()!;
      }

      if (this.queue.length) {
        this.length -= 1;
        return this.queue.shift()!;
      }

      throw new Error("OutboundRowPublishQueue is empty.");
    } else if (typeof i === "number") {
      const hpCount = this.highPriorityQueue.length;
      if (hpCount >= i) {
        this.length -= i;
        return this.highPriorityQueue.splice(0, i);
      } else if (hpCount === 0 && this.length >= i) {
        this.length -= i;
        return this.queue.splice(0, i);
      } else if (this.length >= i) {
        this.length -= i;
        return this.highPriorityQueue
          .splice(0, hpCount)
          .concat(this.queue.splice(0, i - hpCount));
      } else if (this.length) {
        return this.highPriorityQueue
          .splice(0, hpCount)
          .concat(this.queue.splice(0, this.queue.length));
      }
    }
  }

  pop(): ViewPortUpdate | undefined {
    return this.dequeue();
  }

  popUpTo(i: number): ViewPortUpdate[] {
    // console.log(
    //   `[OutboundRowPublishQueue] popUpTo ${i} length = ${this.length})`,
    // );
    return this.dequeue(i);
  }

  isEmpty(): boolean {
    return this.length === 0;
  }
}
