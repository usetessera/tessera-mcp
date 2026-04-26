import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve, relative } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { ARCHITECTURE_FILENAME, Layer } from "../../shared/constants/constants.js";
import type { ArchitectureElement, ArchitectureTree } from "../../shared/types/types.js";
import { buildArchitectureTree, flattenTree, getElementByPath } from "../../core/tree/tree.js";
import { parseArchitectureMd } from "../../core/parser/parser.js";
import { loadConfig, type ServerContext } from "../../core/config/config.js";
import {
  handleCheckLinks,
  handleFindMixedLayers,
  handleFindOrphans,
  handleValidateFiles,
  handleValidateStaleness,
} from "../validation/validation.js";
import { handleScaffoldExistingCodebase } from "../scaffold/scaffold.js";
import { handlePrepareProtocolBootstrap } from "../protocols/protocols.js";
import { jsonResultWithDrift } from "../../core/drift/drift.js";

const execFileAsync = promisify(execFile);

type DiagramKind =
  | "flowchart"
  | "system-map"
  | "dependency-graph"
  | "ownership-map"
  | "tag-map"
  | "staleness-report"
  | "file-coverage-report"
  | "context-view"
  | "container-view"
  | "component-view";

export async function handleReviewArchitectureDrift(args: { rootPath: string }) {
  const rootPath = resolve(args.rootPath);
  const [stale, orphans, brokenLinks, mixedLayers, fileDrift] = await Promise.all([
    handleValidateStaleness({ rootPath }),
    handleFindOrphans({ rootPath }),
    handleCheckLinks({ rootPath }),
    handleFindMixedLayers({ rootPath }),
    handleValidateFiles({ rootPath }),
  ]);

  const plan: { priority: "high" | "medium" | "low"; category: string; path: string; action: string }[] = [];

  for (const item of brokenLinks.brokenLinks) {
    plan.push({
      priority: "high",
      category: "broken-link",
      path: item.sourcePath,
      action: `Fix or remove ${item.direction} link to ${item.targetPath}.`,
    });
  }
  for (const item of mixedLayers.mixedLayers) {
    plan.push({
      priority: "high",
      category: "mixed-layers",
      path: item.parentPath,
      action: `Restructure children so they share one layer type: ${item.layersFound.join(", ")}.`,
    });
  }
  for (const item of fileDrift.modules) {
    const parts = [
      item.undocumentedFiles.length ? `${item.undocumentedFiles.length} undocumented file(s)` : "",
      item.missingFiles.length ? `${item.missingFiles.length} missing documented file(s)` : "",
      item.filesMissingPinningRationale.length ? `${item.filesMissingPinningRationale.length} missing pinning rationale(s)` : "",
    ].filter(Boolean);
    plan.push({
      priority: "medium",
      category: "file-drift",
      path: item.relativePath,
      action: `Update ## Files: ${parts.join(", ")}.`,
    });
  }
  for (const item of stale.staleElements) {
    plan.push({
      priority: "medium",
      category: "stale-doc",
      path: item.relativePath,
      action: "Review changed code and update architecture.md semantics if behavior, interfaces, or dependencies changed.",
    });
  }
  for (const item of orphans.orphans) {
    plan.push({
      priority: "low",
      category: "orphan",
      path: item.path,
      action: `Create architecture.md or mark folder as pass-through. Suggested layer: ${item.suggestedLayer}.`,
    });
  }

  return {
    summary: {
      stale: stale.staleCount,
      untracked: stale.untrackedCount,
      orphans: orphans.orphanCount,
      brokenLinks: brokenLinks.brokenCount,
      mixedLayers: mixedLayers.mixedCount,
      fileDrift: fileDrift.driftedModules,
    },
    plan,
    raw: { stale, orphans, brokenLinks, mixedLayers, fileDrift },
  };
}

