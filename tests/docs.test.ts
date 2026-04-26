import { afterAll, describe, expect, it } from "vitest";
import {
  collectDiagramSources,
  extractMermaidCode,
  handleCheckDiagramStaleness,
  handleCompileDocs,
} from "../tools/docs/docs.js";
import { handleSaveDiagram } from "../tools/diagram/diagram.js";
import { buildCleanFixture } from "./fixtures/index.js";
import { cleanupAllTempDirs, writeFixtureFile } from "./helpers/fixtures.js";
import { join } from "node:path";

afterAll(() => {
  cleanupAllTempDirs();
});

describe("extractMermaidCode", () => {
  it("extracts the fenced mermaid block", () => {
    const md = "# Title\n\n```mermaid\ngraph TD\n  A --> B\n```\n";
    expect(extractMermaidCode(md)).toBe("graph TD\n  A --> B");
  });

  it("returns null when no mermaid block is present", () => {
    expect(extractMermaidCode("# Just text")).toBeNull();
  });
});

describe("collectDiagramSources", () => {
  it("walks the tree and collects .mermaid.md files by element", async () => {
    const root = await buildCleanFixture();
    // Add two diagrams in different elements.
    await handleSaveDiagram({
      elementPath: join(root, "api"),
      diagramType: "data-flow",
      mermaidContent: "graph TD\n  A --> B",
    });
    await handleSaveDiagram({
      elementPath: join(root, "web"),
      diagramType: "sequence-diagram",
      mermaidContent: "sequenceDiagram\n  A->>B: hi",
    });

    const sources = await collectDiagramSources(root);
    const types = sources.map((s) => s.diagramType).sort();
    expect(types).toEqual(["data-flow", "sequence-diagram"]);
  });
});

describe("check_diagram_staleness", () => {
  it("reports every source as missing when no docs/ exists", async () => {
    const root = await buildCleanFixture();
    await handleSaveDiagram({
      elementPath: join(root, "api"),
      diagramType: "data-flow",
      mermaidContent: "graph TD\n  A --> B",
    });
    const result = await handleCheckDiagramStaleness({ rootPath: root });
    expect(result.totalSources).toBe(1);
    expect(result.missingCount).toBe(1);
    expect(result.staleCount).toBe(0);
  });

  it("reports zero when there are no .mermaid.md sources at all", async () => {
    const root = await buildCleanFixture();
    const result = await handleCheckDiagramStaleness({ rootPath: root });
    expect(result.totalSources).toBe(0);
    expect(result.suggestion).toBe("All diagrams are up to date.");
  });

  it("reports a diagram as stale when the source is newer than the svg", async () => {
    const root = await buildCleanFixture();
    await handleSaveDiagram({
      elementPath: join(root, "api"),
      diagramType: "data-flow",
      mermaidContent: "graph TD\n  A --> B",
    });
    // Pre-create an svg with an ancient mtime so source > output.
    const svgPath = "docs/api/data-flow.svg";
    await writeFixtureFile(root, svgPath, "<svg/>\n");
    const { utimes } = await import("node:fs/promises");
    const ancient = new Date("2000-01-01T00:00:00Z");
    await utimes(join(root, svgPath), ancient, ancient);

    const result = await handleCheckDiagramStaleness({ rootPath: root });
    expect(result.staleCount).toBe(1);
  });
});

describe("compile_docs (no mmdc)", () => {
  // Fixtures run in temp dirs with no node_modules, and mmdc is typically not
  // on PATH in CI — so this exercises the "mmdc-missing" branch reliably.
  it("returns mmdc-missing when mmdc is not available", async () => {
    const root = await buildCleanFixture();
    // Save a diagram so there's something to compile (even though mmdc is absent).
    await handleSaveDiagram({
      elementPath: join(root, "api"),
      diagramType: "data-flow",
      mermaidContent: "graph TD\n  A --> B",
    });
    const result = await handleCompileDocs({ rootPath: root });
    // We can't guarantee CI has no mmdc, but in the fixture temp dir there are
    // no node_modules/.bin and we don't have mmdc on PATH in this repo — so
    // expect the mmdc-missing branch here.
    if (result.kind === "mmdc-missing") {
      expect(result.error).toContain("mmdc");
      expect(result.fix).toContain("mermaid-cli");
    } else {
      // Environment has mmdc available — accept either branch so the test is portable.
      expect(result.kind).toBe("success");
    }
  });
});
