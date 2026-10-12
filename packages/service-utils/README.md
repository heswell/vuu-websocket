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

`ConfigFactory.load(path?)` reads the file once and caches it
(`ConfigFactory.reset()` clears the cache). It uses the first of:

1. the `path` argument, or `$VUU_CONFIG_FILE`. Relative paths resolve against
   the current working directory.
2. `packages/$VUU_APP/application.conf`, when `$VUU_APP` is set.
3. `./application.conf`.
4. the only `packages/*/application.conf`, when there is exactly one.

`config.getPath(key)` resolves a relative value against the directory of the
conf file, not the working directory. Absolute values are rejected.

## Peer dependencies

The declarations reference `@vuu-ui/vuu-protocol-types`, which is a peer
dependency (npm 7+ installs it automatically).
