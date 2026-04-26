import { resolve, join, relative } from "node:path";
import { readdir, access } from "node:fs/promises";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { simpleGit } from "simple-git";
import { ARCHITECTURE_FILENAME, Layer } from "../../shared/constants/constants.js";
import { buildArchitectureTree, flattenTree } from "../../core/tree/tree.js";
import { parseArchitectureMd } from "../../core/parser/parser.js";
import { loadConfig, type ServerContext } from "../../core/config/config.js";
import { matchesIgnorePattern } from "../../core/tree/ignore.js";

// ── Result types ──

export interface StaleResult {
  path: string;
  relativePath: string;
  name: string;
  codeLastModified: string;
  archLastModified: string;
}

export interface UntrackedElement {
  path: string;
  relativePath: string;
  name: string;
}

export interface ValidateStalenessResult {
  staleCount: number;
  staleElements: StaleResult[];
  untrackedCount: number;
  untrackedElements: UntrackedElement[];
}

export interface OrphanResult {
  path: string;
  suggestedLayer: string;
  depth: number;
}

export interface FindOrphansResult {
  orphanCount: number;
  orphans: OrphanResult[];
}

export interface BrokenLinkResult {
  sourcePath: string;
  sourceName: string;
  targetPath: string;
  direction: "dependsOn" | "dependedBy";
}

export interface CheckLinksResult {
  brokenCount: number;
  brokenLinks: BrokenLinkResult[];
}

export interface MixedLayerEntry {
  parentPath: string;
  parentName: string;
  layersFound: string[];
  children: { name: string; relativePath: string; layer: string }[];
}

export interface FindMixedLayersResult {
  mixedCount: number;
  mixedLayers: MixedLayerEntry[];
  suggestion: string;
}

export interface ModuleDrift {
  path: string;
  relativePath: string;
  name: string;
  layer: string;
  undocumentedFiles: string[];
  missingFiles: string[];
  /**
   * Non-Module layers only (ADR-016). Files listed in `## Files` whose
   * description is blank — the "pinning rationale" is missing. Soft warning
   * only; does not block tools that use this result to gate on drift.
   */
  filesMissingPinningRationale: string[];
  documentedCount: number;
  totalOnDisk: number;
}

export interface ValidateFilesResult {
  /**
   * Legacy name retained for wire-format compatibility. Post-ADR-016 this
   * counts every element with file-level tracking, not only L4 Modules.
   */
  totalModules: number;
  cleanModules: number;
  driftedModules: number;
  modules: ModuleDrift[];
  suggestion: string;
}

// ── Internal: git timestamp map ──

/**
 * Builds a map of relative file path → latest git commit ISO date using a
 * single batched git log command. Much faster than per-file git.log() calls.
 */
async function buildGitTimestampMap(
  git: ReturnType<typeof simpleGit>,
): Promise<Map<string, string>> {
  const timestamps = new Map<string, string>();
  try {
    const raw = await git.raw([
      "log",
      "--format=%aI",
      "--name-only",
      "--diff-filter=ACDMRT",
    ]);

    const lines = raw.split("\n");
    let currentDate = "";
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      if (/^\d{4}-\d{2}-\d{2}T/.test(trimmed)) {
        currentDate = trimmed;
      } else if (currentDate && trimmed) {
        const normalized = trimmed.replace(/\\/g, "/");
        if (!timestamps.has(normalized)) {
          timestamps.set(normalized, currentDate);
        }
      }
    }
  } catch {
    // Git operation failed — return empty map
  }
  return timestamps;
}

// ── Pure handlers ──

export async function handleValidateStaleness(args: {
  rootPath: string;
}): Promise<ValidateStalenessResult> {
  const absRoot = resolve(args.rootPath);
  const git = simpleGit(absRoot);
  const config = await loadConfig(absRoot);
  const tree = await buildArchitectureTree(absRoot, config);
  const elements = flattenTree(tree);
  const stale: StaleResult[] = [];
  const untracked: UntrackedElement[] = [];

  const gitTimestamps = await buildGitTimestampMap(git);

  for (const el of elements) {
    if (el.relativePath === ".") continue;
    if (el.layer === Layer.Docs) continue;

    try {
      const archRelPath = join(el.relativePath, ARCHITECTURE_FILENAME).replace(/\\/g, "/");
      const archDateStr = gitTimestamps.get(archRelPath);

      if (!archDateStr) {
        untracked.push({
          path: el.path,
          relativePath: el.relativePath,
          name: el.name,
        });
        continue;
      }

      const archDate = new Date(archDateStr);
      const entries = await readdir(el.path, { withFileTypes: true });
      const codeFiles = entries.filter(
        (e) => e.isFile() && e.name !== ARCHITECTURE_FILENAME,
      );

      let latestCodeDate: Date | null = null;
      for (const file of codeFiles) {
        const fileRelPath = join(el.relativePath, file.name).replace(/\\/g, "/");
        const fileDateStr = gitTimestamps.get(fileRelPath);
        if (fileDateStr) {
          const fileDate = new Date(fileDateStr);
          if (!latestCodeDate || fileDate > latestCodeDate) {
            latestCodeDate = fileDate;
          }
        }
      }

      if (latestCodeDate && latestCodeDate > archDate) {
        stale.push({
          path: el.path,
          relativePath: el.relativePath,
          name: el.name,
          codeLastModified: latestCodeDate.toISOString(),
          archLastModified: archDate.toISOString(),
        });
      }
    } catch {
      // Filesystem read failed for this element
    }
  }

  return {
    staleCount: stale.length,
    staleElements: stale,
    untrackedCount: untracked.length,
    untrackedElements: untracked,
  };
}

