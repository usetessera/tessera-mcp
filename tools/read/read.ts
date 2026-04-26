import { resolve, join } from "node:path";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { TOOL_NAMES, ARCHITECTURE_FILENAME } from "../../shared/constants/constants.js";
import type {
  ArchitectureElement,
  ArchitectureTree,
  ParsedArchitectureMd,
  SearchResult,
} from "../../shared/types/types.js";
import { buildArchitectureTree, flattenTree } from "../../core/tree/tree.js";
import { parseArchitectureMd } from "../../core/parser/parser.js";
import { loadConfig, type ServerContext } from "../../core/config/config.js";
import { jsonResultWithDrift } from "../../core/drift/drift.js";

// ── Handler results ──

export interface GetElementForFileResult {
  element: {
    name: string;
    path: string;
    relativePath: string;
    layer: string;
    overview: string;
    tags: string[];
    files: ArchitectureElement["files"];
    dependsOn?: string[];
    dependedBy?: string[];
  };
  architectureMd: ParsedArchitectureMd | null;
  note?: string;
}

export interface GetElementForFileNotFound {
  error: string;
  filePath: string;
  hint: string;
}

// ── Pure handlers (testable without MCP transport) ──

export async function handleGetArchitectureTree(args: {
  rootPath: string;
}): Promise<ArchitectureTree> {
  const absRoot = resolve(args.rootPath);
  const config = await loadConfig(absRoot);
  return buildArchitectureTree(absRoot, config);
}

export async function handleGetElement(args: {
  rootPath: string;
  elementPath: string;
}): Promise<ParsedArchitectureMd> {
  const absRoot = resolve(args.rootPath);
  const absElement = join(absRoot, args.elementPath, ARCHITECTURE_FILENAME);
  return parseArchitectureMd(absElement);
}

export async function handleSearchElements(args: {
  rootPath: string;
  query: string;
}): Promise<SearchResult[]> {
  const absRoot = resolve(args.rootPath);
  const config = await loadConfig(absRoot);
  const tree = await buildArchitectureTree(absRoot, config);
  const allElements = flattenTree(tree);
  const q = args.query.toLowerCase();
  const results: SearchResult[] = [];

  for (const el of allElements) {
    if (el.name.toLowerCase().includes(q)) {
      results.push({ ...toSearchResult(el), matchField: "name" });
    } else if (el.metadata.tags.some((t) => t.toLowerCase().includes(q))) {
      results.push({ ...toSearchResult(el), matchField: "tag" });
    } else if (el.overview.toLowerCase().includes(q)) {
      results.push({ ...toSearchResult(el), matchField: "overview" });
    }
  }
  return results;
}

