import { afterAll, describe, expect, it } from "vitest";
import { existsSync } from "node:fs";
import { join } from "node:path";
import {
  handleBootstrapTesseraProject,
  handleGenerateArchitectureDiagram,
  handleReviewArchitectureDrift,
  handleValidateReleaseReadiness,
} from "../tools/workflows/workflows.js";
import { buildCleanFixture, buildFileDriftFixture } from "./fixtures/index.js";
import { cleanupAllTempDirs, createTempDir, writeFixtureFile } from "./helpers/fixtures.js";

afterAll(() => {
  cleanupAllTempDirs();
});

describe("workflow tools", () => {
  it("reviews architecture drift across validators", async () => {
    const root = await buildFileDriftFixture();
    const result = await handleReviewArchitectureDrift({ rootPath: root });

    expect(result.summary.fileDrift).toBeGreaterThan(0);
    expect(result.plan.some((item) => item.category === "file-drift")).toBe(true);
  });

  it("generates deterministic architecture diagrams", async () => {
    const root = await buildCleanFixture();
    const result = await handleGenerateArchitectureDiagram({
      rootPath: root,
      diagramType: "dependency-graph",
    });

    expect(result.mermaid).toContain("graph LR");
    expect(result.diagramType).toBe("dependency-graph");
  });

  it("can save generated diagrams", async () => {
    const root = await buildCleanFixture();
    const result = await handleGenerateArchitectureDiagram({
      rootPath: root,
      diagramType: "system-map",
      save: true,
    });

    expect(result.savedPath).toBeTruthy();
    expect(existsSync(join(root, "system-map.mermaid.md"))).toBe(true);
  });

  it("combines architecture scaffold and protocol bootstrap preparation", async () => {
    const root = createTempDir("tessera-workflow-");
    await writeFixtureFile(root, "src/index.ts", "export {};\n");

    const result = await handleBootstrapTesseraProject({ rootPath: root });

    expect(result.architecture.proposals.length).toBeGreaterThan(0);
    expect(result.protocols.questions.length).toBeGreaterThan(0);
  });

  it("validates release readiness for protocol specs", async () => {
    const root = createTempDir("tessera-protocol-release-");
    await writeFixtureFile(root, "README.md", "# Test\n");
    await writeFixtureFile(root, "SPEC.md", "# Spec\n");
    await writeFixtureFile(root, "LICENSE", "MIT\n");
    await writeFixtureFile(root, "CONTRIBUTING.md", "# Contributing\n");
    await writeFixtureFile(root, "FAQ.md", "# FAQ\n");

    const result = await handleValidateReleaseReadiness({ rootPath: root, target: "protocol" });

    expect(result.ready).toBe(true);
  });
});
