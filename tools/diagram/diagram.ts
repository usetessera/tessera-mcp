import { resolve, join, relative } from "node:path";
import { readdir, readFile, writeFile } from "node:fs/promises";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { ARCHITECTURE_FILENAME, Layer } from "../../shared/constants/constants.js";
import { parseArchitectureMd } from "../../core/parser/parser.js";
import { buildArchitectureTree, getElementByPath } from "../../core/tree/tree.js";
import { loadConfig, type ServerContext } from "../../core/config/config.js";
import { jsonResultWithDrift } from "../../core/drift/drift.js";

/** Diagram types available per C4 layer (from project plan Section 7) */
export const DIAGRAM_TYPES: Record<string, { name: string; description: string }[]> = {
  [Layer.Context]: [
    { name: "business-capability-map", description: "Which business functions exist, before software is introduced" },
    { name: "actor-journey", description: "How external users navigate across multiple systems over time" },
    { name: "trust-boundary", description: "Security zones and attack surfaces across system boundaries" },
  ],
  [Layer.Container]: [
    { name: "data-flow", description: "How data moves between containers, with transformation steps" },
    { name: "sequence-diagram", description: "Runtime interaction between containers for a specific use case" },
    { name: "event-flow", description: "Topics, queues, producers and consumers across containers" },
    { name: "deployment-diagram", description: "How containers map onto infrastructure (nodes, cloud regions, k8s)" },
    { name: "network-topology", description: "Firewall rules, VPCs, subnets — the actual network layer" },
  ],
  [Layer.Component]: [
    { name: "state-machine", description: "Lifecycle of a key entity managed within a component" },
    { name: "activity-diagram", description: "Step-by-step process logic within a service" },
    { name: "sequence-diagram", description: "Internal call chains within a container for a specific operation" },
    { name: "domain-model", description: "Aggregates, entities, value objects — the DDD view" },
  ],
  [Layer.Module]: [
    { name: "class-diagram", description: "OOP structure inside a component" },
    { name: "erd", description: "Data schema and relationships, usually per-service" },
    { name: "dependency-graph", description: "Module/package coupling within a codebase" },
  ],
};

// ── Result types ──

export interface PrepareDiagramContextResult {
  element: {
    name: string;
    layer: string;
    overview: string;
    tags: string[];
    dependsOn: string[];
    dependedBy: string[];
  };
  diagramType: { name: string; description: string };
  architectureMd: string;
  codeFiles: Record<string, string>;
  children: { name: string; layer: string; overview: string; tags: string[] }[];
  instruction: string;
}

export interface SaveDiagramResult {
  saved: true;
  path: string;
  filename: string;
}

export interface ListedDiagram {
  filename: string;
  type: string;
  path: string;
}

// ── Pure handlers ──

export async function handlePrepareDiagramContext(args: {
  rootPath: string;
  elementPath: string;
  diagramType: string;
}): Promise<PrepareDiagramContextResult> {
  const absRoot = resolve(args.rootPath);
  const config = await loadConfig(absRoot);
  const tree = await buildArchitectureTree(absRoot, config);
  const element = getElementByPath(tree, args.elementPath);

  if (!element) {
    throw new Error(`Element not found at '${args.elementPath}'`);
  }

  const archMdPath = join(element.path, ARCHITECTURE_FILENAME);
  let archContent = "";
  try {
    const parsed = await parseArchitectureMd(archMdPath);
    archContent = parsed.raw;
  } catch {
    archContent = "(no architecture.md found)";
  }

  const codeContents: Record<string, string> = {};
  try {
    const entries = await readdir(element.path, { withFileTypes: true });
    const codeFiles = entries.filter(
      (e) => e.isFile() && e.name !== ARCHITECTURE_FILENAME && !e.name.endsWith(".mermaid.md"),
    );
    for (const file of codeFiles.slice(0, 10)) {
      try {
        const content = await readFile(join(element.path, file.name), "utf-8");
        codeContents[file.name] = content.length > 5000
          ? content.slice(0, 5000) + "\n... (truncated)"
          : content;
      } catch {
        // Binary or unreadable file — skip
      }
    }
  } catch {
    // Directory read error
  }

  const layerTypes = DIAGRAM_TYPES[element.layer] ?? [];
  const typeInfo = layerTypes.find((t) => t.name === args.diagramType);

  return {
    element: {
      name: element.name,
      layer: element.layer,
      overview: element.overview,
      tags: element.metadata.tags,
      dependsOn: element.metadata.dependsOn,
      dependedBy: element.metadata.dependedBy,
    },
    diagramType: {
      name: args.diagramType,
      description: typeInfo?.description ?? "Unknown diagram type",
    },
    architectureMd: archContent,
    codeFiles: codeContents,
    children: element.children.map((c) => ({
      name: c.name,
      layer: c.layer,
      overview: c.overview,
      tags: c.metadata.tags,
    })),
    instruction: `Generate a Mermaid diagram of type "${args.diagramType}" for the element "${element.name}". Use the architecture.md content, code files, and relationship data provided above to create an accurate diagram. Output ONLY the Mermaid syntax (starting with the diagram type declaration like "graph TD", "sequenceDiagram", etc.).`,
  };
}

