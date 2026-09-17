# `@heswell/module-admin`

`@heswell/module-admin` is the browser-safe home for reusable VUU module
administration functionality.

| Import | Use |
| --- | --- |
| `@heswell/module-admin` | Default module catalog and module permission helpers. |
| `@heswell/module-admin/contracts` | Focused module-discovery contracts and row projections. |

It exports the default module catalog used by the portal and helpers for
projecting it to `modules` and `modulePermissions` table rows. Server table
wiring and YAML configuration loading deliberately remain portal-specific.

## Publishing

Build all publishable packages with:

```sh
npm run build:packages
```

Build only this package with:

```sh
npm run build:packages -- --package=@heswell/module-admin
```

Bump this package and any workspace dependants with:

```sh
npm run bump:versions -- --package=@heswell/module-admin
```

Publish it from `dist/module-admin` with:

```sh
npm run pub -- --package=@heswell/module-admin
```

Add `--dry-run` to validate the package or `--version-check` to inspect its
version and npm dist-tags.
