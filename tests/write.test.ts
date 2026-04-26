import { afterAll, describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { Layer } from "../shared/constants/constants.js";
import { handleCreateElement, handleUpdateElement } from "../tools/write/write.js";
import { buildCleanFixture } from "./fixtures/index.js";
import { cleanupAllTempDirs } from "./helpers/fixtures.js";

afterAll(() => {
  cleanupAllTempDirs();
});

describe("create_element", () => {
  it("creates a folder + templated architecture.md", async () => {
    const root = await buildCleanFixture();
    const result = await handleCreateElement({
      parentPath: join(root, "api"),
      name: "auth",
      layer: Layer.Component,
    });

    expect(result.created).toBe(true);
    expect(existsSync(result.architectureMd)).toBe(true);

    const content = await readFile(result.architectureMd, "utf-8");
    expect(content).toContain("# auth");
    expect(content).toContain("**Layer**: Component");
  });

  it("can create a Module with the Module template", async () => {
    const root = await buildCleanFixture();
    const result = await handleCreateElement({
      parentPath: join(root, "api/routes"),
      name: "products",
      layer: Layer.Module,
    });

    const content = await readFile(result.architectureMd, "utf-8");
    expect(content).toContain("**Layer**: Module");
    expect(content).toContain("## Files");
  });
});

describe("update_element", () => {
  it("replaces architecture.md content for an existing element", async () => {
    const root = await buildCleanFixture();
    const elementPath = join(root, "api/routes/users");
    const newContent = "# Users (replaced)\n\n## Overview\nNew content.\n";

    const result = await handleUpdateElement({ elementPath, content: newContent });

    expect(result.updated).toBe(true);
    const onDisk = await readFile(join(elementPath, "architecture.md"), "utf-8");
    expect(onDisk).toBe(newContent);
  });

  it("rejects updates to elements without an existing architecture.md", async () => {
    const root = await buildCleanFixture();
    const elementPath = join(root, "api/nonexistent");
    await expect(
      handleUpdateElement({ elementPath, content: "# Anything" }),
    ).rejects.toThrow();
  });
});