export async function handleFindOrphans(args: {
  rootPath: string;
}): Promise<FindOrphansResult> {
  const absRoot = resolve(args.rootPath);
  const config = await loadConfig(absRoot);
  const mode = config.workspaceMode ?? "context";
  const orphans: OrphanResult[] = [];

  // Landscape mode shifts the depth → layer mapping: root is Landscape,
  // depth 1 is Context, depth 2 is Container, and so on. Context mode is
  // the original mapping where root is Context and depth 1 is Container.
  const layersByDepth =
    mode === "landscape"
      ? ["Landscape", "Context", "Container", "Component", "Module"]
      : ["Context", "Container", "Component", "Module"];
  const maxLayerIndex = layersByDepth.length - 1;

  async function walk(dirPath: string, depth: number): Promise<void> {
    const entries = await readdir(dirPath, { withFileTypes: true });

    const hasArchMd = entries.some(
      (e) => e.isFile() && e.name === ARCHITECTURE_FILENAME,
    );
    const hasCode = entries.some(
      (e) => e.isFile() && e.name !== ARCHITECTURE_FILENAME && !e.name.startsWith("."),
    );

    if (!hasArchMd && hasCode && depth > 0) {
      orphans.push({
        path: relative(absRoot, dirPath) || ".",
        suggestedLayer: layersByDepth[Math.min(depth, maxLayerIndex)],
        depth,
      });
    }

    const subdirs = entries.filter(
      (e) => e.isDirectory() && !matchesIgnorePattern(e.name, config.ignore),
    );
    for (const sub of subdirs) {
      await walk(join(dirPath, sub.name), depth + 1);
    }
  }

  await walk(absRoot, 0);
  return { orphanCount: orphans.length, orphans };
}

export async function handleCheckLinks(args: {
  rootPath: string;
}): Promise<CheckLinksResult> {
  const absRoot = resolve(args.rootPath);
  const config = await loadConfig(absRoot);
  const tree = await buildArchitectureTree(absRoot, config);
  const elements = flattenTree(tree);
  const broken: BrokenLinkResult[] = [];

  for (const el of elements) {
    for (const dep of el.metadata.dependsOn) {
      if (dep.toLowerCase() === "none") continue;
      const resolved = resolveLink(el.path, dep);
      if (resolved && !(await fileExists(resolved))) {
        broken.push({
          sourcePath: el.relativePath,
          sourceName: el.name,
          targetPath: dep,
          direction: "dependsOn",
        });
      }
    }
    for (const dep of el.metadata.dependedBy) {
      if (dep.toLowerCase() === "none") continue;
      const resolved = resolveLink(el.path, dep);
      if (resolved && !(await fileExists(resolved))) {
        broken.push({
          sourcePath: el.relativePath,
          sourceName: el.name,
          targetPath: dep,
          direction: "dependedBy",
        });
      }
    }
  }

  return { brokenCount: broken.length, brokenLinks: broken };
}

export async function handleFindMixedLayers(args: {
  rootPath: string;
}): Promise<FindMixedLayersResult> {
  const absRoot = resolve(args.rootPath);
  const config = await loadConfig(absRoot);
  const tree = await buildArchitectureTree(absRoot, config);
  const elements = flattenTree(tree);
  const mixed: MixedLayerEntry[] = [];

  for (const el of elements) {
    if (el.children.length < 2) continue;

    const nonDocsChildren = el.children.filter((c) => c.layer !== Layer.Docs);
    if (nonDocsChildren.length < 2) continue;

    const layerSet = new Set(nonDocsChildren.map((c) => c.layer));
    if (layerSet.size > 1) {
      mixed.push({
        parentPath: el.relativePath,
        parentName: el.name,
        layersFound: [...layerSet],
        children: el.children.map((c) => ({
          name: c.name,
          relativePath: c.relativePath,
          layer: c.layer,
        })),
      });
    }
  }

  return {
    mixedCount: mixed.length,
    mixedLayers: mixed,
    suggestion: mixed.length > 0
      ? "Each element should contain children of only one layer type. Modules (L4) are the only layer that should contain code files. If an element has both Components and Modules as children, consider grouping the Modules into Component folders."
      : "No mixed-layer violations found.",
  };
}

