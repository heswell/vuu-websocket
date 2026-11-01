# @heswell/vuu-module-refdata

Reusable Vuu server module providing reference data tables, populated from
remote data services.

| Table              | Key   | Source service                                   | Resource   |
| ------------------ | ----- | ------------------------------------------------ | ---------- |
| `REFDATA.equities` | `ric` | `@heswell/equity-refdata-service` (default 8084) | `equities` |

## Usage

```ts
import { createVuuServerApplication } from "@heswell/vuu-server";
import { RefDataModule } from "@heswell/vuu-module-refdata";

const application = createVuuServerApplication({
  // ...
  modules: [RefDataModule()],
});
```

Options:

| Option        | Default                                 |
| ------------- | --------------------------------------- |
| `equitiesUrl` | config `services.equities.url`          |
| `namespace`   | `REFDATA`                               |

The equity service may be started before or after the Vuu server. The
table is empty until the service is available, then fills, and is
reconciled after any reconnection.

Start the service with `npm run start:equities` from the repository root.

## Packaging conventions

- The module is a factory function, with options for service URLs and
  namespace, so different applications can assemble it.
- `@heswell/vuu-server` and `@heswell/vuu-table` are peer dependencies.
- Column definitions come from the service's exported schema
  (`@heswell/equity-refdata-service/schema`), so the column contract has a
  single source.
