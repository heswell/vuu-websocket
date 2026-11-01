import { describe, expect, test } from "bun:test";
import {
  distTagFor,
  incrementVersion,
  planRelease,
  type Manifest,
  type ReleaseCandidate,
} from "../vuu-ui-release-plan";

const OLD = "^4.0.0-alpha.26";
const NEW = "^5.0.0-alpha.2";

const manifest = (
  name: string,
  version: string,
  peerDependencies: Record<string, string> = {},
  dependencies: Record<string, string> = {},
): Manifest => ({ name, version, peerDependencies, dependencies });

const candidate = (
  local: Manifest,
  published: Manifest | undefined = local,
): ReleaseCandidate => ({ name: local.name, local, published });

describe("planRelease", () => {
  test("bumps packages whose published @vuu-ui peers reject the target", () => {
    const plan = planRelease(
      [
        candidate(
          manifest("@heswell/table", "1.0.3", { "@vuu-ui/types": NEW }),
          manifest("@heswell/table", "1.0.3", { "@vuu-ui/types": OLD }),
        ),
      ],
      "5.0.0-alpha.2",
      "minor",
    );
    expect(plan[0]).toMatchObject({ action: "bump-and-publish", nextVersion: "1.1.0" });
  });

  test("cascades to dependents and skips unrelated packages", () => {
    const plan = planRelease(
      [
        candidate(
          manifest("@heswell/table", "1.0.3", { "@vuu-ui/types": NEW }),
          manifest("@heswell/table", "1.0.3", { "@vuu-ui/types": OLD }),
        ),
        candidate(manifest("@heswell/server", "4.3.0", {}, { "@heswell/table": "^1.0.3" })),
        candidate(manifest("@heswell/portal", "2.3.0", { "@heswell/table": "^1.0.1" })),
        candidate(manifest("@heswell/admin", "2.3.0")),
      ],
      "5.0.0-alpha.2",
      "major",
    );
    expect(plan.map(({ action, nextVersion }) => [action, nextVersion])).toEqual([
      ["bump-and-publish", "2.0.0"],
      // A dependency range always moves to the new floor.
      ["bump-and-publish", "5.0.0"],
      // ^1.0.1 does not admit 2.0.0, so the peer range must change too.
      ["bump-and-publish", "3.0.0"],
      ["skip", "2.3.0"],
    ]);
  });

  test("leaves a peer range alone when it already admits the new sibling", () => {
    const plan = planRelease(
      [
        candidate(
          manifest("@heswell/table", "1.0.3", { "@vuu-ui/types": NEW }),
          manifest("@heswell/table", "1.0.3", { "@vuu-ui/types": OLD }),
        ),
        candidate(manifest("@heswell/portal", "2.3.0", { "@heswell/table": "^1.0.1" })),
      ],
      "5.0.0-alpha.2",
      "minor",
    );
    expect(plan[1].action).toBe("skip");
  });

  test("publishes an already-bumped local version without bumping again", () => {
    const plan = planRelease(
      [
        {
          name: "@heswell/table",
          local: manifest("@heswell/table", "1.1.0", { "@vuu-ui/types": NEW }),
          published: undefined,
        },
      ],
      "5.0.0-alpha.2",
      "minor",
    );
    expect(plan[0]).toMatchObject({ action: "publish", nextVersion: "1.1.0" });
  });

  test("rejects a workspace that still declares the old @vuu-ui range", () => {
    expect(() =>
      planRelease(
        [candidate(manifest("@heswell/table", "1.0.3", { "@vuu-ui/types": OLD }))],
        "5.0.0-alpha.2",
        "minor",
      ),
    ).toThrow(/still requires @vuu-ui\/types/);
  });
});

test("incrementVersion and distTagFor", () => {
  expect(incrementVersion("1.2.3", "patch")).toBe("1.2.4");
  expect(incrementVersion("1.2.3", "minor")).toBe("1.3.0");
  expect(incrementVersion("1.2.3", "major")).toBe("2.0.0");
  expect(incrementVersion("2.0.0-alpha.4", "major")).toBe("2.0.0-alpha.5");
  expect(distTagFor("2.0.0-alpha.5")).toBe("alpha");
  expect(distTagFor("2.0.0")).toBe("latest");
});