export async function handleSaveDiagram(args: {
  elementPath: string;
  diagramType: string;
  mermaidContent: string;
}): Promise<SaveDiagramResult> {
  const absPath = resolve(args.elementPath);
  const filename = `${args.diagramType}.mermaid.md`;
  const filePath = join(absPath, filename);
  const title = args.diagramType.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  const content = `# ${title}\n\n\`\`\`mermaid\n${args.mermaidContent}\n\`\`\`\n`;
  await writeFile(filePath, content, "utf-8");
  return { saved: true, path: filePath, filename };
}

export function handleListDiagramTypes(args: {
  layer: string;
}): { name: string; description: string }[] {
  return DIAGRAM_TYPES[args.layer] ?? [];
}

export async function handleListDiagrams(args: {
  elementPath: string;
}): Promise<ListedDiagram[]> {
  const absPath = resolve(args.elementPath);
  try {
    const entries = await readdir(absPath, { withFileTypes: true });
    return entries
      .filter((e) => e.isFile() && e.name.endsWith(".mermaid.md"))
      .map((e) => ({
        filename: e.name,
        type: e.name.replace(".mermaid.md", ""),
        path: join(absPath, e.name),
      }));
  } catch {
    return [];
  }
}

// ── MCP registration ──

export function registerDiagramTools(server: McpServer, ctx: ServerContext): void {
  const rootPathSchema = z
    .string()
    .optional()
    .describe(
      `Absolute path to the project root. Optional — defaults to the server's configured root (${ctx.defaultRootPath}).`,
    );

  server.tool(
    "prepare_diagram_context",
    "Assembles all relevant context for generating a Mermaid diagram: element overview, code contents, relationship data, and diagram type description. Returns structured data the AI agent uses to generate the Mermaid syntax.",
    {
      rootPath: rootPathSchema,
      elementPath: z.string().describe("Relative path to the element from root"),
      diagramType: z.string().describe("Diagram type identifier (e.g., 'sequence-diagram', 'data-flow')"),
    },
    async (args) => {
      const rootPath = args.rootPath ?? ctx.defaultRootPath;
      try {
        const data = await handlePrepareDiagramContext({
          rootPath,
          elementPath: args.elementPath,
          diagramType: args.diagramType,
        });
        return jsonResultWithDrift(data, { rootPath, elementPath: args.elementPath });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return errorResult(`Error: ${message}`);
      }
    },
  );

  server.tool(
    "save_diagram",
    "Saves a Mermaid diagram to an element's folder as [diagram-type].mermaid.md",
    {
      elementPath: z.string().describe("Absolute path to the element folder"),
      diagramType: z.string().describe("Diagram type identifier (used as filename prefix)"),
      mermaidContent: z.string().describe("The Mermaid diagram syntax to save"),
    },
    async (args) => {
      const rootPath = ctx.defaultRootPath;
      try {
        const data = await handleSaveDiagram(args);
        return jsonResultWithDrift(data, {
          rootPath,
          elementPath: toRelative(rootPath, args.elementPath),
        });
      } catch (err) {
        return errorResult(`Error saving diagram: ${err}`);
      }
    },
  );

  server.tool(
    "list_diagram_types",
    "Returns the available supplementary diagram types for a given C4 layer",
    {
      layer: z.enum(["Context", "Container", "Component", "Module", "Docs"]).describe("C4 layer"),
    },
    async (args) => jsonResultWithDrift(handleListDiagramTypes(args), { rootPath: ctx.defaultRootPath }),
  );

  server.tool(
    "list_diagrams",
    "Lists existing .mermaid.md diagram files for a given element",
    {
      elementPath: z.string().describe("Absolute path to the element folder"),
    },
    async (args) => {
      const rootPath = ctx.defaultRootPath;
      const data = await handleListDiagrams(args);
      return jsonResultWithDrift(data, {
        rootPath,
        elementPath: toRelative(rootPath, args.elementPath),
      });
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

function errorResult(message: string) {
  return {
    content: [{ type: "text" as const, text: message }],
    isError: true as const,
  };
}
