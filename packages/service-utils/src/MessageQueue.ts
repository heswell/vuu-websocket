import { ResourceMessage } from "./ArrayDataStreamSource";

export interface IMessageQueue<T extends object> {
  push(message: T): void;
}

const EMPTY_ARRAY = [] as const;

export interface IDequeue<T extends object> {
  dequeueAllMessages: () => T[];
  hasUpdates: boolean;
}

/**
 * Manages a queue of messages of type T
 */
export class MessageQueue<T extends object>
  implements IMessageQueue<T>, IDequeue<T>
{
  #queue: T[];

  constructor() {
    this.#queue = [];
  }

  get length() {
    return this.#queue.length;
  }
  set length(val) {
    this.#queue.length = val;
  }
  dequeueAllMessages() {
    const q = this.#queue.slice();
    this.#queue.length = 0;
    return q;
  }

  push(message: T) {
    this.#queue.push(message);
  }

  extract(test: (message: T) => boolean) {
    if (this.hasUpdates) {
      return EMPTY_ARRAY;
    } else {
      return extractMessages<T>(this.#queue, test);
    }
  }

  extractAll() {
    const messages = this.#queue.slice();
    this.#queue.length = 0;
    return messages;
  }

  get hasUpdates() {
    return this.#queue.length > 0;
  }
}

function extractMessages<T extends object>(
  queue: T[],
  test: (message: T) => boolean
) {
  var extract = [];

  for (var i = queue.length - 1; i >= 0; i--) {
    if (test(queue[i])) {
      extract.push(queue.splice(i, 1)[0]);
    }
  }

  extract.reverse();
  return extract;
}
