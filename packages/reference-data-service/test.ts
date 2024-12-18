console.log("test");

console.time("test1");
console.time("test2");
console.time("test3");

const data = [
  "value 001",
  "value 002",
  "value 003",
  "value 004",
  "value 005",
  "value 006",
  "value 007",
  "value 008",
  "value 009",
  "value 010",
];

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(() => resolve(undefined), ms));

class Sink {
  constructor(private id: string) {}
  start() {
    console.log(`[Sink#${this.id}] start`);
  }
  write(message: string) {
    console.log(`#${this.id} ${JSON.stringify(message)}`);
    return sleep(1);
  }
  close() {
    console.log(`[Sink#${this.id}] close`);
    switch (this.id) {
      case "sink1":
        console.timeEnd("test1");
      case "sink2":
        console.timeEnd("test2");
      case "sink3":
        console.timeEnd("test3");
    }
  }
}

class Source implements UnderlyingDefaultSource {
  private index = 0;
  constructor(private id: string, private data: string[]) {}

  start() {
    console.log(`[Source#${this.id}] start`);
  }
  pull(controller: ReadableStreamDefaultController) {
    if (this.index === this.data.length) {
      controller.enqueue({ count: this.data.length });
      controller.close();
    } else {
      controller.enqueue(this.data[this.index]);
      this.index += 1;
    }
  }
}

const writeStream1 = new WritableStream(new Sink("sink1"), {
  highWaterMark: 3,
});
const readStream1 = new ReadableStream(new Source("source1", data));

const writeStream2 = new WritableStream(new Sink("sink2"), {
  highWaterMark: 3,
});
const readStream2 = new ReadableStream(new Source("source2", data));

const writeStream3 = new WritableStream(new Sink("sink3"), {
  highWaterMark: 3,
});
const readStream3 = new ReadableStream(new Source("source3", data));

readStream1.pipeTo(writeStream1);
setTimeout(() => {
  readStream2.pipeTo(writeStream2);
}, 5);
setTimeout(() => {
  readStream3.pipeTo(writeStream3);
}, 10);
