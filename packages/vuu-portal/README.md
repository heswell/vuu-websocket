# @heswell/vuu-portal

Vuu portal server: a [`@heswell/vuu-server`](../vuu-server) application that
hosts the `MODULE_DISCOVERY` module and returns each user's module registry in
the login response. Requires the [Bun](https://bun.sh) runtime to run the
server. The library exports can be imported under Node.js too.

```sh
npm install @heswell/vuu-portal
# TypeScript consumers: the vuu-server declarations reference Bun types
npm install -D @types/bun
```

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

Everything is configured in `application.conf`. Point the portal at your own
conf and run the stock entry unchanged:

```sh
# bin
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

In this repository, `npm run start:portal` starts it with
`VUU_APP=vuu-portal`, which uses [`application.conf`](./application.conf).

### Settings

Any setting can be overridden from the environment with a HOCON-style
`${?VAR}` line in the conf, and the portal's own
[`application.conf`](./application.conf) already does this for the ports,
websocket path, auth mode, CORS origin, Keycloak URL and realm, and module
files (`VUU_HTTPS_PORT`, `VUU_WEBSOCKET_PORT`, `VUU_WEBSOCKET_PATH`,
`VUU_AUTH_MODE`, `VUU_CORS_ALLOWED_ORIGIN`, `VUU_KEYCLOAK_URL`,
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
