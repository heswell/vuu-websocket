export class DataGenerator {
  constructor(
    private data: string[],
    private withDelay = true,
  ) {
    this.data = data;
  }

  async *[Symbol.asyncIterator](): AsyncGenerator {
    for (const item of this.data) {
      try {
        const { data, delay } = JSON.parse(item);
        if (this.withDelay && delay > 0) {
          await new Promise((resolve) => setTimeout(resolve, delay));
        }
        yield data;
      } catch (e) {
        console.log(`<<ERROR>> error parsing ${item}`);
      }
    }
  }
}
