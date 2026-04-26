import { describe, it, expect } from "vitest";
import {
  parseContent,
  extractSection,
  extractMetadata,
  parseTags,
  parseDependencyLinks,
  parseFilesSection,
} from "./parser.js";

// ── extractSection ──

describe("extractSection", () => {
  it("extracts a section between two headings", () => {
    const md = "## Overview\nThis is the overview.\n\n## Metadata\n- **Layer**: Module";
    expect(extractSection(md, "Overview")).toBe("This is the overview.");
  });

  it("extracts the last section (no trailing heading)", () => {
    const md = "## Overview\nFirst section.\n\n## Key Decisions\n- Decision A\n- Decision B";
    expect(extractSection(md, "Key Decisions")).toBe("- Decision A\n- Decision B");
  });

  it("returns null for a missing section", () => {
    const md = "## Overview\nSome content.";
    expect(extractSection(md, "Technology")).toBeNull();
  });

  it("handles sections with empty content", () => {
    const md = "## Overview\n\n## Metadata\n- **Layer**: Module";
    expect(extractSection(md, "Overview")).toBe("");
  });

  it("handles Windows line endings (CRLF)", () => {
    const md = "## Overview\r\nThis is the overview.\r\n\r\n## Metadata\r\n- **Layer**: Module";
    const result = extractSection(md, "Overview");
    // Should extract the content (may include \r)
    expect(result).toContain("This is the overview.");
  });
});

// ── extractMetadata ──

describe("extractMetadata", () => {
  it("parses all metadata fields", () => {
    const md = `# Test
## Overview
A test element.

## Metadata
- **Layer**: Container
- **Tags**: [api, backend, core]
- **Depends on**: [shared](../shared/architecture.md)
- **Depended by**: [extension](../extension/architecture.md)
- **Owner**: @jonny
- **Status**: Active
`;
    const meta = extractMetadata(md);
    expect(meta.layer).toBe("Container");
    expect(meta.tags).toEqual(["api", "backend", "core"]);
    expect(meta.dependsOn).toEqual(["../shared/architecture.md"]);
    expect(meta.dependedBy).toEqual(["../extension/architecture.md"]);
    expect(meta.owner).toBe("@jonny");
    expect(meta.status).toBe("Active");
  });

  it("returns defaults when no metadata section exists", () => {
    const md = "# Test\n## Overview\nJust an overview.";
    const meta = extractMetadata(md);
    expect(meta.layer).toBe("Module");
    expect(meta.tags).toEqual([]);
    expect(meta.dependsOn).toEqual([]);
    expect(meta.dependedBy).toEqual([]);
    expect(meta.owner).toBe("");
    expect(meta.status).toBe("Planned");
  });

  it("handles 'None' for depends on/depended by", () => {
    const md = `## Metadata
- **Layer**: Module
- **Tags**: []
- **Depends on**: None
- **Depended by**: None
- **Owner**: @dev
- **Status**: Planned
`;
    const meta = extractMetadata(md);
    expect(meta.dependsOn).toEqual([]);
    expect(meta.dependedBy).toEqual([]);
  });

  it("parses Deprecated status", () => {
    const md = `## Metadata\n- **Layer**: Module\n- **Status**: Deprecated`;
    const meta = extractMetadata(md);
    expect(meta.status).toBe("Deprecated");
  });
});

// ── parseTags ──

describe("parseTags", () => {
  it("parses bracketed comma-separated tags", () => {
    expect(parseTags("[api, backend, core]")).toEqual(["api", "backend", "core"]);
  });

  it("returns empty array for empty brackets", () => {
    expect(parseTags("[]")).toEqual([]);
  });

  it("returns empty array for null", () => {
    expect(parseTags(null)).toEqual([]);
  });

  it("handles single tag", () => {
    expect(parseTags("[mcp]")).toEqual(["mcp"]);
  });
});

// ── parseDependencyLinks ──

describe("parseDependencyLinks", () => {
  it("extracts paths from markdown links", () => {
    const result = parseDependencyLinks("[shared](../shared/architecture.md), [core](../core/architecture.md)");
    expect(result).toEqual(["../shared/architecture.md", "../core/architecture.md"]);
  });

  it("returns empty for None", () => {
    expect(parseDependencyLinks("None")).toEqual([]);
    expect(parseDependencyLinks("none")).toEqual([]);
  });

  it("returns empty for null", () => {
    expect(parseDependencyLinks(null)).toEqual([]);
  });

  it("falls back to comma-separated plain text if no markdown links", () => {
    expect(parseDependencyLinks("moduleA, moduleB")).toEqual(["moduleA", "moduleB"]);
  });
});

// ── parseFilesSection ──

describe("parseFilesSection", () => {
  it("parses standard file list format", () => {
    const section = "- `parser.ts` — Parses markdown into structured data\n- `utils.ts` — Helper functions";
    const files = parseFilesSection(section);
    expect(files).toHaveLength(2);
    expect(files[0]).toEqual({ name: "parser.ts", extension: "ts", description: "Parses markdown into structured data", documented: true });
    expect(files[1]).toEqual({ name: "utils.ts", extension: "ts", description: "Helper functions", documented: true });
  });

  it("returns empty array for null", () => {
    expect(parseFilesSection(null)).toEqual([]);
  });

  it("handles en-dash separator", () => {
    const section = "- `file.py` – A Python file";
    const files = parseFilesSection(section);
    expect(files).toHaveLength(1);
    expect(files[0].name).toBe("file.py");
  });

  it("handles files without extensions", () => {
    const section = "- `Makefile` — Build configuration";
    const files = parseFilesSection(section);
    expect(files).toHaveLength(1);
    expect(files[0].extension).toBe("");
  });
});
