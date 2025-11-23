export class DataGenerator<T> {
  private data: T[];
  private delay: number;

  constructor(data: T[], delay: number = 100) {
    this.data = data;
    this.delay = delay;
  }

  async *[Symbol.asyncIterator](): AsyncGenerator<T, void, unknown> {
    for (const item of this.data) {
      await new Promise((resolve) => setTimeout(resolve, this.delay));
      yield item;
    }
  }
}
