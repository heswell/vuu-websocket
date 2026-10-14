// Run in a plain bun subprocess by noDom.test.ts: no happy-dom, no browser
// globals. Importing the main entry and using an engine must not need a DOM.
const domGlobals = ["window", "document", "ResizeObserver", "HTMLElement"];
const present = domGlobals.filter((name) => name in globalThis);
if (present.length > 0) {
  throw Error(`DOM globals present before import: ${present.join(", ")}`);
}
const pkg = await import("../../src/index");
const engine = pkg.createLocalEngine({
  modules: [new pkg.SimulModule()],
});
const tables = engine.getTableList().length;
engine.dispose();
console.log(
  JSON.stringify({
    reactExports: [
      "createDataSourceProvider",
      "createLocalVuuServer",
      "LocalDataSourceProvider",
    ].filter((name) => name in pkg),
    tables,
  }),
);
