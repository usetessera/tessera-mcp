import { access, mkdir, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { ServerContext } from "../../core/config/config.js";

const PROTOCOL_DIR = ".tessera-protocols";

const REQUIRED_FILES = [
  "README.md",
  "capability/user.md",
  "capability/agent.md",
  "goals/_active.md",
  "goals/_archive.md",
  "comprehension/_index.md",
  "context/current-session.md",
] as const;

export interface BootstrapQuestion {
  id: string;
  question: string;
  records: string[];
  required: boolean;
}

export interface PrepareProtocolBootstrapResult {
  protocolRoot: string;
  installed: boolean;
  existingFiles: string[];
  missingFiles: string[];
  questions: BootstrapQuestion[];
  suggestedWorkflow: string[];
}

export interface BootstrapGoal {
  title: string;
  outcome: string;
  successCriteria: string[];
  nonGoals?: string[];
  priority?: "high" | "medium" | "low";
  targetDate?: string | null;
  system?: string | null;
}

export interface BootstrapCapability {
  title: string;
  system?: string;
  evidenceLevel: "demonstrated" | "declared" | "uncertain";
  evidence: string;
  limits?: string;
}

export interface BootstrapAgentCapability {
  title: string;
  system?: string;
  limit: string;
}

export interface BootstrapComprehensionRecord {
  title: string;
  filename?: string;
  system?: string | null;
  element: string;
  elementType?: "tessera-element" | "concept" | "cross-cutting";
  claimedUnderstanding: string;
  knownGaps?: string;
  assumptionsToVerify?: string;
  evidence?: string[];
  evidenceLevel?: "demonstrated" | "declared" | "uncertain";
  status?: "proposed" | "confirmed";
  source?: "agent" | "user" | "joint";
}

export interface ApplyProtocolBootstrapResult {
  protocolRoot: string;
  dryRun: boolean;
  created: string[];
  skipped: string[];
}

export async function handlePrepareProtocolBootstrap(args: {
  rootPath: string;
}): Promise<PrepareProtocolBootstrapResult> {
  const absRoot = resolve(args.rootPath);
  const protocolRoot = join(absRoot, PROTOCOL_DIR);
  const existingFiles: string[] = [];
  const missingFiles: string[] = [];

  for (const relPath of REQUIRED_FILES) {
    if (await pathExists(join(protocolRoot, relPath))) {
      existingFiles.push(relPath);
    } else {
      missingFiles.push(relPath);
    }
  }

  return {
    protocolRoot,
    installed: missingFiles.length === 0,
    existingFiles,
    missingFiles,
    questions: [
      {
        id: "project_identity",
        question: "What is this project called, and is it a single system or a multi-system workspace?",
        records: ["README.md", "context/current-session.md"],
        required: true,
      },
      {
        id: "active_goals",
        question: "What are the current goals, success criteria, and explicit non-goals?",
        records: ["goals/_active.md"],
        required: true,
      },
      {
        id: "user_capability",
        question: "What should the agent know about your familiarity with the languages, frameworks, and domain in this project?",
        records: ["capability/user.md"],
        required: true,
      },
      {
        id: "agent_limits",
        question: "Are there project-specific areas where agents commonly make wrong assumptions?",
        records: ["capability/agent.md", "comprehension/*.md"],
        required: false,
      },
      {
        id: "high_risk_comprehension",
        question: "Which architectural areas, naming conventions, or workflows are most important for an agent to understand correctly?",
        records: ["comprehension/_index.md", "comprehension/*.md"],
        required: false,
      },
      {
        id: "session_context",
        question: "What should the first working session focus on, and what assumptions remain open?",
        records: ["context/current-session.md"],
        required: true,
      },
    ],
    suggestedWorkflow: [
      "Call prepare_protocol_bootstrap to inspect the current protocol installation.",
      "Ask the returned questions in the chat and let the user correct the framing.",
      "Call apply_protocol_bootstrap only with answers the user explicitly supplied or confirmed.",
      "Use scaffold_existing_codebase/apply_scaffold separately for architecture.md initialization when needed.",
    ],
  };
}

export async function handleApplyProtocolBootstrap(args: {
  rootPath: string;
  projectName: string;
  userId?: string;
  goals: BootstrapGoal[];
  userCapabilities?: BootstrapCapability[];
  agentCapabilities?: BootstrapAgentCapability[];
  comprehensionRecords?: BootstrapComprehensionRecord[];
  sessionScope?: string;
  openAssumptions?: string[];
  dryRun?: boolean;
  overwrite?: boolean;
}): Promise<ApplyProtocolBootstrapResult> {
  const absRoot = resolve(args.rootPath);
  const protocolRoot = join(absRoot, PROTOCOL_DIR);
  const today = new Date().toISOString().slice(0, 10);
  const userId = args.userId?.trim() || "user";
  const comprehensionRecords = args.comprehensionRecords ?? [];

  const files = new Map<string, string>();
  files.set("README.md", protocolReadme(args.projectName));
  files.set("capability/user.md", userCapabilityContent(args.userCapabilities ?? [], today));
  files.set("capability/agent.md", agentCapabilityContent(args.agentCapabilities ?? [], today));
  files.set("goals/_active.md", activeGoalsContent(args.goals, today, userId));
  files.set("goals/_archive.md", "# Archived Goals\n\nCompleted or superseded goals move here.\n");
  files.set("comprehension/_index.md", comprehensionIndexContent(comprehensionRecords));
  files.set(
    "context/current-session.md",
    currentSessionContent(args.projectName, args.sessionScope, args.openAssumptions ?? []),
  );

  for (const record of comprehensionRecords) {
    files.set(
      `comprehension/${comprehensionFilename(record)}`,
      comprehensionRecordContent(record, today, userId),
    );
  }

  const created: string[] = [];
  const skipped: string[] = [];

  if (!args.dryRun) {
    await mkdir(protocolRoot, { recursive: true });
  }

  for (const [relPath, content] of files) {
    const absPath = join(protocolRoot, relPath);
    const exists = await pathExists(absPath);
    if (exists && !args.overwrite) {
      skipped.push(relPath);
      continue;
    }

    created.push(relPath);
    if (!args.dryRun) {
      await mkdir(dirname(absPath), { recursive: true });
      await writeFile(absPath, content, "utf-8");
    }
  }

  return {
    protocolRoot,
    dryRun: !!args.dryRun,
    created,
    skipped,
  };
}

export function registerProtocolTools(server: McpServer, ctx: ServerContext): void {
  const rootPathSchema = z
    .string()
    .optional()
    .describe(
      `Absolute path to the project root. Optional — defaults to the server's configured root (${ctx.defaultRootPath}).`,
    );
  const resolveRoot = (rootPath: string | undefined) => rootPath ?? ctx.defaultRootPath;

  server.tool(
    "prepare_protocol_bootstrap",
    "Inspects the workspace and returns the guided questions an agent should ask before initializing Tessera Protocols. Does not write files.",
    { rootPath: rootPathSchema },
    async (args) => jsonResult(await handlePrepareProtocolBootstrap({ rootPath: resolveRoot(args.rootPath) })),
  );

  server.tool(
    "apply_protocol_bootstrap",
    "Creates a baseline .tessera-protocols folder from explicit user-confirmed bootstrap answers. Existing files are skipped unless overwrite=true.",
    {
      rootPath: rootPathSchema,
      projectName: z.string().describe("Project or workspace name supplied by the user"),
      userId: z.string().optional().describe("Identifier to use in confirmed_by fields"),
      goals: z.array(z.object({
        title: z.string(),
        outcome: z.string(),
        successCriteria: z.array(z.string()),
        nonGoals: z.array(z.string()).optional(),
        priority: z.enum(["high", "medium", "low"]).optional(),
        targetDate: z.string().nullable().optional(),
        system: z.string().nullable().optional(),
      })).describe("User-confirmed active goals"),
      userCapabilities: z.array(z.object({
        title: z.string(),
        system: z.string().optional(),
        evidenceLevel: z.enum(["demonstrated", "declared", "uncertain"]),
        evidence: z.string(),
        limits: z.string().optional(),
      })).optional(),
      agentCapabilities: z.array(z.object({
        title: z.string(),
        system: z.string().optional(),
        limit: z.string(),
      })).optional(),
      comprehensionRecords: z.array(z.object({
        title: z.string(),
        filename: z.string().optional(),
        system: z.string().nullable().optional(),
        element: z.string(),
        elementType: z.enum(["tessera-element", "concept", "cross-cutting"]).optional(),
        claimedUnderstanding: z.string(),
        knownGaps: z.string().optional(),
        assumptionsToVerify: z.string().optional(),
        evidence: z.array(z.string()).optional(),
        evidenceLevel: z.enum(["demonstrated", "declared", "uncertain"]).optional(),
        status: z.enum(["proposed", "confirmed"]).optional(),
        source: z.enum(["agent", "user", "joint"]).optional(),
      })).optional(),
      sessionScope: z.string().optional(),
      openAssumptions: z.array(z.string()).optional(),
      dryRun: z.boolean().optional(),
      overwrite: z.boolean().optional(),
    },
    async (args) => jsonResult(await handleApplyProtocolBootstrap({
      rootPath: resolveRoot(args.rootPath),
      projectName: args.projectName,
      userId: args.userId,
      goals: args.goals,
      userCapabilities: args.userCapabilities,
      agentCapabilities: args.agentCapabilities,
      comprehensionRecords: args.comprehensionRecords,
      sessionScope: args.sessionScope,
      openAssumptions: args.openAssumptions,
      dryRun: args.dryRun,
      overwrite: args.overwrite,
    })),
  );
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

function protocolReadme(projectName: string): string {
  return `# ${projectName} Protocols

This folder contains Tessera Protocols records for this workspace.

Agents should read:

1. \`goals/_active.md\`
2. \`capability/user.md\`
3. \`capability/agent.md\`
4. \`context/current-session.md\`
5. Relevant records in \`comprehension/\`

Do not create another .tessera-protocols folder elsewhere in the workspace.
`;
}

function activeGoalsContent(goals: BootstrapGoal[], today: string, userId: string): string {
  if (goals.length === 0) {
    return "# Active Goals\n\nNo active goals have been confirmed yet.\n";
  }

  return goals.map((goal) => `---
protocol: goals
system: ${yamlNullable(goal.system)}
status: confirmed
source: user
created: ${today}
confirmed_by: ${userId}
confirmed_at: ${today}
parent_goal: null
target_date: ${yamlNullable(goal.targetDate)}
priority: ${goal.priority ?? "high"}
---

# ${goal.title}

## Outcome
${goal.outcome}

## Success criteria
${markdownList(goal.successCriteria)}

## Non-goals
${markdownList(goal.nonGoals ?? [])}

## Notes
Created during guided Tessera Protocols bootstrap.
`).join("\n---\n\n");
}

function userCapabilityContent(capabilities: BootstrapCapability[], today: string): string {
  if (capabilities.length === 0) {
    return "# User Capability\n\nNo user capability baseline has been confirmed yet.\n";
  }

  return `# User Capability

${capabilities.map((capability) => `## ${capability.title}
- **System:** ${capability.system ?? "all"}
- **Evidence level:** ${capability.evidenceLevel}
- **Evidence:** ${capability.evidence}
- **Limits:** ${capability.limits ?? "None recorded."}
- **Last updated:** ${today}`).join("\n\n")}
`;
}

function agentCapabilityContent(capabilities: BootstrapAgentCapability[], today: string): string {
  if (capabilities.length === 0) {
    return "# Agent Capability\n\nNo project-specific agent limits have been recorded yet.\n";
  }

  return `# Agent Capability

${capabilities.map((capability) => `## ${capability.title}
- **System:** ${capability.system ?? "all"}
- **Limit:** ${capability.limit}
- **Last updated:** ${today}`).join("\n\n")}
`;
}

function comprehensionIndexContent(records: BootstrapComprehensionRecord[]): string {
  if (records.length === 0) {
    return "# Comprehension Index\n\nNo comprehension records have been created yet.\n";
  }

  return `# Comprehension Index

${records.map((record) => `- [${record.title}](./${comprehensionFilename(record)}) — ${record.element}`).join("\n")}
`;
}

function currentSessionContent(
  projectName: string,
  sessionScope: string | undefined,
  openAssumptions: string[],
): string {
  return `# Session: ${new Date().toISOString().slice(0, 16).replace("T", " ")}

## Scope
${sessionScope ?? `Bootstrap Tessera Protocols for ${projectName}.`}

## Decisions made this session
- Initialized baseline protocol records from user-confirmed bootstrap answers.

## Pending
- Review generated records and supersede anything that changes after real project work begins.

## Last action
Created initial .tessera-protocols structure.

## Open assumptions
${markdownList(openAssumptions)}
`;
}

function comprehensionRecordContent(
  record: BootstrapComprehensionRecord,
  today: string,
  userId: string,
): string {
  const status = record.status ?? (record.source === "user" ? "confirmed" : "proposed");
  const source = record.source ?? (status === "confirmed" ? "user" : "agent");
  const confirmedBy = status === "confirmed" ? userId : "null";
  const confirmedAt = status === "confirmed" ? today : "null";

  return `---
protocol: comprehension
system: ${yamlNullable(record.system)}
element: ${record.element}
element_type: ${record.elementType ?? "tessera-element"}
status: ${status}
source: ${source}
created: ${today}
confirmed_by: ${confirmedBy}
confirmed_at: ${confirmedAt}
supersedes: null
evidence_level: ${record.evidenceLevel ?? "declared"}
evidence:
${(record.evidence ?? ["Captured during guided bootstrap."]).map((item) => `  - "${escapeYamlString(item)}"`).join("\n")}
---

# ${record.title}: User Comprehension

## Claimed understanding
${record.claimedUnderstanding}

## Known gaps
${record.knownGaps ?? "None recorded."}

## Assumptions to verify
${record.assumptionsToVerify ?? "None recorded."}

## Notes
Created during guided Tessera Protocols bootstrap.
`;
}

function comprehensionFilename(record: BootstrapComprehensionRecord): string {
  if (record.filename) return record.filename.endsWith(".md") ? record.filename : `${record.filename}.md`;
  const system = record.system ?? "workspace";
  const topic = record.title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return `${system}--${topic || "comprehension"}.md`;
}

function markdownList(items: string[]): string {
  if (items.length === 0) return "- None recorded.";
  return items.map((item) => `- ${item}`).join("\n");
}

function yamlNullable(value: string | null | undefined): string {
  if (!value) return "null";
  return value;
}

function escapeYamlString(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function jsonResult(data: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
}
