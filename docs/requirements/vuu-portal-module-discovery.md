# Requirement: portal module discovery

The portal server owns remote-module discovery. It registers a
`MODULE_DISCOVERY` VUU module with editable `modules` and `modulePermissions`
tables and derives a user-specific registry during WebSocket login.

The registry is serialized only on portal `LOGIN_SUCCESS` messages:

```ts
type LoginSuccess = {
  type: "LOGIN_SUCCESS";
  vuuServerId: string;
  moduleRegistry?: { modules: ModuleRecord[] };
};
```

Other VUU servers omit `moduleRegistry`. The former authenticated
`GET /module-registry` browser endpoint does not exist.

Each record contains module-federation metadata and matches the UI's
`VuuModuleDescriptor` (`@vuu-ui/vuu-protocol-types`). Records carry no VUU
connection details; clients discover a module's VUU connection through a
separate mechanism:

```ts
type ModuleRecord = {
  clientIdentifier: string;
  accessRole: string;
  id: number;
  name: string;
  title: string;
  description: string;
  version: number;
  enabled: boolean;
  navLocation: string;
  navIconName?: string;
  navIconUrl?: string;
  navOrder?: number;
  navBadge?: string;
  notificationTopics?: string[];
  workspace?: {
    paletteGroup: string;
    iconUrl?: string;
    defaultSize?: { cols?: number; rows?: number };
  };
  path: string;
  mfComponent: string;
  mfScope: string;
  mfUrl: string;
};
```

Only enabled records permitted by the authenticated user's roles are returned.
For duplicate names, the highest version wins, followed by the highest id.
Records are sorted by `navOrder` (lowest first), then records without one,
with ties broken by `name`. Records without `navOrder` therefore keep the
previous name order.

`navLocation` is the module table's `location` column. `navIconUrl` (an SVG
data URL) comes from the optional `navIconUrl` column and is omitted when
empty.

The optional nav metadata used by the portal nav is omitted when unset:

| Field | Meaning | `modules` table column |
| --- | --- | --- |
| `navOrder` | Sort order within a nav section; a finite number | `navOrder` (`double`), empty when unset |
| `navBadge` | Opaque badge-source key, e.g. `orders.working`, mapped to a live value by the client | `navBadge` (`string`), `""` when unset |
| `notificationTopics` | Notification topics the module claims, e.g. `["orders", "fills"]`; routes notifications whose `topic` matches | `notificationTopics` (`string`), comma-separated, `""` when unset |

The VUU table has no array column type, so `notificationTopics` is stored as a
comma-separated string and split back into `string[]` for the registry. Topics
must be non-empty and may not contain commas. In `modules.yaml` and
`default-modules.yaml` all three are optional keys, with `notificationTopics`
written as a YAML list. Module admin `updateModule` changes may set any of them
to `null` to clear it.

### Workspace metadata

The optional `workspace` field marks a module that can be placed in a
GridLayout workspace. The portal lists such modules in its right-hand
**Panels** palette, grouped by `workspace.paletteGroup`. A module without
`workspace` is not in the palette. This is independent of `navLocation`, which
is empty both for palette-only modules and for nested modules that only work
inside their parent (such as the table viewer); those nested modules simply
omit `workspace`.

A top-level module normally needs a menu `location` (`/Section/Label`) and a
route `path`. With `workspace` metadata, both may be empty: the module is
palette-only, with no nav entry or route. In `modules.yaml` and
`default-modules.yaml` the keys may then be omitted (they load as `""`). It is
still returned in `LOGIN_SUCCESS`, with its `workspace`, an empty
`navLocation` and an empty `path`; clients skip it when building nav and
routes. If `location` is set, `path` is still required. Without `workspace`, a
top-level module without them is rejected (`location: Menu location is
required`, `path: Route is required`), including by `updateModule` when
`workspace: null` would leave a palette-only module without a nav entry.

| Field | Meaning |
| --- | --- |
| `paletteGroup` | Required, non-empty. Palette group heading, e.g. `Trading` |
| `iconUrl` | Optional palette icon: an image data URL or an http(s) URL. Clients fall back to `navIconUrl` |
| `defaultSize.cols`, `defaultSize.rows` | Optional default size in grid tracks; positive integers |

Unknown keys, in `workspace` or `defaultSize`, are rejected. Validation
errors are reported against the `workspace` field, for example
`workspace: Workspace palette group is required` or
`workspace: Workspace default size cols must be a positive integer`.

The VUU table has no object column type, so `workspace` is stored in the
`modules` table's `workspace` (`string`) column as JSON, `""` when unset, and
parsed back into an object for the registry. A row whose value can't be
parsed or is invalid is served without `workspace`. In `modules.yaml` and
`default-modules.yaml`, `workspace` is an optional YAML mapping. Module admin
`createModule` accepts it inside `module`; `updateModule` replaces the whole
object (it is not merged) and `null` clears it.

`mfScope` must equal the remote's module-federation name (for example
`userAdmin`), or the UI cannot load it. `accessRole` is the
role that granted access. `clientIdentifier` is the module's own client,
derived from its name (`userAdmin` -> `vuu-user-admin`; names that already
start with `vuu-` are unchanged). The UI keys each module's saved state by it.

A module with a non-zero parent module id is a nested module. It is listed
alongside the other records with an empty `navLocation`, so it has no
navigation entry and is rendered from within another module. It is returned
only when both it and its parent are authorized.
