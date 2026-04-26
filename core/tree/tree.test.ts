import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdir, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { buildArchitectureTree, getElementByPath, flattenTree } from "./tree.js";
import type { ConfigFile } from "../../shared/types/types.js";

const TEST_DIR = join(tmpdir(), `tessera-tree-test-${Date.now()}`);
const DEFAULT_CONFIG: ConfigFile = { ignore: ["node_modules", ".git", "dist"] };

async function createFile(relativePath: string, content: string) {
  const fullPath = join(TEST_DIR, relativePath);
  const { dirname } = await import("node:path");
  await mkdir(dirname(fullPath), { recursive: true });
  await writeFile(fullPath, content, "utf-8");
}

async function createDir(relativePath: string) {
  await mkdir(join(TEST_DIR, relativePath), { recursive: true });
}

beforeEach(async () => {
  await mkdir(TEST_DIR, { recursive: true });
});

afterEach(async () => {
  await rm(TEST_DIR, { recursive: true, force: true });
});

describe("buildArchitectureTree", () => {
  it("builds a tree with root Context element", async () => {
    await createFile("architecture.md", `# TestProject\n\n## Overview\nRoot element.\n\n## Metadata\n- **Layer**: Context\n- **Tags**: []\n- **Owner**: @test\n- **Status**: Active\n`);

    const tree = await buildArchitectureTree(TEST_DIR, DEFAULT_CONFIG);
    expect(tree.root.layer).toBe("Context");
    expect(tree.root.overview).toBe("Root element.");
  });

  it("infers Module layer for leaf folders", async () => {
    await createFile("architecture.md", `# Root\n\n## Overview\nRoot.\n\n## Metadata\n- **Layer**: Context\n- **Tags**: []\n- **Status**: Active\n`);
    await createFile("api/architecture.md", `# API\n\n## Overview\nAPI container.\n\n## Metadata\n- **Layer**: Container\n- **Tags**: [api]\n- **Status**: Active\n`);
    await createFile("api/handler/architecture.md", `# Handler\n\n## Overview\nHandles requests.\n\n## Metadata\n- **Layer**: Module\n- **Tags**: [handler]\n- **Status**: Active\n`);
    await createFile("api/handler/handler.ts", "export function handle() {}");

    const tree = await buildArchitectureTree(TEST_DIR, DEFAULT_CONFIG);
    const flat = flattenTree(tree);
    const handler = flat.find((e) => e.name === "handler");
    expect(handler).toBeDefined();
    expect(handler!.layer).toBe("Module");
  });

  it("promotes children through pass-through folders", async () => {
    // Root -> svc (has arch) -> src (no architecture.md) -> core (has architecture.md)
    // core should be promoted to be a direct child of svc (promoted through src)
    // Pass-through only works at depth > 0 (root always treats subdirs as elements)
    await createFile("architecture.md", `# Root\n\n## Overview\nRoot.\n\n## Metadata\n- **Layer**: Context\n- **Tags**: []\n- **Status**: Active\n`);
    await createFile("svc/architecture.md", `# Svc\n\n## Overview\nService.\n\n## Metadata\n- **Layer**: Container\n- **Tags**: []\n- **Status**: Active\n`);
    await createDir("svc/src");
    // svc/src has NO architecture.md — it's a pass-through
    await createFile("svc/src/core/architecture.md", `# Core\n\n## Overview\nCore logic.\n\n## Metadata\n- **Layer**: Component\n- **Tags**: [core]\n- **Status**: Active\n`);

    const tree = await buildArchitectureTree(TEST_DIR, DEFAULT_CONFIG);
    const svc = tree.root.children.find((c) => c.name === "svc");
    expect(svc).toBeDefined();
    // core should be a direct child of svc (promoted through src)
    const coreChild = svc!.children.find((c) => c.name === "core");
    expect(coreChild).toBeDefined();
    expect(coreChild!.overview).toBe("Core logic.");
  });

  it("respects ignore patterns", async () => {
    await createFile("architecture.md", `# Root\n\n## Overview\nRoot.\n\n## Metadata\n- **Layer**: Context\n- **Tags**: []\n- **Status**: Active\n`);
    await createFile("node_modules/pkg/architecture.md", `# Pkg\n\n## Overview\nIgnored.\n\n## Metadata\n- **Layer**: Module\n- **Tags**: []\n- **Status**: Active\n`);

    const tree = await buildArchitectureTree(TEST_DIR, DEFAULT_CONFIG);
    const flat = flattenTree(tree);
    expect(flat.find((e) => e.name === "pkg")).toBeUndefined();
  });

  it("collects files on non-Module elements that have a ## Files section (ADR-016)", async () => {
    // Container opts into file tracking by adding ## Files.
    await createFile("architecture.md", `# Root\n\n## Overview\nRoot.\n\n## Metadata\n- **Layer**: Context\n- **Tags**: []\n- **Status**: Active\n`);
    await createFile(
      "svc/architecture.md",
      `# Svc\n\n## Overview\nService container.\n\n## Files\n- \`package.json\` — npm manifest. Pinned at container root.\n\n## Metadata\n- **Layer**: Container\n- **Tags**: []\n- **Status**: Active\n`,
    );
    await createFile("svc/package.json", "{}");
    await createFile("svc/extra.ts", "export const e = 1;");
    // A real Component child so svc stays a Container with children.
    await createFile(
      "svc/api/architecture.md",
      `# Api\n\n## Overview\nApi component.\n\n## Metadata\n- **Layer**: Component\n- **Tags**: []\n- **Status**: Active\n`,
    );

    const tree = await buildArchitectureTree(TEST_DIR, DEFAULT_CONFIG);
    const svc = tree.root.children.find((c) => c.name === "svc");
    expect(svc).toBeDefined();
    expect(svc!.layer).toBe("Container");
    // package.json documented, extra.ts undocumented — both should be collected.
    const fileNames = svc!.files.map((f) => f.name).sort();
    expect(fileNames).toEqual(["extra.ts", "package.json"].sort());
    const pkg = svc!.files.find((f) => f.name === "package.json")!;
    expect(pkg.documented).toBe(true);
    const extra = svc!.files.find((f) => f.name === "extra.ts")!;
    expect(extra.documented).toBe(false);
  });

  it("collects files on non-Module elements even without a ## Files section, marking them undocumented", async () => {
    // Post-ADR-016 (scattered files visible): non-Module elements always
    // collect their direct files from disk. Files without a ## Files entry
    // surface as undocumented so validate_files / the canvas can flag them.
    await createFile("architecture.md", `# Root\n\n## Overview\nRoot.\n\n## Metadata\n- **Layer**: Context\n- **Tags**: []\n- **Status**: Active\n`);
    await createFile(
      "svc/architecture.md",
      `# Svc\n\n## Overview\nNo files section here.\n\n## Metadata\n- **Layer**: Container\n- **Tags**: []\n- **Status**: Active\n`,
    );
    await createFile("svc/package.json", "{}");
    await createFile(
      "svc/api/architecture.md",
      `# Api\n\n## Overview\nApi.\n\n## Metadata\n- **Layer**: Component\n- **Tags**: []\n- **Status**: Active\n`,
    );

    const tree = await buildArchitectureTree(TEST_DIR, DEFAULT_CONFIG);
    const svc = tree.root.children.find((c) => c.name === "svc");
    expect(svc!.files.map((f) => f.name)).toEqual(["package.json"]);
    expect(svc!.files[0].documented).toBe(false);
  });

  it("overrides ignore when folder has architecture.md (docs opt-in)", async () => {
    // A folder matching the ignore list (e.g. "docs") is normally skipped,
    // but an architecture.md is an explicit opt-in that brings it back.
    const config: ConfigFile = { ignore: ["node_modules", "docs", "adrs"] };
    await createFile("architecture.md", `# Root\n\n## Overview\nRoot.\n\n## Metadata\n- **Layer**: Context\n- **Tags**: []\n- **Status**: Active\n`);
    await createFile("docs/architecture.md", `# Docs\n\n## Overview\nDocs folder.\n\n## Metadata\n- **Layer**: Docs\n- **Tags**: []\n- **Status**: Active\n`);
    await createFile("docs/guide.md", "guide content");
    // adrs without architecture.md stays ignored
    await createFile("adrs/001-thing.md", "adr content");
    // node_modules without architecture.md stays ignored
    await createFile("node_modules/pkg/index.js", "js");

    const tree = await buildArchitectureTree(TEST_DIR, config);
    const flat = flattenTree(tree);
    const docs = flat.find((e) => e.name === "docs");
    expect(docs).toBeDefined();
    expect(docs!.layer).toBe("Docs");
    expect(flat.find((e) => e.name === "adrs")).toBeUndefined();
    expect(flat.find((e) => e.name === "pkg")).toBeUndefined();
  });

  it("merges file info for Module elements", async () => {
    await createFile("architecture.md", `# Root\n\n## Overview\nRoot.\n\n## Metadata\n- **Layer**: Context\n- **Tags**: []\n- **Status**: Active\n`);
    await createFile("mod/architecture.md", `# Mod\n\n## Overview\nA module.\n\n## Files\n- \`main.ts\` — Main entry point\n\n## Metadata\n- **Layer**: Module\n- **Tags**: []\n- **Status**: Active\n`);
    await createFile("mod/main.ts", "export const x = 1;");
    await createFile("mod/utils.ts", "export const y = 2;");

    const tree = await buildArchitectureTree(TEST_DIR, DEFAULT_CONFIG);
    const flat = flattenTree(tree);
    const mod = flat.find((e) => e.name === "mod");
    expect(mod).toBeDefined();
    expect(mod!.files).toHaveLength(2);

    const mainFile = mod!.files.find((f) => f.name === "main.ts");
    expect(mainFile!.documented).toBe(true);
    expect(mainFile!.description).toBe("Main entry point");

    const utilsFile = mod!.files.find((f) => f.name === "utils.ts");
    expect(utilsFile!.documented).toBe(false);
  });
});

