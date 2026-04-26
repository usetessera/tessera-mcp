import { readFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { TOOL_NAMES, CONFIG_DIR, AGENT_RULES_FILE } from "../../shared/constants/constants.js";
import type { ArchitectureElement, ElementContext } from "../../shared/types/types.js";
import { buildArchitectureTree, getElementByPath } from "../../core/tree/tree.js";
import { loadConfig, type ServerContext } from "../../core/config/config.js";
import { withDriftFooter, jsonResultWithDrift } from "../../core/drift/drift.js";

export const NO_RULES_MESSAGE =
  "No agent-rules.md found. Create .tessera/agent-rules.md to define project rules.";

/**
 * Reads the project's AI agent rules from .tessera/agent-rules.md.
 * Returns the raw text content, or a sentinel message when the file is absent.
 */
export async function handleGetRules(args: { rootPath: string }): Promise<string> {
  const absRoot = resolve(args.rootPath);
  const rulesPath = join(absRoot, CONFIG_DIR, AGENT_RULES_FILE);
  try {
    return await readFile(rulesPath, "utf-8");
  } catch {
    return NO_RULES_MESSAGE;
  }
}

export async function handleGetElementContext(args: {
  rootPath: string;
  elementPath: string;
}): Promise<ElementContext> {
  const absRoot = resolve(args.rootPath);
  const config = await loadConfig(absRoot);
  const tree = await buildArchitectureTree(absRoot, config);

  const element = getElementByPath(tree, args.elementPath);
  if (!element) {
    throw new Error(`Element not found at path '${args.elementPath}'`);
  }

  const parent = findParent(tree.root, args.elementPath);
  const siblings = parent
    ? parent.children.filter((c) => c.relativePath !== element.relativePath)
    : [];

  return {
    element,
    parent,
    siblings,
    children: element.children,
  };
}

/**
 * Registers all context/rules tools with the MCP server.
 */
export function registerContextTools(server: McpServer, serverCtx: ServerContext): void {
  const rootPathSchema = z
    .string()
    .optional()
    .describe(
      `Absolute path to the project root. Optional — defaults to the server's configured root (${serverCtx.defaultRootPath}).`,
    );
  const resolveRoot = (rootPath: string | undefined) => rootPath ?? serverCtx.defaultRootPath;

  server.tool(
    TOOL_NAMES.GET_RULES,
    "Returns project-level architectural rules for AI agent context injection from .tessera/agent-rules.md",
    {
      rootPath: rootPathSchema,
    },
    async (args) => {
      const rootPath = resolveRoot(args.rootPath);
      const text = await handleGetRules({ rootPath });
      return withDriftFooter(
        { content: [{ type: "text" as const, text }] },
        { rootPath },
      );
    },
  );

  server.tool(
    TOOL_NAMES.GET_ELEMENT_CONTEXT,
    "Returns a summary of an element and its immediate neighbors (parent, siblings, children) for focused agent work",
    {
      rootPath: rootPathSchema,
      elementPath: z.string().describe("Relative path to the element from root"),
    },
    async (args) => {
      const rootPath = resolveRoot(args.rootPath);
      try {
        const result = await handleGetElementContext({ rootPath, elementPath: args.elementPath });
        return jsonResultWithDrift(result, { rootPath, elementPath: args.elementPath });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          content: [{ type: "text" as const, text: `Error: ${message}` }],
          isError: true as const,
        };
      }
    },
  );
}

function findParent(
  current: ArchitectureElement,
  targetRelPath: string,
): ArchitectureElement | null {
  const normalizedTarget = targetRelPath.replace(/\\/g, "/");
  for (const child of current.children) {
    const normalizedChild = child.relativePath.replace(/\\/g, "/");
    if (normalizedChild === normalizedTarget) {
      return current;
    }
    const found = findParent(child, targetRelPath);
    if (found) return found;
  }
  return null;
}
