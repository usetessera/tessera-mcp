import { mkdir, writeFile, readFile } from "node:fs/promises";
import { resolve, join, relative } from "node:path";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { TOOL_NAMES, Layer, ARCHITECTURE_FILENAME } from "../../shared/constants/constants.js";
import { generateTemplate } from "../../core/templates/templates.js";
import type { ServerContext } from "../../core/config/config.js";
import { jsonResultWithDrift } from "../../core/drift/drift.js";

export interface CreateElementResult {
  created: true;
  path: string;
  architectureMd: string;
  layer: Layer;
}

export interface UpdateElementResult {
  updated: true;
  path: string;
}

// ── Pure handlers ──

export async function handleCreateElement(args: {
  parentPath: string;
  name: string;
  layer: Layer;
}): Promise<CreateElementResult> {
  const absParent = resolve(args.parentPath);
  const elementDir = join(absParent, args.name);
  const archMdPath = join(elementDir, ARCHITECTURE_FILENAME);

  await mkdir(elementDir, { recursive: true });
  const content = generateTemplate(args.layer, args.name);
  await writeFile(archMdPath, content, "utf-8");

  return {
    created: true,
    path: elementDir,
    architectureMd: archMdPath,
    layer: args.layer,
  };
}

export async function handleUpdateElement(args: {
  elementPath: string;
  content: string;
}): Promise<UpdateElementResult> {
  const absElement = resolve(args.elementPath);
  const archMdPath = join(absElement, ARCHITECTURE_FILENAME);

  // Verify the file exists first — preserves original behavior of rejecting updates to non-existent elements.
  await readFile(archMdPath, "utf-8");
  await writeFile(archMdPath, args.content, "utf-8");

  return { updated: true, path: archMdPath };
}

/**
 * Registers all write tools with the MCP server.
 */
export function registerWriteTools(server: McpServer, ctx: ServerContext): void {
  const rootPath = ctx.defaultRootPath;

  server.tool(
    TOOL_NAMES.CREATE_ELEMENT,
    "Creates a new architectural element: folder + templated architecture.md at the specified layer and path",
    {
      parentPath: z.string().describe("Absolute path to the parent folder where the new element will be created"),
      name: z.string().describe("Name of the new element (used as folder name and architecture.md title)"),
      layer: z.enum(["Context", "Container", "Component", "Module", "Docs"]).describe("C4 layer for the new element"),
    },
    async (args) => {
      try {
        const result = await handleCreateElement({
          parentPath: args.parentPath,
          name: args.name,
          layer: args.layer as Layer,
        });
        return jsonResultWithDrift(result, {
          rootPath,
          elementPath: toRelative(rootPath, args.parentPath),
        });
      } catch (err) {
        return errorResult(`Error creating element: ${err}`);
      }
    },
  );

  server.tool(
    TOOL_NAMES.UPDATE_ELEMENT,
    "Updates an existing architecture.md file with new content. Can replace the entire file or merge sections.",
    {
      elementPath: z.string().describe("Absolute path to the element folder containing architecture.md"),
      content: z.string().describe("New architecture.md content (replaces the entire file)"),
    },
    async (args) => {
      try {
        const result = await handleUpdateElement(args);
        return jsonResultWithDrift(result, {
          rootPath,
          elementPath: toRelative(rootPath, args.elementPath),
        });
      } catch (err) {
        return errorResult(`Error updating element: ${err}`);
      }
    },
  );
}

function toRelative(rootPath: string, absPath: string): string | undefined {
  try {
    const rel = relative(resolve(rootPath), resolve(absPath)).replace(/\\/g, "/");
    if (!rel || rel.startsWith("..")) return undefined;
    return rel;
  } catch {
    return undefined;
  }
}

function jsonResult(data: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(data) }] };
}

function errorResult(message: string) {
  return {
    content: [{ type: "text" as const, text: message }],
    isError: true as const,
  };
}
