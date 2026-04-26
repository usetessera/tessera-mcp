import { afterAll, describe, expect, it } from "vitest";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import {
  handleListDiagramTypes,
  handleListDiagrams,
  handlePrepareDiagramContext,
  handleSaveDiagram,
} from "../tools/diagram/diagram.js";
import { buildCleanFixture } from "./fixtures/index.js";
import { cleanupAllTempDirs } from "./helpers/fixtures.js";

afterAll(() => {
  cleanupAllTempDirs();
});

describe("prepare_diagram_context", () => {
  it("returns element metadata, architecture.md content, and the diagram type description", async () => {
    const root = await buildCleanFixture();
    const ctx = await handlePrepareDiagramContext({
      rootPath: root,
      elementPath: "api",
      diagramType: "data-flow",
    });

    expect(ctx.element.name).toBe("api");
    expect(ctx.element.layer).toBe("Container");
    expect(ctx.diagramType.name).toBe("data-flow");
    expect(ctx.diagramType.description).toContain("data moves");
    expect(ctx.architectureMd).toContain("# API");
    expect(ctx.children.map((c) => c.name)).toContain("routes");
    expect(ctx.instruction).toContain("Mermaid");
  });

  it("includes code file contents up to 10 files", async () => {
    const root = await buildCleanFixture();
    const ctx = await handlePrepareDiagramContext({
      rootPath: root,
      elementPath: "api/routes/users",
      diagramType: "class-diagram",
    });
    expect(Object.keys(ctx.codeFiles)).toContain("users.ts");
    expect(ctx.codeFiles["users.ts"]).toContain("export const users");
  });

  it("returns an 'Unknown diagram type' description for unrecognized types", async () => {
    const root = await buildCleanFixture();
    const ctx = await handlePrepareDiagramContext({
      rootPath: root,
      elementPath: "api",
      diagramType: "not-a-real-type",
    });
    expect(ctx.diagramType.description).toBe("Unknown diagram type");
  });

  it("throws when the element path does not exist", async () => {
    const root = await buildCleanFixture();
    await expect(
      handlePrepareDiagramContext({
        rootPath: root,
        elementPath: "nope",
        diagramType: "data-flow",
      }),
    ).rejects.toThrow();
  });
});

describe("save_diagram", () => {
  it("writes a .mermaid.md file with the provided content", async () => {
    const root = await buildCleanFixture();
    const result = await handleSaveDiagram({
      elementPath: join(root, "api"),
      diagramType: "data-flow",
      mermaidContent: "graph TD\n  A --> B",
    });

    expect(result.filename).toBe("data-flow.mermaid.md");
    expect(existsSync(result.path)).toBe(true);
    const content = await readFile(result.path, "utf-8");
    expect(content).toContain("```mermaid");
    expect(content).toContain("graph TD");
    expect(content).toContain("# Data Flow");
  });
});

describe("list_diagram_types", () => {
  it("returns types for each C4 layer", () => {
    expect(handleListDiagramTypes({ layer: "Context" }).length).toBeGreaterThan(0);
    expect(handleListDiagramTypes({ layer: "Container" }).length).toBeGreaterThan(0);
    expect(handleListDiagramTypes({ layer: "Component" }).length).toBeGreaterThan(0);
    expect(handleListDiagramTypes({ layer: "Module" }).length).toBeGreaterThan(0);
  });

  it("returns an empty array for the Docs layer", () => {
    expect(handleListDiagramTypes({ layer: "Docs" })).toEqual([]);
  });
});

describe("list_diagrams", () => {
  it("returns empty for a folder without diagrams", async () => {
    const root = await buildCleanFixture();
    const diagrams = await handleListDiagrams({ elementPath: join(root, "api") });
    expect(diagrams).toEqual([]);
  });

  it("returns saved diagrams after save_diagram writes one", async () => {
    const root = await buildCleanFixture();
    await handleSaveDiagram({
      elementPath: join(root, "api"),
      diagramType: "sequence-diagram",
      mermaidContent: "sequenceDiagram\n  A->>B: hi",
    });
    const diagrams = await handleListDiagrams({ elementPath: join(root, "api") });
    expect(diagrams.map((d) => d.type)).toContain("sequence-diagram");
  });
});
