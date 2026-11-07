# @heswell/vuu-server-node

Runs [`@heswell/vuu-server`](../vuu-server) (and servers built on it, such as
[`@heswell/vuu-portal`](../../apps/vuu-portal)) on Node.js instead of Bun.

Bun is the primary runtime and needs nothing extra. Use this package where Bun
is not available, for example a corporate desktop that only has Node and an
internal npm mirror. It contains only JavaScript (`ws` and `yaml` are its
only dependencies), so there's no native binary or install script.

```sh
npm install @heswell/vuu-server @heswell/vuu-server-node
```

Requires Node.js 20 or later.

## Usage

Pass the runtime explicitly:

```ts
import { createVuuServerApplication } from "@heswell/vuu-server";
import { nodeRuntime } from "@heswell/vuu-server-node";

const application = createVuuServerApplication({ ...options, runtime: nodeRuntime });
await application.start();
```

or set it once for the process:

```ts
import { setServerRuntime } from "@heswell/vuu-server";
import { nodeRuntime } from "@heswell/vuu-server-node";

setServerRuntime(nodeRuntime);
```

When nothing is set and the process is not running under Bun, the server
loads this package itself if it is installed. So the portal starts on Node
with no code changes:

```sh
npm install @heswell/vuu-portal @heswell/vuu-server-node
node node_modules/@heswell/vuu-portal/bin.js
```

## What it provides

`nodeRuntime` implements the `ServerRuntime` interface from
`@heswell/vuu-server`:

| Bun (`bunRuntime`) | Node (`nodeRuntime`) |
| --- | --- |
| `Bun.serve` (HTTP) | `node:http` / `node:https`, bridged to web `Request`/`Response` |
| `Bun.serve` websocket | `node:http` / `node:https` + `ws` |
| `idleTimeout` | ping every half timeout, close if nothing came back since the previous one |
| `Bun.YAML` | `yaml` |

Both runtimes pass the same contract tests
(`packages/vuu-server/__tests__/runtime/serverRuntimeContract.ts`).
`npm run test:node-runtime` checks the built packages under Node itself.
