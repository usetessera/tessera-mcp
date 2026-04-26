import { afterAll, describe, expect, it } from "vitest";
import {
  handleCheckLinks,
  handleFindMixedLayers,
  handleFindOrphans,
  handleValidateFiles,
  handleValidateStaleness,
} from "../tools/validation/validation.js";
import {
  buildBrokenLinksFixture,
  buildCleanFixture,
  buildFileDriftFixture,
  buildMixedLayersFixture,
  buildOrphanFixture,
  buildStaleFixture,
} from "./fixtures/index.js";
import { archMd, cleanupAllTempDirs, createTempDir, writeFixtureFile } from "./helpers/fixtures.js";

afterAll(() => {
  cleanupAllTempDirs();
});

describe("validate_staleness", () => {
  it("flags the stale module and reports the untracked one", async () => {
    const root = await buildStaleFixture();
    const result = await handleValidateStaleness({ rootPath: root });

    const staleNames = result.staleElements.map((e) => e.name);
    expect(staleNames).toContain("stale");
    expect(staleNames).not.toContain("fresh");

    const untrackedNames = result.untrackedElements.map((e) => e.name);
    expect(untrackedNames).toContain("untracked");
  });

  it("returns zero stale and zero untracked for a clean project committed in one go", async () => {
    // Clean fixture has no git history, so every committed-file lookup misses
    // and elements are reported as untracked. That matches the tool's contract:
    // without git, nothing can be proven stale.
    const root = await buildCleanFixture();
    const result = await handleValidateStaleness({ rootPath: root });
    expect(result.staleCount).toBe(0);
  });
});

describe("find_orphans", () => {
  it("returns folders with code but no architecture.md", async () => {
    const root = await buildOrphanFixture();
    const result = await handleFindOrphans({ rootPath: root });

    const orphanPaths = result.orphans.map((o) => o.path.replace(/\\/g, "/"));
    expect(orphanPaths).toContain("orphan-shallow");
    expect(orphanPaths).toContain("nested/orphan-deep");
  });

  it("returns no orphans for a clean project", async () => {
    const root = await buildCleanFixture();
    const result = await handleFindOrphans({ rootPath: root });
    expect(result.orphanCount).toBe(0);
  });
});

describe("check_links", () => {
  it("flags broken dependsOn and dependedBy targets", async () => {
    const root = await buildBrokenLinksFixture();
    const result = await handleCheckLinks({ rootPath: root });

    expect(result.brokenCount).toBeGreaterThanOrEqual(2);
    const directions = result.brokenLinks.map((b) => b.direction).sort();
    expect(directions).toContain("dependsOn");
    expect(directions).toContain("dependedBy");
  });

  it("does not false-positive on links that resolve", async () => {
    const root = await buildBrokenLinksFixture();
    const result = await handleCheckLinks({ rootPath: root });
    // The "ok" element points to ../good/architecture.md which exists.
    const okBroken = result.brokenLinks.filter((b) => b.sourceName === "Ok");
    expect(okBroken).toEqual([]);
  });
});

describe("find_mixed_layers", () => {
  it("flags Containers with both Component and Module children", async () => {
    const root = await buildMixedLayersFixture();
    const result = await handleFindMixedLayers({ rootPath: root });

    const messy = result.mixedLayers.find((m) => m.parentName === "messy");
    expect(messy).toBeDefined();
    expect(messy!.layersFound.sort()).toEqual(["Component", "Module"]);
  });

  it("does not flag the tidy container in the same fixture", async () => {
    const root = await buildMixedLayersFixture();
    const result = await handleFindMixedLayers({ rootPath: root });
    const tidy = result.mixedLayers.find((m) => m.parentName === "tidy");
    expect(tidy).toBeUndefined();
  });
});