describe("getElementByPath", () => {
  it("returns root for '.' path", async () => {
    await createFile("architecture.md", `# Root\n\n## Overview\nRoot.\n\n## Metadata\n- **Layer**: Context\n- **Tags**: []\n- **Status**: Active\n`);
    const tree = await buildArchitectureTree(TEST_DIR, DEFAULT_CONFIG);
    const el = getElementByPath(tree, ".");
    expect(el).toBeDefined();
    expect(el!.name).toContain("tessera-tree-test");
  });

  it("returns null for non-existent path", async () => {
    await createFile("architecture.md", `# Root\n\n## Overview\nRoot.\n\n## Metadata\n- **Layer**: Context\n- **Tags**: []\n- **Status**: Active\n`);
    const tree = await buildArchitectureTree(TEST_DIR, DEFAULT_CONFIG);
    const el = getElementByPath(tree, "nonexistent/path");
    expect(el).toBeNull();
  });
});

describe("flattenTree", () => {
  it("flattens nested tree into array", async () => {
    await createFile("architecture.md", `# Root\n\n## Overview\nRoot.\n\n## Metadata\n- **Layer**: Context\n- **Tags**: []\n- **Status**: Active\n`);
    await createFile("svc/architecture.md", `# Svc\n\n## Overview\nService.\n\n## Metadata\n- **Layer**: Container\n- **Tags**: []\n- **Status**: Active\n`);
    await createFile("svc/mod/architecture.md", `# Mod\n\n## Overview\nModule.\n\n## Metadata\n- **Layer**: Module\n- **Tags**: []\n- **Status**: Active\n`);
    await createFile("svc/mod/code.ts", "export const z = 1;");

    const tree = await buildArchitectureTree(TEST_DIR, DEFAULT_CONFIG);
    const flat = flattenTree(tree);
    expect(flat.length).toBeGreaterThanOrEqual(3);
    expect(flat.map((e) => e.name)).toContain("svc");
    expect(flat.map((e) => e.name)).toContain("mod");
  });
});
