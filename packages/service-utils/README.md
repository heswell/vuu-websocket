# @heswell/service-utils

Shared utilities for Vuu services and for `@heswell/vuu-server`:

- `ConfigFactory` / `Config` load an `application.conf` (`key = value` lines)
  and give typed access to settings.
- `parseArgs` for service command lines.
- Remote table publishing and subscription: `TablePublisher`,
  `RemoteTableSubscription`, `DataService`, `RateGenerator` and the protocol
  types they share.
- `loadTableFromRemoteResource` and the socket factory types it uses.
- `Clock`, `accurateTimer` and random-value helpers for simulated data.

```sh
npm install @heswell/service-utils
```

The package is ESM only and has no import-time side effects. Some helpers
(`parseArgs`, the remote socket factory) use Bun APIs when called, so run
services that use them under [Bun](https://bun.sh).

## Configuration lookup

`ConfigFactory.load(path?, options?)` reads the file once and caches it
(`ConfigFactory.reset()` clears the cache). It uses the first of:

1. the `path` argument, or `$VUU_CONFIG_FILE`. Relative paths resolve against
   the current working directory.
2. `packages/$VUU_APP/application.conf`, when `$VUU_APP` is set.
3. `./application.conf`.
4. the only `packages/*/application.conf`, when there is exactly one.

Later calls to `load()` return the cached config. Calling it again with a
different `path` or different `overrides` throws, because those arguments
could not take effect; call `ConfigFactory.reset()` first.

`ConfigFactory.fromFile(path, options?)` reads a conf without caching it, for
components that each have their own conf in one process (the data services
use it, so they can be started together in tests).

## File format

One `key=value` per line. Blank lines and lines starting with `#` or `//` are
ignored, and an inline ` # ...` or ` // ...` comment is stripped. A key that
appears more than once takes its last value.

Unquoted values are parsed as `true`/`false`, a number, or else a string.
Quoted values (`"..."` or `'...'`) are always strings.

## Environment variable substitution

Values support HOCON-style substitutions:

| Syntax | When the variable is set | When it is not set |
| --- | --- | --- |
| `${VAR}` | its value | `load()` throws, naming the key and the variable |
| `${?VAR}` | its value | the line is ignored, so an earlier value for the key stands |

The usual pattern is a default followed by an optional override:

```properties
vuu.https.port=8443
vuu.https.port=${?VUU_HTTPS_PORT}
```

- A value that is only a substitution is parsed like a literal, so
  `VUU_HTTPS_PORT=9443` gives the number `9443`.
- Substitutions can be concatenated with unquoted text and quoted strings:
  `url=https://${HOST}:8443` or `url="https://"${HOST}"/realms"`. The result
  is type-parsed unless it contains a quoted part, in which case it is a
  string. An unset `${?VAR}` inside a concatenation contributes an empty
  string.
- As in HOCON, substitutions are not expanded inside quotes: `"${HOST}"` is
  the literal text `${HOST}`.
- Variables are read from `process.env`, or from `options.env` if given.

The shipped `application.conf` files use `${?VUU_...}` overrides for the
settings that most often change per environment:

| Key | Environment variable |
| --- | --- |
| `vuu.https.port` | `VUU_HTTPS_PORT` |
| `vuu.websocket.port` | `VUU_WEBSOCKET_PORT` |
| `vuu.websocket.path` | `VUU_WEBSOCKET_PATH` |
| `vuu.auth.mode` | `VUU_AUTH_MODE` |
| `vuu.auth.cors.allowedOrigin` | `VUU_CORS_ALLOWED_ORIGIN` |
| `vuu.keycloak.url` | `VUU_KEYCLOAK_URL` |
| `vuu.keycloak.realm` | `VUU_KEYCLOAK_REALM` |
| `vuu.portal.defaultModulesFile` | `VUU_PORTAL_DEFAULT_MODULES_FILE` |
| `vuu.portal.modulesFile` | `VUU_PORTAL_MODULES_FILE` |
| `service.port` (data services) | `VUU_SERVICE_PORT` |
| `services.<name>.url` | `VUU_SERVICES_<NAME>_URL` |

Each server reads the same names, so set them per process rather than
exporting them for a whole stack.

## Programmatic overrides

```ts
ConfigFactory.load("./application.conf", {
  overrides: { "vuu.https.port": 9443, "vuu.websocket.port": 9091 },
});
```

Overrides win over the file, including its substitutions. Values are used as
given (they are not parsed).

## Paths

`config.getPath(key)`:

- returns an absolute value unchanged;
- expands a leading `~/` (or a bare `~`) to the home directory;
- resolves any other relative value against the directory of the conf file,
  not the working directory.

## Peer dependencies

The declarations reference `@vuu-ui/vuu-protocol-types`, which is a peer
dependency (npm 7+ installs it automatically).