export async function handleUpdateStaleDocumentation(args: {
  rootPath: string;
  elementPath?: string;
  applyFileSections?: boolean;
}) {
  const rootPath = resolve(args.rootPath);
  const config = await loadConfig(rootPath);
  const tree = await buildArchitectureTree(rootPath, config);
  const elements = flattenTree(tree).filter((el) =>
    args.elementPath
      ? normalize(el.relativePath) === normalize(args.elementPath) ||
        normalize(el.relativePath).startsWith(`${normalize(args.elementPath)}/`)
      : true,
  );

  const fileDrift = await handleValidateFiles({ rootPath });
  const stale = await handleValidateStaleness({ rootPath });
  const drafts: {
    elementPath: string;
    name: string;
    reasons: string[];
    currentContent: string;
    proposedContent: string;
    applied: boolean;
    semanticReviewRequired: boolean;
  }[] = [];

  for (const el of elements) {
    const drift = fileDrift.modules.find((m) => normalize(m.relativePath) === normalize(el.relativePath));
    const staleEntry = stale.staleElements.find((s) => normalize(s.relativePath) === normalize(el.relativePath));
    if (!drift && !staleEntry) continue;

    const archPath = join(el.path, ARCHITECTURE_FILENAME);
    let currentContent = "";
    try {
      currentContent = await readFile(archPath, "utf-8");
    } catch {
      continue;
    }

    const reasons: string[] = [];
    if (drift) {
      if (drift.undocumentedFiles.length) reasons.push(`Undocumented files: ${drift.undocumentedFiles.join(", ")}`);
      if (drift.missingFiles.length) reasons.push(`Documented files no longer on disk: ${drift.missingFiles.join(", ")}`);
      if (drift.filesMissingPinningRationale.length) reasons.push(`Missing pinning rationales: ${drift.filesMissingPinningRationale.join(", ")}`);
    }
    if (staleEntry) reasons.push("Code changed after architecture.md; semantic review required.");

    const proposedContent = drift
      ? replaceFilesSection(currentContent, el)
      : currentContent;
    const shouldApply = !!args.applyFileSections && proposedContent !== currentContent;

    if (shouldApply) {
      await writeFile(archPath, proposedContent, "utf-8");
    }

    drafts.push({
      elementPath: el.relativePath,
      name: el.name,
      reasons,
      currentContent,
      proposedContent,
      applied: shouldApply,
      semanticReviewRequired: !!staleEntry,
    });
  }

  return {
    dryRun: !args.applyFileSections,
    note: "This tool only drafts/applies deterministic ## Files synchronization. Semantic changes still require agent/user review before apply_documentation_updates.",
    drafts,
  };
}

