/**
 * React bindings for the local engine. Kept out of the main entry because
 * `@vuu-ui/core` (via `@vuu-ui/vuu-ui-controls`) needs a DOM at import time
 * (`ResizeObserver`); the main entry runs in plain Node/Bun.
 */
export * from "./local-datasource-provider/LocalDatasourceProvider";
export { createDataSourceProvider } from "./local-datasource-provider/createDataSourceProvider";
