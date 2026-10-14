// Run in a subprocess by sideEffects.test.ts: imports an entry point and
// reports what it registered and which timers are still active. The process
// must then exit by itself.
import { GlobalRegistrator } from "@happy-dom/global-registrator";

GlobalRegistrator.register();

const [, , entryName, ...flags] = process.argv;
const activeTimers = new Set<unknown>();
const track = <T extends (...args: never[]) => unknown>(
  set: T,
  clear: (id: unknown) => void,
  repeating: boolean,
) => {
  const g = globalThis as Record<string, unknown>;
  const setName = repeating ? "setInterval" : "setTimeout";
  const clearName = repeating ? "clearInterval" : "clearTimeout";
  g[setName] = (...args: Parameters<T>) => {
    const id = set(...args);
    activeTimers.add(id);
    if (!repeating) {
      // one-shot timers fire and are done; give them a chance to finish
      const [callback, ...rest] = args as unknown as [
        (...a: unknown[]) => void,
        ...unknown[],
      ];
      clear(id);
      activeTimers.delete(id);
      const wrapped = set(
        ...([
          (...a: unknown[]) => {
            activeTimers.delete(wrapped);
            callback(...a);
          },
          ...rest,
        ] as unknown as Parameters<T>),
      );
      activeTimers.add(wrapped);
      return wrapped;
    }
    return id;
  };
  g[clearName] = (id: unknown) => {
    activeTimers.delete(id);
    clear(id);
  };
};
track(setInterval, clearInterval as (id: unknown) => void, true);
track(setTimeout, clearTimeout as (id: unknown) => void, false);

const entry = entryName === "legacy" ? "../../src/legacy" : "../../src/index";
const pkg = await import(entry);
const engine = pkg.getDefaultEngine();
// let any one-shot timers scheduled by imported code settle
await new Promise((resolve) => setTimeout(resolve, 100));
const report: Record<string, unknown> = {
  exports: Object.keys(pkg).filter(
    (name) => typeof pkg[name] === "object" && name.endsWith("Module"),
  ),
  modules: engine.moduleNames,
  tables: engine.tableContainer.tables.length,
  timersAfterImport: activeTimers.size,
};
if (flags.includes("subscribe")) {
  // a demo data source starts SIMUL's ticking prices
  pkg.simulModule.createDataSource("prices");
  report.timersAfterSubscribe = activeTimers.size;
}
if (flags.includes("dispose")) {
  pkg.resetDefaultEngine();
  report.timersAfterDispose = activeTimers.size;
}
await GlobalRegistrator.unregister();
console.log(JSON.stringify(report));
