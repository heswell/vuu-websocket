import type { RemoteResourceSocket } from "../src/resource-loader";

export class TestRemoteResourceSocket implements RemoteResourceSocket {
  closeCount = 0;
  readonly #closeListeners = new Set<(event: Event) => void>();
  readonly #errorListeners = new Set<(event: Event) => void>();
  readonly #messageListeners = new Set<(event: MessageEvent) => void>();
  readonly #openListeners = new Set<(event: Event) => void>();

  get listenerCount() {
    return (
      this.#closeListeners.size +
      this.#errorListeners.size +
      this.#messageListeners.size +
      this.#openListeners.size
    );
  }

  close() {
    this.closeCount += 1;
  }

  readonly sent: string[] = [];

  send(data: string) {
    this.sent.push(data);
  }

  onClose(listener: (event: Event) => void) {
    this.#closeListeners.add(listener);
    return () => this.#closeListeners.delete(listener);
  }

  onError(listener: (event: Event) => void) {
    this.#errorListeners.add(listener);
    return () => this.#errorListeners.delete(listener);
  }

  onMessage(listener: (event: MessageEvent) => void) {
    this.#messageListeners.add(listener);
    return () => this.#messageListeners.delete(listener);
  }

  onOpen(listener: (event: Event) => void) {
    this.#openListeners.add(listener);
    return () => this.#openListeners.delete(listener);
  }

  emitClose() {
    for (const listener of this.#closeListeners) {
      listener(new Event("close"));
    }
  }

  emitOpen() {
    for (const listener of this.#openListeners) {
      listener(new Event("open"));
    }
  }

  emitMessage(message: unknown) {
    const event = new MessageEvent("message", {
      data: JSON.stringify(message),
    });
    for (const listener of this.#messageListeners) {
      listener(event);
    }
  }

  emitError() {
    for (const listener of this.#errorListeners) {
      listener(new Event("error"));
    }
  }
}
