# @heswell/vuu-portal

Vuu portal server: a [`@heswell/vuu-server`](../vuu-server) application that
hosts the `MODULE_DISCOVERY` and `NOTIFICATIONS` modules and returns each user's module registry in
the login response. Requires the [Bun](https://bun.sh) runtime to run the
server. The library exports can be imported under Node.js too.

```sh
npm install @heswell/vuu-portal @heswell/vuu-server @heswell/vuu-table
# TypeScript consumers: the vuu-server declarations reference Bun types
npm install -D @types/bun
```

`@heswell/vuu-server` and `@heswell/vuu-table` are peer dependencies, so the
portal shares the application's single copy of each. Two copies would mean two
module registries and failing `instanceof` checks. npm 7+ and bun install
missing peers automatically.

## Entry points

| Import / command | Purpose |
| --- | --- |
| `@heswell/vuu-portal` | Library API. Importing it has no side effects. |
| `@heswell/vuu-portal/main` | `main(options?)`: creates and starts the portal. Importing it has no side effects. |
| `vuu-portal` bin | Starts the portal from a shell. |

```ts
import {
  createModuleRegistry,
  createPortalApplication,
  loadDefaultModules,
  loadModuleAdminRole,
  loadModuleState,
  ModuleDiscoveryModule,
} from "@heswell/vuu-portal";
```

Root exports:

- `createPortalApplication({ config?, configFile? })` creates the portal
  application without starting it.
- `createModuleRegistry` and `moduleClientIdentifier`.
- `ModuleDiscoveryModule`, `loadModuleState`, `loadModuleAdminRole`.
- Module catalogue stores: `ModuleState`, `createModuleState`,
  `YamlModuleStore`, `InMemoryModuleStore`, `loadDefaultModules` and the
  `ModuleStore` type.
- `DEFAULT_MODULE_ADMIN_ROLE`, plus the `PORTAL_DEFAULT_*` fallback ports and
  path.

## Starting the portal

Everything is configured in `application.conf`. With no conf, the portal starts
from the default bundled with the package, for local development. Point it at
your own conf to run the stock entry unchanged:

```sh
# bin
bunx vuu-portal   # bundled default conf
bunx vuu-portal --config ./path/to/application.conf
VUU_CONFIG_FILE=./path/to/application.conf bunx vuu-portal

# from code
import { main } from "@heswell/vuu-portal/main";
await main({ configFile: "./path/to/application.conf" });
```

The conf file is located in this order:

1. `--config <path>` (bin) or `main({ configFile })`. Relative paths resolve
   against the current directory.
2. `$VUU_CONFIG_FILE`.
3. `$VUU_APP`, which selects `packages/$VUU_APP/application.conf` under the
   current directory.
4. `./application.conf`.
5. The conf bundled with the package,
   [`config/application.conf`](./config/application.conf).

The portal logs which conf it used (logger `vuu.portal`).

### The bundled default conf

`config/application.conf` is meant for zero-config local development, and the
portal logs a warning when it is used:

- `vuu.auth.mode="permissive"`: any username and password may log in.
- `vuu.ssl=false`: the websocket is `ws://` and the REST server `http://`. No
  certificate or key is shipped; for TLS set `VUU_SSL=true`, `VUU_CERT_PATH`
  and `VUU_KEY_PATH`. `vuu.ssl=true` without both paths fails at startup.
- Websocket on 8091 (`/websocket-portal`), REST on 8443.
- No Keycloak secret is shipped; set `VUU_KEYCLOAK_CLIENT_SECRET` (and
  `VUU_KEYCLOAK_URL`) with `VUU_AUTH_MODE=keycloak`.
- The seed catalogue, [`config/default-modules.yaml`](./config/default-modules.yaml),
  is empty. The writable `modules.yaml` is kept in the current directory (or at
  `$VUU_PORTAL_MODULES_FILE`), never in the installed package.
  `VUU_PORTAL_MODULES_FILE`, `VUU_PORTAL_DEFAULT_MODULES_FILE`,
  `VUU_CERT_PATH` and `VUU_KEY_PATH` resolve against the current directory.

Every setting has a `VUU_*` override; see the comments in the file, or
`vuu-portal --help`. For anything else, copy it and pass `--config`.

In this repository, `npm run start:portal` starts it with
`VUU_APP=vuu-portal`, which uses [`application.conf`](./application.conf).

### Settings

Any setting can be overridden from the environment with a HOCON-style
`${?VAR}` line in the conf, and the portal's own
[`application.conf`](./application.conf) already does this for the ports,
websocket path, auth mode, CORS origins, Keycloak URL and realm, and module
files (`VUU_HTTPS_PORT`, `VUU_WEBSOCKET_PORT`, `VUU_WEBSOCKET_PATH`,
`VUU_AUTH_MODE`, `VUU_CORS_ALLOWED_ORIGINS` (comma-separated; legacy
`VUU_CORS_ALLOWED_ORIGIN`), `VUU_KEYCLOAK_URL`,
`VUU_KEYCLOAK_REALM`, `VUU_PORTAL_MODULES_FILE`,
`VUU_PORTAL_DEFAULT_MODULES_FILE`, `VUU_LOG_LEVEL`). See the
[`@heswell/service-utils` README](../service-utils/README.md#environment-variable-substitution)
for the syntax.

| Key | Fallback when not set |
| --- | --- |
| `vuu.https.port` | `8443` |
| `vuu.websocket.port` | `8091` |
| `vuu.websocket.path` | `/websocket-portal` |
| `vuu.ssl`, `vuu.certPath`, `vuu.keyPath` | SSL disabled |
| `vuu.auth.*`, `vuu.keycloak.*` | See [`@heswell/vuu-server`](../vuu-server/README.md) |
| `vuu.portal.defaultModulesFile` | `default-modules.yaml` |
| `vuu.portal.modulesFile` | `modules.yaml` |
| `vuu.portal.moduleAdminRole` | `module-admin-access` |
| `vuu.log.level`, `vuu.log.levels.<logger>` | `info` (or `$VUU_LOG_LEVEL`), see [Logging](../service-utils/README.md#logging) |

### Module catalogue

The portal's modules are defined in YAML, not in code. Relative file paths
are resolved against the directory that contains `application.conf`;
absolute paths and `~/` paths are also accepted.

- `vuu.portal.modulesFile` is the runtime state, edited through the module
  admin. If it does not exist, it is created from the default modules file on
  start.
- `vuu.portal.defaultModulesFile` is the seed catalogue. See
  [`default-modules.yaml`](./default-modules.yaml) for the format.

## Workspaces and the Panels palette

`@vuu-ui/*` 4.0.0-alpha.26 adds named workspaces to the portal UI: a
**Workspaces** section in the nav with **+ New workspace**, the
`/workspaces/:id` route, **Reset to default**, and an **Add panel** button that
opens the **Panels** palette (tabs Modules, Tables and Recent) inline beside
the workspace grid. Tables › Browse lists the Vuu servers; each server page is
an unsaved workspace with the Tables palette pinned, which **Save as
workspace** keeps.

This package is the portal *server*. It doesn't render the UI; it supplies the
module records the palette is built from.

### What the server provides

A module record with a `workspace` descriptor is listed in the palette's
Modules tab, grouped by `workspace.paletteGroup`. A module without one isn't.
See [Workspace metadata](../../docs/requirements/vuu-portal-module-discovery.md#workspace-metadata)
for the field. In [`default-modules.yaml`](./default-modules.yaml):

| Module | `workspace` | Why |
| --- | --- | --- |
| `moduleAdmin`, `userAdmin` | `{ paletteGroup: "Admin", defaultSize: { cols: 12, rows: 6 } }` | Standalone pages |
| `basket-trading` | `{ paletteGroup: "Trading", defaultSize: { cols: 12, rows: 8 } }` | Standalone page |
| `vuu-table-browser` | none | It is itself a workspace page; its tables are in the palette's Tables tab |
| `vuu-table-viewer` | none | Nested module; it only works inside the table browser |

A top-level module with a `workspace` descriptor may leave `location` and
`path` empty (or omit them from the YAML) to be offered only in the palette,
with no nav entry or route. It is still sent in `LOGIN_SUCCESS`, with an empty
`navLocation` and `path`. Top-level modules without `workspace` still need
both.

The seed only applies when `modules.yaml` is first created. To change an
existing deployment, edit `modules.yaml` or use the module admin
(`updateModule` with `workspace`, or `workspace: null` to remove a module from
the palette).

### Portal host requirements

The host is the `PortalShell` application, for example finos/vuu
`vuu-ui/portal-examples/portal-host`. See its
`docs/module-federation-architecture.md`. Workspaces are opt in:

```tsx
import {
  AddPanelButton,
  createPortalComponentRegistries,
  PortalShell,
  type PortalWorkspacesOptions,
} from "@vuu-ui/core/portal";

const { renderers, settingsCodecs } = createPortalComponentRegistries();

const workspaces: PortalWorkspacesOptions = {
  componentRenderers: renderers,
  headerActions: <AddPanelButton />,
  settingsCodecs,
};

<PortalShell contextPanel={{ placement: "inline" }} workspaces={workspaces} ...>
```

- `PortalShell` renders the single `GridLayoutProvider` above both the palette
  and the workspace. Don't add another one in the host or in a remote.
- `contextPanel={{ placement: "inline" }}` shows the palette beside the grid
  instead of over it.
- Module Federation must share these as strict singletons
  (`singleton: true, strictVersion: true`) in the host *and* every remote:
  `react`, `react-dom`, `react-router-dom`, `@vuu-ui/core`,
  `@vuu-ui/core/portal`, `@vuu-ui/grid-layout` and
  `@vuu-ui/vuu-notifications`. A second copy of grid-layout breaks dragging
  from the palette into the workspace; a second React or router breaks
  rendering.
- Workspaces are saved by `workspaces.persistenceService`. By default that is
  browser local storage, scoped to the `PortalShell` id and the signed-in
  user. Servers added under Tables › Browse are kept in the per-user portal
  state (`servers/manual`). This server doesn't store either.

To turn workspaces off, leave the `workspaces` prop off `PortalShell`. To
keep workspaces but hide a module from the palette, remove its `workspace`
descriptor.
