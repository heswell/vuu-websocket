export class DataGenerator {
  private data: string[];

  constructor(data: string[]) {
    this.data = data;
  }

  async *[Symbol.asyncIterator](): AsyncGenerator {
    for (const item of this.data) {
      const { data, delay } = JSON.parse(item);
      if (delay > 0) {
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
      yield data;
    }
  }
}
