import { describe, it, expect, afterAll } from "vitest";
import { join } from "node:path";
import {
  createTempDir,
  cleanupAllTempDirs,
  writeFixtureFile,
  initGitRepo,
  commitAll,
  archMd,
} from "../../tests/helpers/fixtures.js";
import { computeDriftFooter } from "./drift.js";

afterAll(() => cleanupAllTempDirs());

describe("computeDriftFooter", () => {
  it("returns null when the scope is empty and the tree is clean", async () => {
    const root = await cleanRepo();
    const footer = await computeDriftFooter({ rootPath: root });
    expect(footer).toBeNull();
  });

  it("flags undocumented files under an explicit elementPath scope", async () => {
    const root = await cleanRepo();
    // Add a new undocumented file AFTER the clean commit. Not yet committed —
    // so it is git-dirty AND under the module's scope either way.
    await writeFixtureFile(root, "plugin/audio/newfile.js", "export const x = 1;");

    const footer = await computeDriftFooter({
      rootPath: root,
      elementPath: "plugin/audio",
    });
    expect(footer).not.toBeNull();
    expect(footer).toContain("plugin/audio");
    expect(footer).toContain("newfile.js");
    expect(footer).toContain("undocumented");
  });

  it("scopes drift to git-dirty elements when no explicit elementPath is given", async () => {
    const root = await cleanRepo();
    // Dirty one element, leave another element drifted but not git-dirty.
    await writeFixtureFile(root, "plugin/audio/dirty.js", "export const y = 2;");
    // Pre-existing drift in another element — already there at commit time,
    // so it is NOT git-dirty. It should be out of scope.
    const footer = await computeDriftFooter({ rootPath: root });
    expect(footer).not.toBeNull();
    expect(footer).toContain("plugin/audio");
    expect(footer).toContain("dirty.js");
    // Pre-existing drift should NOT surface here because it isn't git-dirty
    // and the caller didn't target it explicitly.
    expect(footer).not.toContain("plugin/ui");
  });

  it("returns null when suppress_drift_warnings is set in config", async () => {
    const root = await cleanRepo({ suppress: true });
    await writeFixtureFile(root, "plugin/audio/newfile.js", "export const x = 1;");
    const footer = await computeDriftFooter({
      rootPath: root,
      elementPath: "plugin/audio",
    });
    expect(footer).toBeNull();
  });

  it("reports non-Module files missing a pinning rationale (ADR-016)", async () => {
    const root = createTempDir();
    await writeFixtureFile(root, "architecture.md", archMd({ name: "Root", layer: "Context" }));
    await writeFixtureFile(
      root,
      "svc/architecture.md",
      archMd({
        name: "svc",
        layer: "Container",
        files: [{ name: "package.json", description: "" }],
      }),
    );
    await writeFixtureFile(root, "svc/package.json", "{}\n");
    await initGitRepo(root);
    await commitAll(root, "initial", "2026-04-19T00:00:00Z");
    // Dirty the svc container so it enters scope.
    await writeFixtureFile(root, "svc/note.txt", "touch");

    const footer = await computeDriftFooter({ rootPath: root });
    expect(footer).not.toBeNull();
    expect(footer).toContain("pinned file");
    expect(footer).toContain("package.json");
    expect(footer).toMatch(/rationale/i);
  });

  it("reports broken dependency links for in-scope sources", async () => {
    const root = createTempDir();
    await writeFixtureFile(root, "architecture.md", archMd({ name: "Root", layer: "Context" }));
    await writeFixtureFile(
      root,
      "svc/architecture.md",
      archMd({ name: "svc", layer: "Container", dependsOn: ["../missing"] }),
    );
    await initGitRepo(root);
    await commitAll(root, "initial", "2026-04-19T00:00:00Z");
    // Dirty the svc element so it enters scope.
    await writeFixtureFile(root, "svc/file.ts", "export const z = 1;");

    const footer = await computeDriftFooter({ rootPath: root });
    expect(footer).not.toBeNull();
    expect(footer).toMatch(/broken dependsOn/);
    expect(footer).toContain("svc");
  });
});

/**
 * Builds a small repo with two modules, commits a clean snapshot so git
 * has a baseline, then returns the path. The `plugin/audio` module has a
 * documented file; `plugin/ui` has a silent file drift injected pre-commit
 * so tests can verify scope filtering (that drift is present in the tree
 * but out of scope when not git-dirty and not targeted).
 */
async function cleanRepo(opts: { suppress?: boolean } = {}): Promise<string> {
  const root = createTempDir();

  await writeFixtureFile(root, "architecture.md", archMd({ name: "Root", layer: "Context" }));
  await writeFixtureFile(
    root,
    "plugin/architecture.md",
    archMd({ name: "plugin", layer: "Container" }),
  );
  await writeFixtureFile(
    root,
    "plugin/audio/architecture.md",
    archMd({
      name: "audio",
      layer: "Module",
      files: [{ name: "existing.js", description: "Documented file" }],
    }),
  );
  await writeFixtureFile(root, "plugin/audio/existing.js", "export const a = 1;");

  // plugin/ui — pre-existing file drift that is NOT git-dirty after the
  // initial commit. Used to verify that out-of-scope drift is silent.
  await writeFixtureFile(
    root,
    "plugin/ui/architecture.md",
    archMd({ name: "ui", layer: "Module" }),
  );
  await writeFixtureFile(root, "plugin/ui/silent.js", "export const b = 2;");

  if (opts.suppress) {
    await writeFixtureFile(
      root,
      ".tessera/config.yaml",
      "suppress_drift_warnings: true\n",
    );
  }

  await initGitRepo(root);
  await commitAll(root, "initial", "2026-04-19T00:00:00Z");
  return root;
}
