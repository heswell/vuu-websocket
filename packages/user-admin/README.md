# `@heswell/user-admin`

`@heswell/user-admin` provides a reusable user-administration domain for VUU.
It has three entry points:

| Import | Use |
| --- | --- |
| `@heswell/user-admin` | Server-side VUU feature, providers, and RPC dispatcher. |
| `@heswell/user-admin/contracts` | Browser-safe table schemas, RPC names, and domain types. |
| `@heswell/user-admin/in-memory` | Browser-safe in-memory state and mutation implementation for demos. |

## Client-side VuuModule integration

Use this guide when implementing a client/demo module such as
`packages/vuu-data-test/src/user-admin/UserAdminModule.ts`. Do not import the
package root in browser code: it includes `@heswell/vuu-server`. Import only
`contracts` and, for a local demo, `in-memory`.

### 1. Define the module class

Use the shared table-name type and extend the client-side `VuuModule`, like
`SimulModule` does.

```ts
import type { UserAdminTableName } from "@heswell/user-admin/contracts";
import { VuuModule, type VuuModuleConstructorProps } from "../VuuModule";

export class UserAdminModule extends VuuModule<UserAdminTableName> {
  constructor(props: VuuModuleConstructorProps<UserAdminTableName>) {
    super(props);
  }
}
```

The module name **must** be `USER_ADMIN`. It matches the server module and the
`table.module` value in `USER_ADMIN_TABLE_SCHEMAS`.

### 2. Create schemas and local tables

`USER_ADMIN_TABLE_SCHEMAS` already has the client `TableSchema` shape:
`table`, `key`, and columns with `serverDataType`. Build one client-side
`Table` for each entry, using the normal `vuu-data-test` table helpers.

```ts
import {
  USER_ADMIN_TABLE_SCHEMAS,
  type UserAdminTableName,
} from "@heswell/user-admin/contracts";
import { Table, buildDataColumnMapFromSchema } from "../Table";

const tables = Object.fromEntries(
  Object.entries(USER_ADMIN_TABLE_SCHEMAS).map(([name, schema]) => [
    name,
    new Table(schema, [], buildDataColumnMapFromSchema(schema)),
  ]),
) as Record<UserAdminTableName, Table>;
```

Do not redefine columns, key fields, or the `USER_ADMIN` namespace in the
client. The contract is the single source of truth for both the server
`TableDef`s and client table schemas.

### 3. Use the in-memory store for a demo

For local data, create one store and make it the sole mutation source.

```ts
import { InMemoryUserAdminStore } from "@heswell/user-admin/in-memory";

const store = new InMemoryUserAdminStore(initialSnapshot);
```

Call the matching store operation for a user-admin RPC, then project the new
`await store.snapshot()` into the local tables. Keep this projection in the
client module; `InMemoryUserAdminStore` deliberately does not import or depend
on browser `Table` APIs. A server-backed feature can additionally supply
`refreshSnapshot` to `createUserAdminFeature()` so periodic reconciliation
retrieves a fresh external snapshot rather than reusing the startup snapshot.

| Snapshot collection | Target table |
| --- | --- |
| `users` | `users` |
| `groups` | `groups` |
| `clients` | `clients` |
| `clientRoles` | `roles` |
| `userGroups` | `user_groups` |
| `groupRoles` | `group_roles` |
| `userGroups` joined to `groupRoles` | `user_group_roles` |

Use each table's key field to insert, update, and remove rows. Include the
three standard system columns from the schema:
`vuuCreatedTimestamp`, `vuuUpdatedTimestamp`, and `vuuMsg`.

### 4. Register RPC services

Register client `RpcService` handlers in the `services` record passed to
`UserAdminModule`. The permitted RPC names and named parameters are in
`USER_ADMIN_RPC_CONTRACT`.

Each handler should:

1. Validate that the request is the expected VUU RPC request shape.
2. Read and validate `namedParams` using the shared RPC contract.
3. Call the corresponding `InMemoryUserAdminStore` method.
4. Re-project the updated snapshot into every affected table.
5. Return the normal VUU RPC success or failure response.

For example, `assignUserToGroup` calls `store.addUserToGroup(...)`, then
updates `user_groups`, `users`, and `user_group_roles`. `setUserModuleAccess`
calls `store.setUserModuleAccess(...)`, then updates the same relationship and
summary tables.

Do not make HTTP or identity-provider requests from this client module. The
demo module is purely local. The production client connects to the
`@heswell/vuu-user-admin` WebSocket server, which performs persistence and
publishes the same `USER_ADMIN` tables.

### 5. Instantiate the module

Provide the local tables, shared schemas, and RPC services just as
`simulModule` does.

```ts
export const userAdminModule = new UserAdminModule({
  name: "USER_ADMIN",
  schemas: USER_ADMIN_TABLE_SCHEMAS,
  services,
  tables,
});
```

`VuuModule.createDataSource()` then exposes `TickingArrayDataSource` instances
over these tables. Updating a table through its normal API propagates the
changes to subscribed demo viewports.