export async function handleApplyDocumentationUpdates(args: {
  rootPath: string;
  updates: { elementPath: string; content: string }[];
  dryRun?: boolean;
}) {
  const rootPath = resolve(args.rootPath);
  const results: { elementPath: string; path: string; applied: boolean; error?: string }[] = [];

  for (const update of args.updates) {
    const archPath = join(rootPath, update.elementPath, ARCHITECTURE_FILENAME);
    try {
      await access(archPath);
      if (!args.dryRun) {
        await writeFile(archPath, update.content, "utf-8");
      }
      results.push({ elementPath: update.elementPath, path: archPath, applied: !args.dryRun });
    } catch (err) {
      results.push({
        elementPath: update.elementPath,
        path: archPath,
        applied: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return { dryRun: !!args.dryRun, updated: results.filter((r) => r.applied).length, results };
}

export async function handlePrepareArchitecturePrSummary(args: { rootPath: string }) {
  const rootPath = resolve(args.rootPath);
  const status = await git(rootPath, ["status", "--short"]);
  const diffNames = await git(rootPath, ["diff", "--name-status", "HEAD"]);
  const changed = diffNames.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const archFiles = changed.filter((line) => line.includes(ARCHITECTURE_FILENAME));
  const codeFiles = changed.filter((line) => !line.includes(ARCHITECTURE_FILENAME));

  let affectedElements: string[] = [];
  try {
    const config = await loadConfig(rootPath);
    const tree = await buildArchitectureTree(rootPath, config);
    const elements = flattenTree(tree);
    const set = new Set<string>();
    for (const line of changed) {
      const file = line.replace(/^[A-Z?]+\s+/, "").replace(/\\/g, "/");
      const owner = findOwningElement(elements, file);
      if (owner) set.add(owner.relativePath);
    }
    affectedElements = [...set].sort();
  } catch {
    affectedElements = [];
  }

  return {
    status,
    changedFiles: changed,
    architectureFilesChanged: archFiles,
    codeFilesChanged: codeFiles,
    affectedElements,
    summaryMarkdown: [
      "## Architecture Impact",
      "",
      `- Architecture files changed: ${archFiles.length}`,
      `- Code/config files changed: ${codeFiles.length}`,
      `- Affected Tessera elements: ${affectedElements.length ? affectedElements.map((p) => `\`${p}\``).join(", ") : "None detected"}`,
      "",
      "## Review Checklist",
      "- Confirm changed code has matching `architecture.md` updates.",
      "- Run `review_architecture_drift` before merge.",
      "- Check dependency links when interfaces or call paths changed.",
    ].join("\n"),
  };
}

export async function handleBootstrapTesseraProject(args: { rootPath: string }) {
  const rootPath = resolve(args.rootPath);
  const [architecture, protocols] = await Promise.all([
    handleScaffoldExistingCodebase({ rootPath }),
    handlePrepareProtocolBootstrap({ rootPath }),
  ]);
  return {
    architecture,
    protocols,
    nextSteps: [
      "Review architecture.proposals with the user, then call apply_scaffold for approved elements.",
      "Ask protocols.questions in chat, then call apply_protocol_bootstrap with explicit user-confirmed answers.",
      "Run review_architecture_drift after bootstrap to catch any missing metadata or file drift.",
    ],
  };
}

export async function handleSuggestArchitectureImprovements(args: { rootPath: string }) {
  const rootPath = resolve(args.rootPath);
  const config = await loadConfig(rootPath);
  const tree = await buildArchitectureTree(rootPath, config);
  const elements = flattenTree(tree);
  const [mixed, links, files, orphans] = await Promise.all([
    handleFindMixedLayers({ rootPath }),
    handleCheckLinks({ rootPath }),
    handleValidateFiles({ rootPath }),
    handleFindOrphans({ rootPath }),
  ]);

  const suggestions: { priority: "high" | "medium" | "low"; path: string; issue: string; recommendation: string }[] = [];
  for (const m of mixed.mixedLayers) {
    suggestions.push({ priority: "high", path: m.parentPath, issue: "Mixed child layers", recommendation: "Restructure so direct architectural children are uniform." });
  }
  for (const b of links.brokenLinks) {
    suggestions.push({ priority: "high", path: b.sourcePath, issue: "Broken dependency link", recommendation: `Fix ${b.direction} target ${b.targetPath}.` });
  }
  for (const el of elements) {
    if (!el.overview.trim()) suggestions.push({ priority: "medium", path: el.relativePath, issue: "Missing overview", recommendation: "Add a concise overview explaining responsibility and boundaries." });
    if (!el.metadata.owner.trim()) suggestions.push({ priority: "low", path: el.relativePath, issue: "Missing owner", recommendation: "Set the Owner metadata field." });
    if (el.metadata.tags.length === 0) suggestions.push({ priority: "low", path: el.relativePath, issue: "No tags", recommendation: "Add tags for search and filtering." });
    if (el.layer === Layer.Module && el.files.length > 12) suggestions.push({ priority: "medium", path: el.relativePath, issue: "Large module", recommendation: "Consider whether this module should become a Component with smaller Module children." });
  }
  for (const m of files.modules) {
    suggestions.push({ priority: "medium", path: m.relativePath, issue: "File drift", recommendation: "Synchronize the ## Files section with files on disk." });
  }
  for (const o of orphans.orphans) {
    suggestions.push({ priority: "low", path: o.path, issue: "Orphan folder", recommendation: `Create architecture.md or treat as pass-through. Suggested layer: ${o.suggestedLayer}.` });
  }

  return { suggestionCount: suggestions.length, suggestions };
}

export async function handleGenerateArchitectureDiagram(args: {
  rootPath: string;
  diagramType: DiagramKind;
  elementPath?: string;
  save?: boolean;
}) {
  const rootPath = resolve(args.rootPath);
  const config = await loadConfig(rootPath);
  const tree = await buildArchitectureTree(rootPath, config);
  const element = args.elementPath ? getElementByPath(tree, args.elementPath) : tree.root;
  if (!element) throw new Error(`Element not found: ${args.elementPath}`);

  const mermaid = await buildDiagram(rootPath, tree, element, args.diagramType);
  let savedPath: string | null = null;
  if (args.save) {
    const filename = `${args.diagramType}.mermaid.md`;
    savedPath = join(element.path, filename);
    await writeFile(savedPath, `# ${titleCase(args.diagramType)}\n\n\`\`\`mermaid\n${mermaid}\n\`\`\`\n`, "utf-8");
  }

  return {
    diagramType: args.diagramType,
    elementPath: element.relativePath,
    mermaid,
    savedPath,
  };
}

export async function handleGenerateSystemMap(args: { rootPath: string; save?: boolean }) {
  return handleGenerateArchitectureDiagram({ rootPath: args.rootPath, diagramType: "system-map", save: args.save });
}

export async function handleValidateReleaseReadiness(args: {
  rootPath: string;
  target: "mcp" | "extension" | "framework" | "protocol";
}) {
  const rootPath = resolve(args.rootPath);
  const checks: { name: string; status: "pass" | "warn" | "fail"; detail: string }[] = [];
  const has = async (rel: string) => pathExists(join(rootPath, rel));

  if (args.target === "mcp") {
    checks.push(await checkFile(rootPath, "package.json", "Package manifest exists"));
    checks.push(await checkFile(rootPath, "README.md", "README exists"));
    checks.push(await checkFile(rootPath, "LICENSE", "LICENSE exists"));
    checks.push(await checkFile(rootPath, "dist/index.js", "Built MCP entrypoint exists"));
    checks.push(await packageJsonCheck(rootPath, "bin", "Package declares a binary"));
  } else if (args.target === "extension") {
    checks.push(await checkFile(rootPath, "package.json", "Extension manifest exists"));
    checks.push(await checkFile(rootPath, "README.md", "README exists"));
    checks.push(await checkFile(rootPath, "LICENSE", "LICENSE exists"));
    checks.push(await checkFile(rootPath, "CHANGELOG.md", "CHANGELOG exists"));
    checks.push(await checkFile(rootPath, "resources/icon.png", "Marketplace PNG icon exists"));
    checks.push(await checkFile(rootPath, "resources/icon.svg", "Activity bar SVG icon exists"));
    checks.push(await checkFile(rootPath, "dist/extension.js", "Built extension host exists"));
    checks.push(await checkFile(rootPath, "dist/webview.js", "Built webview exists"));
    const pkg = await readPackage(rootPath);
    checks.push({
      name: "VS Code extension name",
      status: pkg && typeof pkg.name === "string" && !pkg.name.includes("@") ? "pass" : "fail",
      detail: pkg ? `name=${pkg.name}` : "package.json could not be read",
    });
  } else if (args.target === "framework") {
    checks.push(await checkFile(rootPath, "README.md", "README exists"));
    checks.push(await checkFile(rootPath, "SPEC.md", "SPEC exists"));
    checks.push(await checkFile(rootPath, "LICENSE", "LICENSE exists"));
    checks.push(await checkFile(rootPath, "CONTRIBUTING.md", "CONTRIBUTING exists"));
    checks.push({ name: "Examples", status: await has("examples") ? "pass" : "warn", detail: "examples/ directory" });
  } else {
    checks.push(await checkFile(rootPath, "README.md", "README exists"));
    checks.push(await checkFile(rootPath, "SPEC.md", "SPEC exists"));
    checks.push(await checkFile(rootPath, "LICENSE", "LICENSE exists"));
    checks.push(await checkFile(rootPath, "CONTRIBUTING.md", "CONTRIBUTING exists"));
    checks.push(await checkFile(rootPath, "FAQ.md", "FAQ exists"));
  }

  return {
    target: args.target,
    ready: checks.every((c) => c.status !== "fail"),
    failures: checks.filter((c) => c.status === "fail").length,
    warnings: checks.filter((c) => c.status === "warn").length,
    checks,
  };
}

export function registerWorkflowTools(server: McpServer, ctx: ServerContext): void {
  const rootPathSchema = z.string().optional().describe(`Absolute path to the project root. Optional — defaults to the server's configured root (${ctx.defaultRootPath}).`);
  const resolveRoot = (rootPath: string | undefined) => rootPath ?? ctx.defaultRootPath;

  server.tool("review_architecture_drift", "Aggregates stale docs, orphan folders, broken links, mixed layers, and file drift into a prioritized update plan.", { rootPath: rootPathSchema }, async (args) => {
    const rootPath = resolveRoot(args.rootPath);
    return jsonResultWithDrift(await handleReviewArchitectureDrift({ rootPath }), { rootPath });
  });

  server.tool("update_stale_documentation", "Plans documentation updates for stale/drifted elements. By default this is a dry run; set applyFileSections=true to apply only deterministic ## Files synchronization.", {
    rootPath: rootPathSchema,
    elementPath: z.string().optional(),
    applyFileSections: z.boolean().optional(),
  }, async (args) => {
    const rootPath = resolveRoot(args.rootPath);
    return jsonResultWithDrift(await handleUpdateStaleDocumentation({ rootPath, elementPath: args.elementPath, applyFileSections: args.applyFileSections }), { rootPath, elementPath: args.elementPath });
  });

  server.tool("apply_documentation_updates", "Applies exact reviewed replacement content to architecture.md files. Use after update_stale_documentation or human/agent review.", {
    rootPath: rootPathSchema,
    updates: z.array(z.object({ elementPath: z.string(), content: z.string() })),
    dryRun: z.boolean().optional(),
  }, async (args) => {
    const rootPath = resolveRoot(args.rootPath);
    return jsonResultWithDrift(await handleApplyDocumentationUpdates({ rootPath, updates: args.updates, dryRun: args.dryRun }), { rootPath });
  });

  server.tool("prepare_architecture_pr_summary", "Summarizes architecture-relevant Git changes for PR descriptions and review checklists.", { rootPath: rootPathSchema }, async (args) => {
    const rootPath = resolveRoot(args.rootPath);
    return jsonResultWithDrift(await handlePrepareArchitecturePrSummary({ rootPath }), { rootPath });
  });

  server.tool("bootstrap_tessera_project", "Combines architecture scaffold proposal and protocol bootstrap preparation into one guided project bootstrap response.", { rootPath: rootPathSchema }, async (args) => {
    const rootPath = resolveRoot(args.rootPath);
    return jsonResultWithDrift(await handleBootstrapTesseraProject({ rootPath }), { rootPath });
  });

  server.tool("suggest_architecture_improvements", "Detects awkward layer modeling, missing metadata, broad modules, drift, broken links, and orphan folders.", { rootPath: rootPathSchema }, async (args) => {
    const rootPath = resolveRoot(args.rootPath);
    return jsonResultWithDrift(await handleSuggestArchitectureImprovements({ rootPath }), { rootPath });
  });

  server.tool("generate_architecture_diagram", "Generates deterministic Mermaid diagram specs from architecture.md metadata. Can optionally save as a .mermaid.md file.", {
    rootPath: rootPathSchema,
    diagramType: z.enum(["flowchart", "system-map", "dependency-graph", "ownership-map", "tag-map", "staleness-report", "file-coverage-report", "context-view", "container-view", "component-view"]),
    elementPath: z.string().optional(),
    save: z.boolean().optional(),
  }, async (args) => {
    const rootPath = resolveRoot(args.rootPath);
    return jsonResultWithDrift(await handleGenerateArchitectureDiagram({ rootPath, diagramType: args.diagramType, elementPath: args.elementPath, save: args.save }), { rootPath, elementPath: args.elementPath });
  });

  server.tool("generate_system_map", "Convenience command that generates a Mermaid system map from the current architecture tree.", {
    rootPath: rootPathSchema,
    save: z.boolean().optional(),
  }, async (args) => {
    const rootPath = resolveRoot(args.rootPath);
    return jsonResultWithDrift(await handleGenerateSystemMap({ rootPath, save: args.save }), { rootPath });
  });

  server.tool("validate_release_readiness", "Checks package/spec metadata and build artifacts for MCP, extension, framework, or protocol release readiness.", {
    rootPath: rootPathSchema,
    target: z.enum(["mcp", "extension", "framework", "protocol"]),
  }, async (args) => {
    const rootPath = resolveRoot(args.rootPath);
    return jsonResultWithDrift(await handleValidateReleaseReadiness({ rootPath, target: args.target }), { rootPath });
  });
}

async function buildDiagram(rootPath: string, tree: ArchitectureTree, element: ArchitectureElement, type: DiagramKind): Promise<string> {
  const elements = flattenTree(tree);
  if (type === "dependency-graph") return dependencyGraph(elements);
  if (type === "ownership-map") return ownershipMap(elements);
  if (type === "tag-map") return tagMap(elements);
  if (type === "staleness-report") return stalenessReport(rootPath);
  if (type === "file-coverage-report") return fileCoverageReport(rootPath);
  if (type === "system-map") return systemMap(tree);
  return hierarchyGraph(element, type);
}

function hierarchyGraph(root: ArchitectureElement, type: string): string {
  const lines = ["graph TD", `  ${nodeId(root.relativePath)}["${escapeLabel(root.name)}<br/>${root.layer}"]`];
  const walk = (el: ArchitectureElement) => {
    for (const child of el.children) {
      lines.push(`  ${nodeId(el.relativePath)} --> ${nodeId(child.relativePath)}["${escapeLabel(child.name)}<br/>${child.layer}"]`);
      walk(child);
    }
  };
  walk(root);
  if (lines.length === 2) lines.push(`  ${nodeId(root.relativePath)} --> files["${root.files.length} file(s)"]`);
  lines.push(`  %% ${type}`);
  return lines.join("\n");
}

function systemMap(tree: ArchitectureTree): string {
  const root = tree.root;
  const systems = root.layer === Layer.Landscape ? root.children : [root];
  const lines = ["graph LR", `  landscape["${escapeLabel(root.name)}<br/>${root.layer}"]`];
  for (const sys of systems) {
    lines.push(`  landscape --> ${nodeId(sys.relativePath)}["${escapeLabel(sys.name)}<br/>${sys.layer}"]`);
  }
  addDependencyLines(lines, systems.length ? flattenFrom(systems) : [root]);
  return lines.join("\n");
}

function dependencyGraph(elements: ArchitectureElement[]): string {
  const lines = ["graph LR"];
  for (const el of elements) lines.push(`  ${nodeId(el.relativePath)}["${escapeLabel(el.name)}"]`);
  addDependencyLines(lines, elements);
  return lines.join("\n");
}

function ownershipMap(elements: ArchitectureElement[]): string {
  const lines = ["graph TD"];
  const byOwner = new Map<string, ArchitectureElement[]>();
  for (const el of elements) {
    const owner = el.metadata.owner || "Unowned";
    if (!byOwner.has(owner)) byOwner.set(owner, []);
    byOwner.get(owner)!.push(el);
  }
  let i = 0;
  for (const [owner, owned] of byOwner) {
    const ownerId = `owner_${i++}`;
    lines.push(`  ${ownerId}["${escapeLabel(owner)}"]`);
    for (const el of owned) lines.push(`  ${ownerId} --> ${nodeId(el.relativePath)}["${escapeLabel(el.name)}<br/>${el.layer}"]`);
  }
  return lines.join("\n");
}

function tagMap(elements: ArchitectureElement[]): string {
  const lines = ["graph TD"];
  const tags = new Map<string, ArchitectureElement[]>();
  for (const el of elements) {
    for (const tag of el.metadata.tags) {
      if (!tags.has(tag)) tags.set(tag, []);
      tags.get(tag)!.push(el);
    }
  }
  for (const [tag, tagged] of tags) {
    const tagId = `tag_${slug(tag)}`;
    lines.push(`  ${tagId}["#${escapeLabel(tag)}"]`);
    for (const el of tagged) lines.push(`  ${tagId} --> ${nodeId(el.relativePath)}["${escapeLabel(el.name)}"]`);
  }
  if (tags.size === 0) lines.push('  none["No tags found"]');
  return lines.join("\n");
}

async function stalenessReport(rootPath: string): Promise<string> {
  const stale = await handleValidateStaleness({ rootPath });
  const lines = ["graph TD", `  summary["Stale: ${stale.staleCount}<br/>Untracked: ${stale.untrackedCount}"]`];
  for (const item of stale.staleElements) lines.push(`  summary --> ${nodeId(item.relativePath)}["${escapeLabel(item.name)}<br/>stale"]`);
  for (const item of stale.untrackedElements) lines.push(`  summary --> ${nodeId(item.relativePath)}["${escapeLabel(item.name)}<br/>untracked"]`);
  return lines.join("\n");
}

async function fileCoverageReport(rootPath: string): Promise<string> {
  const files = await handleValidateFiles({ rootPath });
  const lines = ["graph TD", `  summary["Clean: ${files.cleanModules}<br/>Drifted: ${files.driftedModules}"]`];
  for (const item of files.modules) {
    lines.push(`  summary --> ${nodeId(item.relativePath)}["${escapeLabel(item.name)}<br/>${item.documentedCount}/${item.totalOnDisk} documented"]`);
  }
  return lines.join("\n");
}

function addDependencyLines(lines: string[], elements: ArchitectureElement[]): void {
  const byArchPath = new Map<string, ArchitectureElement>();
  for (const el of elements) {
    byArchPath.set(`${normalize(el.relativePath)}/${ARCHITECTURE_FILENAME}`.replace(/^\.\//, ""), el);
  }
  for (const el of elements) {
    for (const dep of el.metadata.dependsOn) {
      const normalized = normalize(join(normalize(el.relativePath), dep));
      const target = byArchPath.get(normalized) ?? byArchPath.get(normalize(dep));
      if (target) lines.push(`  ${nodeId(el.relativePath)} --> ${nodeId(target.relativePath)}`);
    }
  }
}

function replaceFilesSection(content: string, element: ArchitectureElement): string {
  const fileLines = element.files
    .map((file) => `- \`${file.name}\` — ${file.description || (element.layer === Layer.Module ? "TODO: describe this file." : "TODO: add pinning rationale.")}`)
    .join("\n");
  const section = `## Files\n${fileLines || "- None."}`;
  if (/^## Files\s*\n[\s\S]*?(?=^##\s|\s*$)/m.test(content)) {
    return content.replace(/^## Files\s*\n[\s\S]*?(?=^##\s|\s*$)/m, section);
  }
  const metadataIndex = content.search(/^## Metadata\s*$/m);
  if (metadataIndex >= 0) return `${content.slice(0, metadataIndex).trimEnd()}\n\n${section}\n\n${content.slice(metadataIndex)}`;
  return `${content.trimEnd()}\n\n${section}\n`;
}

async function checkFile(rootPath: string, relPath: string, name: string) {
  const exists = await pathExists(join(rootPath, relPath));
  return { name, status: exists ? "pass" as const : "fail" as const, detail: relPath };
}

async function packageJsonCheck(rootPath: string, field: string, name: string) {
  const pkg = await readPackage(rootPath);
  const ok = !!pkg && Object.prototype.hasOwnProperty.call(pkg, field);
  return { name, status: ok ? "pass" as const : "fail" as const, detail: ok ? `${field} present` : `${field} missing` };
}

async function readPackage(rootPath: string): Promise<Record<string, unknown> | null> {
  try {
    return JSON.parse(await readFile(join(rootPath, "package.json"), "utf-8")) as Record<string, unknown>;
  } catch {
    return null;
  }
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function git(cwd: string, args: string[]): Promise<string> {
  try {
    const { stdout } = await execFileAsync("git", args, { cwd });
    return stdout;
  } catch {
    return "";
  }
}

function findOwningElement(elements: ArchitectureElement[], filePath: string): ArchitectureElement | null {
  const file = normalize(filePath);
  const sorted = [...elements].sort((a, b) => normalize(b.relativePath).split("/").length - normalize(a.relativePath).split("/").length);
  for (const el of sorted) {
    const rel = normalize(el.relativePath);
    if (rel === "." || rel === "") continue;
    if (file === rel || file.startsWith(`${rel}/`)) return el;
  }
  return null;
}

function flattenFrom(elements: ArchitectureElement[]): ArchitectureElement[] {
  return elements.flatMap((el) => [el, ...flattenFrom(el.children)]);
}

function nodeId(path: string): string {
  return `n_${slug(path || "root")}`;
}

function slug(value: string): string {
  return value.replace(/[^a-zA-Z0-9]/g, "_").replace(/^_+|_+$/g, "") || "root";
}

function normalize(path: string): string {
  return path.replace(/\\/g, "/").replace(/^\.\//, "").replace(/\/$/, "");
}

function escapeLabel(value: string): string {
  return value.replace(/"/g, '\\"');
}

function titleCase(value: string): string {
  return value.replace(/-/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}
