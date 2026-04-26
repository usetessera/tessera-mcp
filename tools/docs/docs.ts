import { resolve, join, relative, dirname } from "node:path";
import { readdir, readFile, writeFile, mkdir, stat } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { tmpdir } from "node:os";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { ARCHITECTURE_FILENAME } from "../../shared/constants/constants.js";
import { buildArchitectureTree, flattenTree } from "../../core/tree/tree.js";
import { loadConfig, type ServerContext } from "../../core/config/config.js";
import { withDriftFooter, jsonResultWithDrift } from "../../core/drift/drift.js";

const execFileAsync = promisify(execFile);

export interface DiagramSource {
  sourcePath: string;
  diagramType: string;
  elementRelativePath: string;
  elementName: string;
}

export interface CompiledDiagram {
  diagramType: string;
  elementPath: string;
  elementName: string;
  svgOutputPath: string;
  sourceOutputPath: string;
}

export interface StaleDiagram {
  diagramType: string;
  elementPath: string;
  elementName: string;
  sourceModified: number;
  outputModified: number;
  sourcePath: string;
  outputPath: string;
}

export interface MissingDiagram {
  diagramType: string;
  elementPath: string;
  elementName: string;
  sourcePath: string;
}

export interface CompileDocsSuccess {
  kind: "success";
  compiled: number;
  rendered: number;
  skipped: number;
  errors: { source: string; error: string }[];
  docsPath: string;
  indexPath: string;
  diagrams: { type: string; element: string; svg: string }[];
  message?: string;
}

export interface CompileDocsMmdcMissing {
  kind: "mmdc-missing";
  error: string;
  fix: string;
  note: string;
}

export type CompileDocsResult = CompileDocsSuccess | CompileDocsMmdcMissing;

export interface CheckDiagramStalenessResult {
  totalSources: number;
  staleCount: number;
  missingCount: number;
  upToDate: number;
  stale: StaleDiagram[];
  missing: MissingDiagram[];
  suggestion: string;
}

/**
 * Finds the mmdc binary from the installed @mermaid-js/mermaid-cli package.
 * Checks node_modules/.bin first, then the MCP server's own node_modules,
 * then a globally installed mmdc. Returns null if unavailable.
 */
export async function findMmdc(rootPath: string): Promise<string | null> {
  const isWin = process.platform === "win32";
  const ext = isWin ? ".cmd" : "";

  const localBin = join(rootPath, "node_modules", ".bin", `mmdc${ext}`);
  try {
    await stat(localBin);
    return localBin;
  } catch {
    // Not found locally
  }

  try {
    const mcpBin = join(
      dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1")),
      "..",
      "..",
      "node_modules",
      ".bin",
      `mmdc${ext}`,
    );
    await stat(mcpBin);
    return mcpBin;
  } catch {
    // Not found in MCP server
  }

  try {
    const globalBin = `mmdc${ext}`;
    await execFileAsync(globalBin, ["--version"], { timeout: 5000 });
    return globalBin;
  } catch {
    // Not available globally
  }

  return null;
}

const MMDC_MISSING: CompileDocsMmdcMissing = {
  kind: "mmdc-missing",
  error: "mmdc (Mermaid CLI) is not installed. Docs compilation requires @mermaid-js/mermaid-cli.",
  fix: "Install it with: npm install -g @mermaid-js/mermaid-cli",
  note: "@mermaid-js/mermaid-cli is an optional dependency of @tessera/mcp to keep the base install lightweight. Install it separately when you need diagram rendering.",
};

/**
 * Collects all .mermaid.md files from the architecture tree.
 */
export async function collectDiagramSources(rootPath: string): Promise<DiagramSource[]> {
  const config = await loadConfig(rootPath);
  const tree = await buildArchitectureTree(rootPath, config);
  const elements = flattenTree(tree);
  const sources: DiagramSource[] = [];

  for (const el of elements) {
    try {
      const entries = await readdir(el.path, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isFile() && entry.name.endsWith(".mermaid.md")) {
          sources.push({
            sourcePath: join(el.path, entry.name),
            diagramType: entry.name.replace(".mermaid.md", ""),
            elementRelativePath: el.relativePath,
            elementName: el.name,
          });
        }
      }
    } catch {
      // Permission error or missing directory
    }
  }
  return sources;
}

/** Extracts mermaid code from a .mermaid.md markdown file. */
export function extractMermaidCode(markdown: string): string | null {
  const match = markdown.match(/```mermaid\n([\s\S]*?)```/);
  return match ? match[1].trim() : null;
}

