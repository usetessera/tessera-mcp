import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  proposeScaffold,
  applyScaffold,
  PASS_THROUGH_NAMES,
  type ProposalItem,
  type ScaffoldProposalResult,
  type ApplyScaffoldResult,
} from "@tessera/shared/scaffold";
import { Layer } from "../../shared/constants/constants.js";
import { loadConfig, type ServerContext } from "../../core/config/config.js";
import { jsonResultWithDrift } from "../../core/drift/drift.js";

export { PASS_THROUGH_NAMES };
export type { ProposalItem, ScaffoldProposalResult, ApplyScaffoldResult };

// ── Pure handlers ──

export async function handleScaffoldExistingCodebase(args: {
  rootPath: string;
}): Promise<ScaffoldProposalResult> {
  const config = await loadConfig(args.rootPath);
  return proposeScaffold({
    rootPath: args.rootPath,
    ignorePatterns: config.ignore,
    workspaceMode: config.workspaceMode,
  });
}

export async function handleApplyScaffold(args: {
  rootPath: string;
  elements: { path: string; layer: Layer; name: string }[];
  dryRun?: boolean;
}): Promise<ApplyScaffoldResult> {
  return applyScaffold(args);
}

// ── MCP registration ──

export function registerScaffoldTools(server: McpServer, ctx: ServerContext): void {
  const rootPathSchema = z
    .string()
    .optional()
    .describe(
      `Absolute path to the project root. Optional — defaults to the server's configured root (${ctx.defaultRootPath}).`,
    );
  const resolveRoot = (rootPath: string | undefined) => rootPath ?? ctx.defaultRootPath;

  server.tool(
    "scaffold_existing_codebase",
    "Analyzes an existing codebase's folder structure and proposes a C4 layer mapping. Does NOT create any files — returns a proposal for review.",
    { rootPath: rootPathSchema },
    async (args) => {
      const rootPath = resolveRoot(args.rootPath);
      const data = await handleScaffoldExistingCodebase({ rootPath });
      return jsonResultWithDrift(data, { rootPath });
    },
  );

  server.tool(
    "apply_scaffold",
    "Creates architecture.md files for specified folders based on a scaffold proposal. Does NOT move or rename existing files. Pass dryRun=true to preview without writing.",
    {
      rootPath: rootPathSchema,
      elements: z
        .array(
          z.object({
            path: z.string().describe("Relative path from root"),
            layer: z.enum(["Landscape", "Context", "Container", "Component", "Module", "Docs"]),
            name: z.string().describe("Element name for the architecture.md title"),
          }),
        )
        .describe("Array of elements to create architecture.md for"),
      dryRun: z
        .boolean()
        .optional()
        .describe("If true, returns what would be created without writing any files"),
    },
    async (args) => {
      const rootPath = resolveRoot(args.rootPath);
      const typedElements = args.elements.map((el) => ({
        path: el.path,
        layer: el.layer as Layer,
        name: el.name,
      }));
      const data = await handleApplyScaffold({
        rootPath,
        elements: typedElements,
        dryRun: args.dryRun,
      });
      return jsonResultWithDrift(data, { rootPath });
    },
  );
}