export async function handleGetElementForFile(args: {
  rootPath: string;
  filePath: string;
}): Promise<GetElementForFileResult | GetElementForFileNotFound> {
  const absRoot = resolve(args.rootPath);
  const config = await loadConfig(absRoot);
  const tree = await buildArchitectureTree(absRoot, config);
  const allElements = flattenTree(tree);

  let normalizedFile = args.filePath.replace(/\\/g, "/");
  const normalizedRoot = absRoot.replace(/\\/g, "/");
  if (normalizedFile.startsWith(normalizedRoot)) {
    normalizedFile = normalizedFile.slice(normalizedRoot.length).replace(/^\//, "");
  }

  // Match the deepest (most specific) owning element first.
  // Normalize separators before splitting so depth is correct on Windows.
  const sorted = [...allElements].sort(
    (a, b) =>
      b.relativePath.replace(/\\/g, "/").split("/").length -
      a.relativePath.replace(/\\/g, "/").split("/").length,
  );

  for (const el of sorted) {
    const elRel = el.relativePath.replace(/\\/g, "/").replace(/^\.?\/?/, "");
    if (!elRel) continue;
    if (normalizedFile.startsWith(elRel + "/") || normalizedFile === elRel) {
      const elementSummary = {
        name: el.name,
        path: el.path,
        relativePath: el.relativePath,
        layer: el.layer,
        overview: el.overview,
        tags: el.metadata.tags,
        files: el.files,
        dependsOn: el.metadata.dependsOn,
        dependedBy: el.metadata.dependedBy,
      };
      try {
        const parsed = await parseArchitectureMd(join(el.path, ARCHITECTURE_FILENAME));
        return { element: elementSummary, architectureMd: parsed };
      } catch {
        return {
          element: elementSummary,
          architectureMd: null,
          note: "architecture.md could not be parsed",
        };
      }
    }
  }

  return {
    error: "No architecture element found for this file",
    filePath: normalizedFile,
    hint: "This file may be in an undocumented folder. Use find_orphans to check.",
  };
}

/**
 * Registers all read tools with the MCP server.
 */
export function registerReadTools(server: McpServer, ctx: ServerContext): void {
  const rootPathSchema = z
    .string()
    .optional()
    .describe(
      `Absolute path to the project root. Optional — defaults to the server's configured root (${ctx.defaultRootPath}).`,
    );
  const resolveRoot = (rootPath: string | undefined) => rootPath ?? ctx.defaultRootPath;

  server.tool(
    TOOL_NAMES.GET_ARCHITECTURE_TREE,
    "Returns the full architecture element hierarchy as a JSON tree with layer, name, path, and tags for each element",
    { rootPath: rootPathSchema },
    async (args) => {
      const rootPath = resolveRoot(args.rootPath);
      const data = await handleGetArchitectureTree({ rootPath });
      return jsonResultWithDrift(data, { rootPath });
    },
  );

  server.tool(
    TOOL_NAMES.GET_ELEMENT,
    "Returns the full architecture.md content and parsed metadata for a given element path",
    {
      rootPath: rootPathSchema,
      elementPath: z.string().describe("Relative path to the element from root (e.g., 'extension/webview')"),
    },
    async (args) => {
      const rootPath = resolveRoot(args.rootPath);
      try {
        const data = await handleGetElement({ rootPath, elementPath: args.elementPath });
        return jsonResultWithDrift(data, { rootPath, elementPath: args.elementPath });
      } catch {
        return errorResult(`Error: No architecture.md found at ${args.elementPath}`);
      }
    },
  );

  server.tool(
    TOOL_NAMES.SEARCH_ELEMENTS,
    "Searches elements by name, tag, or overview text across all layers. Returns matching elements with paths and layer info.",
    {
      rootPath: rootPathSchema,
      query: z.string().describe("Search query — matched against element names, tags, and overview text"),
    },
    async (args) => {
      const rootPath = resolveRoot(args.rootPath);
      const data = await handleSearchElements({ rootPath, query: args.query });
      return jsonResultWithDrift(data, { rootPath });
    },
  );

  server.tool(
    TOOL_NAMES.GET_ELEMENT_FOR_FILE,
    "Given a file path, returns the architecture.md context for the module that owns that file. Use this to quickly understand the architectural context around any source file without reading the code.",
    {
      rootPath: rootPathSchema,
      filePath: z.string().describe("Absolute or root-relative path to a source file (e.g., 'extension/webview/canvas/Canvas.tsx')"),
    },
    async (args) => {
      const rootPath = resolveRoot(args.rootPath);
      const data = await handleGetElementForFile({ rootPath, filePath: args.filePath });
      // Use the resolved element's path as scope when the lookup succeeded.
      const elementPath = "element" in data ? data.element.relativePath : undefined;
      return jsonResultWithDrift(data, { rootPath, elementPath });
    },
  );
}

function toSearchResult(el: ArchitectureElement): Omit<SearchResult, "matchField"> {
  return {
    name: el.name,
    path: el.path,
    relativePath: el.relativePath,
    layer: el.layer,
    overview: el.overview,
    tags: el.metadata.tags,
  };
}

function jsonResult(data: unknown) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
  };
}

function errorResult(message: string) {
  return {
    content: [{ type: "text" as const, text: message }],
    isError: true as const,
  };
}