/** Renders a single mermaid diagram to SVG using mmdc CLI. */
async function renderDiagramToSvg(
  mmdcPath: string,
  mermaidCode: string,
  outputPath: string,
): Promise<void> {
  const tempInput = join(
    tmpdir(),
    `mermaid-${Date.now()}-${Math.random().toString(36).slice(2)}.mmd`,
  );
  try {
    await writeFile(tempInput, mermaidCode, "utf-8");
    await mkdir(dirname(outputPath), { recursive: true });
    await execFileAsync(
      mmdcPath,
      ["-i", tempInput, "-o", outputPath, "-b", "transparent", "--quiet"],
      { timeout: 30000 },
    );
  } finally {
    try {
      const { unlink } = await import("node:fs/promises");
      await unlink(tempInput);
    } catch {
      // Temp cleanup is non-critical
    }
  }
}

function generateIndexMd(compiled: CompiledDiagram[], rootPath: string): string {
  const lines: string[] = [
    "# Architecture Documentation",
    "",
    "Auto-generated documentation from Tessera diagram sources.",
    "",
    `> Last compiled: ${new Date().toISOString()}`,
    "",
    "## Diagrams",
    "",
  ];

  const byElement = new Map<string, CompiledDiagram[]>();
  for (const d of compiled) {
    const key = d.elementPath;
    if (!byElement.has(key)) byElement.set(key, []);
    byElement.get(key)!.push(d);
  }

  for (const [elementPath, diagrams] of byElement) {
    lines.push(`### ${diagrams[0].elementName} (\`${elementPath}\`)`);
    lines.push("");
    for (const d of diagrams) {
      const svgRelative = relative(join(rootPath, "docs"), d.svgOutputPath).replace(/\\/g, "/");
      const srcRelative = relative(join(rootPath, "docs"), d.sourceOutputPath).replace(/\\/g, "/");
      const label = d.diagramType.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
      lines.push(`- **${label}**: [SVG](${svgRelative}) | [Source](${srcRelative})`);
    }
    lines.push("");
  }

  if (compiled.length === 0) {
    lines.push("No diagrams found. Use the MCP `save_diagram` tool to create `.mermaid.md` files in your architecture elements.");
    lines.push("");
  }

  return lines.join("\n");
}

// ── Pure handlers ──