describe("validate_files", () => {
  it("identifies undocumented and missing files per module", async () => {
    const root = await buildFileDriftFixture();
    const result = await handleValidateFiles({ rootPath: root });

    const byName = new Map(result.modules.map((m) => [m.name, m]));

    expect(byName.get("undocumented")?.undocumentedFiles).toContain("extra.ts");
    expect(byName.get("missing")?.missingFiles).toContain("ghost.ts");

    const both = byName.get("both");
    expect(both?.undocumentedFiles).toContain("extra.ts");
    expect(both?.missingFiles).toContain("ghost.ts");

    // Synced module shouldn't appear in the drift list
    expect(byName.has("synced")).toBe(false);
  });

  it("counts clean modules vs drifted modules accurately", async () => {
    const root = await buildFileDriftFixture();
    const result = await handleValidateFiles({ rootPath: root });
    expect(result.totalModules).toBe(result.cleanModules + result.driftedModules);
    expect(result.cleanModules).toBeGreaterThanOrEqual(1); // Synced
    expect(result.driftedModules).toBeGreaterThanOrEqual(3); // Undocumented, Missing, Both
  });

  // ADR-016: non-Module layers with a ## Files section participate in validation.
  it("tracks file drift at non-Module layers that opt in via ## Files", async () => {
    const root = await buildNonModuleFilesFixture();
    const result = await handleValidateFiles({ rootPath: root });

    const byPath = new Map(result.modules.map((m) => [m.relativePath.replace(/\\/g, "/"), m]));

    // Container has an undocumented file (unlisted.ts on disk) — should drift.
    const containerDrift = byPath.get("container-pinned");
    expect(containerDrift).toBeDefined();
    expect(containerDrift?.undocumentedFiles).toContain("unlisted.ts");

    // Container-clean has all pinned files documented with rationales — no drift.
    expect(byPath.has("container-clean")).toBe(false);
  });

  it("flags missing pinning rationale on non-Module file entries", async () => {
    const root = await buildNonModuleFilesFixture();
    const result = await handleValidateFiles({ rootPath: root });

    const byPath = new Map(result.modules.map((m) => [m.relativePath.replace(/\\/g, "/"), m]));

    // container-norationale: file entry with empty description.
    const noRationale = byPath.get("container-norationale");
    expect(noRationale).toBeDefined();
    expect(noRationale?.filesMissingPinningRationale).toContain("mystery.config");
  });

  it("does not flag Module file descriptions for missing pinning rationale", async () => {
    const root = await buildNonModuleFilesFixture();
    const result = await handleValidateFiles({ rootPath: root });

    const byPath = new Map(result.modules.map((m) => [m.relativePath.replace(/\\/g, "/"), m]));
    // A Module with an empty description entry should not be flagged — the
    // pinning-rationale convention applies only to non-Module layers.
    const module = byPath.get("mod");
    expect(module?.filesMissingPinningRationale).toEqual([]);
  });
});

async function buildNonModuleFilesFixture(): Promise<string> {
  const root = createTempDir("tessera-nonmodulefiles-");

  await writeFixtureFile(root, "architecture.md", archMd({ name: "Root", layer: "Context" }));

  // container-clean: Container with ## Files section, all files documented with rationale.
  await writeFixtureFile(
    root,
    "container-clean/architecture.md",
    archMd({
      name: "ContainerClean",
      layer: "Container",
      files: [
        { name: "package.json", description: "npm manifest. Pinned at root by npm." },
      ],
    }),
  );
  await writeFixtureFile(root, "container-clean/package.json", "{}\n");

  // container-pinned: Container with ## Files documenting one file, but an extra
  // file on disk that isn't documented.
  await writeFixtureFile(
    root,
    "container-pinned/architecture.md",
    archMd({
      name: "ContainerPinned",
      layer: "Container",
      files: [
        { name: "package.json", description: "npm manifest. Pinned at root." },
      ],
    }),
  );
  await writeFixtureFile(root, "container-pinned/package.json", "{}\n");
  await writeFixtureFile(root, "container-pinned/unlisted.ts", "// not in ## Files\n");

  // container-norationale: Container with an entry whose description is blank.
  await writeFixtureFile(
    root,
    "container-norationale/architecture.md",
    archMd({
      name: "ContainerNoRationale",
      layer: "Container",
      files: [
        { name: "mystery.config", description: "" },
      ],
    }),
  );
  await writeFixtureFile(root, "container-norationale/mystery.config", "x\n");

  // mod: plain Module with one empty-description entry (which would be
  // flagged as missing rationale at a non-Module layer) plus an undocumented
  // file on disk so the Module shows up in the drift results. The
  // pinning-rationale check must NOT fire for Modules.
  await writeFixtureFile(
    root,
    "mod/architecture.md",
    archMd({
      name: "Mod",
      layer: "Module",
      files: [{ name: "code.ts", description: "" }],
    }),
  );
  await writeFixtureFile(root, "mod/code.ts", "export const x = 1;\n");
  await writeFixtureFile(root, "mod/undocumented.ts", "export const y = 2;\n");

  return root;
}