export async function handleValidateFiles(args: {
  rootPath: string;
}): Promise<ValidateFilesResult> {
  const absRoot = resolve(args.rootPath);
  const config = await loadConfig(absRoot);
  const tree = await buildArchitectureTree(absRoot, config);
  const elements = flattenTree(tree);

  const drifted: ModuleDrift[] = [];
  let totalModules = 0;
  let cleanModules = 0;

  for (const el of elements) {
    // Post-ADR-016: any element with files participates. Tree-builder already
    // decides which elements get file collection (Module, Docs, or any layer
    // that has a ## Files section). Validation follows that decision.
    if (el.files.length === 0) continue;
    totalModules++;

    const undocumented = el.files
      .filter((f) => !f.documented)
      .map((f) => f.name);

    let missingFiles: string[] = [];
    let filesMissingPinningRationale: string[] = [];
    try {
      const parsed = await parseArchitectureMd(join(el.path, ARCHITECTURE_FILENAME));
      const documentedEntries = parsed.files ?? [];
      const documentedNames = documentedEntries.map((f) => f.name);
      const onDiskNames = new Set(el.files.map((f) => f.name));
      missingFiles = documentedNames.filter((name) => !onDiskNames.has(name));

      // Pinning-rationale soft check (ADR-016): non-Module layers should
      // include a short "why is this file here?" note in each description.
      // Module and Docs descriptions are optional and not flagged.
      if (el.layer !== Layer.Module && el.layer !== Layer.Docs) {
        filesMissingPinningRationale = documentedEntries
          .filter((f) => !f.description || !f.description.trim())
          .map((f) => f.name);
      }
    } catch {
      // Parse error — skip missing-file and rationale checks
    }

    const documentedCount = el.files.filter((f) => f.documented).length;

    const hasDrift =
      undocumented.length > 0 ||
      missingFiles.length > 0 ||
      filesMissingPinningRationale.length > 0;

    if (hasDrift) {
      drifted.push({
        path: el.path,
        relativePath: el.relativePath,
        name: el.name,
        layer: el.layer,
        undocumentedFiles: undocumented,
        missingFiles,
        filesMissingPinningRationale,
        documentedCount,
        totalOnDisk: el.files.length,
      });
    } else {
      cleanModules++;
    }
  }

  return {
    totalModules,
    cleanModules,
    driftedModules: drifted.length,
    modules: drifted,
    suggestion: drifted.length > 0
      ? "Update the ## Files section in each element's architecture.md to match the files on disk. Use update_element to add missing file descriptions, remove entries for deleted files, or add a pinning rationale to each non-Module file description (see ADR-016)."
      : "All ## Files sections are in sync with the filesystem.",
  };
}

// ── MCP registration ──

export function registerValidationTools(server: McpServer, ctx: ServerContext): void {
  const rootPathSchema = z
    .string()
    .optional()
    .describe(
      `Absolute path to the project root. Optional — defaults to the server's configured root (${ctx.defaultRootPath}).`,
    );
  const resolveRoot = (rootPath: string | undefined) => rootPath ?? ctx.defaultRootPath;

  server.tool(
    "validate_staleness",
    "Compares git timestamps of code files vs. architecture.md to identify stale documentation. Returns elements where code has been modified more recently than their architecture.md.",
    { rootPath: rootPathSchema },
    async (args) => jsonResult(await handleValidateStaleness({ rootPath: resolveRoot(args.rootPath) })),
  );

  server.tool(
    "find_orphans",
    "Finds folders that contain code files but no architecture.md. Returns paths with suggested C4 layer based on depth.",
    { rootPath: rootPathSchema },
    async (args) => jsonResult(await handleFindOrphans({ rootPath: resolveRoot(args.rootPath) })),
  );

  server.tool(
    "check_links",
    "Validates that all dependency links in architecture.md files resolve to existing elements. Returns broken links with source, target, and direction.",
    { rootPath: rootPathSchema },
    async (args) => jsonResult(await handleCheckLinks({ rootPath: resolveRoot(args.rootPath) })),
  );

  server.tool(
    "find_mixed_layers",
    "Finds elements whose direct children span multiple layer types (e.g., both Components and Modules at the same level). The uniform children rule requires all children of an element to be the same layer type — code should only live in Modules, and each level of the hierarchy should contain one type of element for a clean drill-down experience.",
    { rootPath: rootPathSchema },
    async (args) => jsonResult(await handleFindMixedLayers({ rootPath: resolveRoot(args.rootPath) })),
  );

  server.tool(
    "validate_files",
    "Reports modules where on-disk files diverge from the ## Files section in architecture.md. Detects undocumented files (on disk but not in ## Files), missing files (in ## Files but not on disk), and reports coverage per module.",
    { rootPath: rootPathSchema },
    async (args) => jsonResult(await handleValidateFiles({ rootPath: resolveRoot(args.rootPath) })),
  );
}

function resolveLink(elementDir: string, link: string): string | null {
  if (!link || link === "None" || link === "none") return null;
  return join(elementDir, link);
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

function jsonResult(data: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
}