export async function handleCompileDocs(args: {
  rootPath: string;
  force?: boolean;
}): Promise<CompileDocsResult> {
  const absRoot = resolve(args.rootPath);
  const docsDir = join(absRoot, "docs");
  const mmdcPath = await findMmdc(absRoot);

  if (!mmdcPath) {
    return MMDC_MISSING;
  }

  const sources = await collectDiagramSources(absRoot);
  if (sources.length === 0) {
    return {
      kind: "success",
      compiled: 0,
      rendered: 0,
      skipped: 0,
      errors: [],
      docsPath: docsDir,
      indexPath: join(docsDir, "index.md"),
      diagrams: [],
      message: "No .mermaid.md diagram files found in the architecture tree.",
    };
  }

  const compiled: CompiledDiagram[] = [];
  const errors: { source: string; error: string }[] = [];
  let skipped = 0;

  for (const source of sources) {
    const elementDocsDir = source.elementRelativePath === "."
      ? docsDir
      : join(docsDir, source.elementRelativePath.replace(/\\/g, "/"));

    const svgOutput = join(elementDocsDir, `${source.diagramType}.svg`);
    const srcOutput = join(elementDocsDir, `${source.diagramType}.mermaid.md`);

    if (!args.force) {
      try {
        const sourceStat = await stat(source.sourcePath);
        const outputStat = await stat(svgOutput);
        if (outputStat.mtimeMs >= sourceStat.mtimeMs) {
          compiled.push({
            diagramType: source.diagramType,
            elementPath: source.elementRelativePath,
            elementName: source.elementName,
            svgOutputPath: svgOutput,
            sourceOutputPath: srcOutput,
          });
          skipped++;
          continue;
        }
      } catch {
        // Output doesn't exist — render it
      }
    }

    try {
      const markdown = await readFile(source.sourcePath, "utf-8");
      const mermaidCode = extractMermaidCode(markdown);
      if (!mermaidCode) {
        errors.push({ source: source.sourcePath, error: "No mermaid code block found in file" });
        continue;
      }
      await renderDiagramToSvg(mmdcPath, mermaidCode, svgOutput);
      await mkdir(elementDocsDir, { recursive: true });
      await writeFile(srcOutput, markdown, "utf-8");
      compiled.push({
        diagramType: source.diagramType,
        elementPath: source.elementRelativePath,
        elementName: source.elementName,
        svgOutputPath: svgOutput,
        sourceOutputPath: srcOutput,
      });
    } catch (err) {
      errors.push({
        source: source.sourcePath,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  const indexContent = generateIndexMd(compiled, absRoot);
  await mkdir(docsDir, { recursive: true });
  await writeFile(join(docsDir, "index.md"), indexContent, "utf-8");

  return {
    kind: "success",
    compiled: compiled.length,
    rendered: compiled.length - skipped,
    skipped,
    errors,
    docsPath: docsDir,
    indexPath: join(docsDir, "index.md"),
    diagrams: compiled.map((d) => ({
      type: d.diagramType,
      element: d.elementPath,
      svg: relative(absRoot, d.svgOutputPath).replace(/\\/g, "/"),
    })),
  };
}

export async function handleCheckDiagramStaleness(args: {
  rootPath: string;
}): Promise<CheckDiagramStalenessResult> {
  const absRoot = resolve(args.rootPath);
  const docsDir = join(absRoot, "docs");
  const sources = await collectDiagramSources(absRoot);

  const stale: StaleDiagram[] = [];
  const missing: MissingDiagram[] = [];

  for (const source of sources) {
    const elementDocsDir = source.elementRelativePath === "."
      ? docsDir
      : join(docsDir, source.elementRelativePath.replace(/\\/g, "/"));
    const svgOutput = join(elementDocsDir, `${source.diagramType}.svg`);

    try {
      const sourceStat = await stat(source.sourcePath);
      const outputStat = await stat(svgOutput);
      if (sourceStat.mtimeMs > outputStat.mtimeMs) {
        stale.push({
          diagramType: source.diagramType,
          elementPath: source.elementRelativePath,
          elementName: source.elementName,
          sourceModified: sourceStat.mtimeMs,
          outputModified: outputStat.mtimeMs,
          sourcePath: relative(absRoot, source.sourcePath).replace(/\\/g, "/"),
          outputPath: relative(absRoot, svgOutput).replace(/\\/g, "/"),
        });
      }
    } catch {
      missing.push({
        diagramType: source.diagramType,
        elementPath: source.elementRelativePath,
        elementName: source.elementName,
        sourcePath: relative(absRoot, source.sourcePath).replace(/\\/g, "/"),
      });
    }
  }

  return {
    totalSources: sources.length,
    staleCount: stale.length,
    missingCount: missing.length,
    upToDate: sources.length - stale.length - missing.length,
    stale,
    missing,
    suggestion: (stale.length > 0 || missing.length > 0)
      ? "Run compile_docs to render stale/missing diagrams, or compile_docs with force=true to re-render everything."
      : "All diagrams are up to date.",
  };
}

// ── MCP registration ──

export function registerDocsTools(server: McpServer, ctx: ServerContext): void {
  const rootPathSchema = z
    .string()
    .optional()
    .describe(
      `Absolute path to the project root. Optional — defaults to the server's configured root (${ctx.defaultRootPath}).`,
    );
  const resolveRoot = (rootPath: string | undefined) => rootPath ?? ctx.defaultRootPath;

  server.tool(
    "compile_docs",
    "Walks the architecture tree, finds all .mermaid.md diagram source files, renders them to SVG, and organizes the output in a docs/ folder with an index catalog. The docs/ folder mirrors the architecture tree structure.",
    {
      rootPath: rootPathSchema,
      force: z.boolean().optional().describe("Re-render all diagrams even if not stale (default: false)"),
    },
    async (args) => {
      const rootPath = resolveRoot(args.rootPath);
      const result = await handleCompileDocs({ rootPath, force: args.force });
      if (result.kind === "mmdc-missing") {
        return withDriftFooter(
          {
            content: [{
              type: "text" as const,
              text: JSON.stringify({ error: result.error, fix: result.fix, note: result.note }, null, 2),
            }],
            isError: true as const,
          },
          { rootPath },
        );
      }
      const { kind, ...rest } = result;
      return jsonResultWithDrift(rest, { rootPath });
    },
  );

  server.tool(
    "check_diagram_staleness",
    "Compares .mermaid.md source files to their rendered SVG counterparts in docs/ and reports which diagrams are stale (source newer than output) or missing from docs/.",
    {
      rootPath: rootPathSchema,
    },
    async (args) => {
      const rootPath = resolveRoot(args.rootPath);
      const data = await handleCheckDiagramStaleness({ rootPath });
      return jsonResultWithDrift(data, { rootPath });
    },
  );
}
