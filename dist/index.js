#!/usr/bin/env node

// index.ts
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

// ../shared/dist/constants/constants.js
var PRODUCT_NAME = "Tessera";
var CONFIG_DIR = ".tessera";
var ARCHITECTURE_FILENAME = "architecture.md";
var AGENT_RULES_FILE = "agent-rules.md";
var CONFIG_FILE = "config.yaml";
var Layer;
(function(Layer3) {
  Layer3["Landscape"] = "Landscape";
  Layer3["Context"] = "Context";
  Layer3["Container"] = "Container";
  Layer3["Component"] = "Component";
  Layer3["Module"] = "Module";
  Layer3["Docs"] = "Docs";
})(Layer || (Layer = {}));
var DEFAULT_WORKSPACE_MODE = "context";
var DEPTH_TO_LAYER = {
  0: Layer.Context,
  1: Layer.Container,
  2: Layer.Component
};
var DEPTH_TO_LAYER_LANDSCAPE = {
  0: Layer.Landscape,
  1: Layer.Context,
  2: Layer.Container,
  3: Layer.Component
};
function depthToLayerMap(mode) {
  return mode === "landscape" ? DEPTH_TO_LAYER_LANDSCAPE : DEPTH_TO_LAYER;
}
var LAYER_DESCRIPTIONS = {
  [Layer.Landscape]: "A system landscape \u2014 a workspace of multiple software systems",
  [Layer.Context]: "The system and its external actors/systems",
  [Layer.Container]: "Deployable units (services, apps, databases)",
  [Layer.Component]: "Logical groupings within a container",
  [Layer.Module]: "Atomic code units (no subfolders)",
  [Layer.Docs]: "Non-architecture documentation (ADRs, guides, diagrams)"
};
var DEFAULT_IGNORE_PATTERNS = [
  // Version control & editors
  ".git",
  ".vscode",
  ".idea",
  ".claude",
  // JS/TS ecosystem
  "node_modules",
  "dist",
  "build",
  "out",
  "coverage",
  ".next",
  ".nuxt",
  ".output",
  ".svelte-kit",
  ".turbo",
  ".parcel-cache",
  ".angular",
  // Python
  "__pycache__",
  ".venv",
  "venv",
  // Game engines
  ".godot",
  ".import",
  // Mobile / native
  "Pods",
  ".gradle",
  ".expo",
  ".dart_tool",
  ".pub-cache",
  // Rust / Go / Java
  "target",
  "vendor",
  // Tessera internal
  CONFIG_DIR,
  ".architecturemode",
  "adrs",
  "docs",
  // Test files
  "*.test.*",
  "*.spec.*"
];
var TOOL_NAMES = {
  GET_ARCHITECTURE_TREE: "get_architecture_tree",
  GET_ELEMENT: "get_element",
  SEARCH_ELEMENTS: "search_elements",
  CREATE_ELEMENT: "create_element",
  UPDATE_ELEMENT: "update_element",
  GET_RULES: "get_rules",
  GET_ELEMENT_CONTEXT: "get_element_context",
  GET_ELEMENT_FOR_FILE: "get_element_for_file"
};
var DIAGRAM_TYPES_BY_LAYER = {
  [Layer.Landscape]: ["landscape", "system-context"],
  [Layer.Context]: ["system-context", "landscape"],
  [Layer.Container]: ["container", "deployment"],
  [Layer.Component]: ["component", "sequence"],
  [Layer.Module]: ["class", "sequence", "flowchart"],
  [Layer.Docs]: []
};

// core/config/config.ts
import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import yaml from "js-yaml";
async function loadConfig(rootPath) {
  const configPath = join(rootPath, CONFIG_DIR, CONFIG_FILE);
  try {
    const content = await readFile(configPath, "utf-8");
    const parsed = yaml.load(content);
    if (!parsed || typeof parsed !== "object") {
      return defaultConfig();
    }
    const ignoreValue = parsed.ignore ?? parsed.ignores;
    const modeValue = parsed.workspace_mode ?? parsed.workspaceMode;
    const workspaceMode = parseWorkspaceMode(modeValue);
    const userPatterns = Array.isArray(ignoreValue) ? ignoreValue.filter((item) => typeof item === "string") : [];
    const suppressRaw = parsed.suppress_drift_warnings ?? parsed.suppressDriftWarnings;
    const suppressDriftWarnings = suppressRaw === true;
    return {
      ignore: mergeIgnorePatterns(userPatterns),
      workspaceMode,
      suppressDriftWarnings
    };
  } catch {
    return defaultConfig();
  }
}
function mergeIgnorePatterns(userPatterns) {
  return [.../* @__PURE__ */ new Set([...DEFAULT_IGNORE_PATTERNS, ...userPatterns])];
}
function parseWorkspaceMode(value) {
  if (typeof value !== "string") return DEFAULT_WORKSPACE_MODE;
  const normalized = value.trim().toLowerCase();
  if (normalized === "landscape") return "landscape";
  if (normalized === "context") return "context";
  return DEFAULT_WORKSPACE_MODE;
}
function resolveDefaultRootPath(argv, env, cwd) {
  const flagIdx = argv.findIndex((a) => a === "--root");
  if (flagIdx >= 0 && argv[flagIdx + 1]) return resolve(argv[flagIdx + 1]);
  const eqArg = argv.find((a) => a.startsWith("--root="));
  if (eqArg) return resolve(eqArg.slice("--root=".length));
  if (env.TESSERA_ROOT && env.TESSERA_ROOT.trim()) return resolve(env.TESSERA_ROOT);
  return resolve(cwd);
}
function defaultConfig() {
  return {
    ignore: [...DEFAULT_IGNORE_PATTERNS],
    workspaceMode: DEFAULT_WORKSPACE_MODE
  };
}

// tools/read/read.ts
import { resolve as resolve4, join as join4 } from "node:path";
import { z as z2 } from "zod";

// core/tree/tree.ts
import { readdir, stat } from "node:fs/promises";
import { join as join2, relative, basename } from "node:path";

// core/parser/parser.ts
import { readFile as readFile2 } from "node:fs/promises";

// ../shared/dist/parser/parser.js
function parseContent(content) {
  const name = extractTitle(content);
  const overview = extractSection(content, "Overview") ?? "";
  const metadata = extractMetadata(content);
  return {
    name,
    overview,
    metadata,
    externalSystems: extractSection(content, "External Systems") ?? void 0,
    actors: extractSection(content, "Actors") ?? void 0,
    technology: extractSection(content, "Technology") ?? void 0,
    apiSurface: extractSection(content, "API Surface") ?? void 0,
    deployment: extractSection(content, "Deployment") ?? void 0,
    interfaces: extractSection(content, "Interfaces") ?? void 0,
    functions: extractSection(content, "Functions") ?? void 0,
    classes: extractSection(content, "Classes") ?? void 0,
    keyDecisions: extractSection(content, "Key Decisions") ?? void 0,
    files: parseFilesSection(extractSection(content, "Files")),
    raw: content
  };
}
function extractTitle(content) {
  const match = content.match(/^#\s+(.+)$/m);
  return match ? match[1].trim() : "Untitled";
}
function extractSection(content, sectionName) {
  const regex = new RegExp(`^##\\s+${escapeRegex(sectionName)}\\s*\\n([\\s\\S]*?)(?=^##\\s|$(?!\\n))`, "m");
  const match = content.match(regex);
  return match ? match[1].trim() : null;
}
function extractMetadata(content) {
  const metadataSection = extractSection(content, "Metadata");
  const defaults = {
    layer: Layer.Module,
    tags: [],
    dependsOn: [],
    dependedBy: [],
    owner: "",
    status: "Planned"
  };
  if (!metadataSection)
    return defaults;
  return {
    layer: parseLayer(extractField(metadataSection, "Layer")),
    tags: parseTags(extractField(metadataSection, "Tags")),
    dependsOn: parseDependencyLinks(extractField(metadataSection, "Depends on")),
    dependedBy: parseDependencyLinks(extractField(metadataSection, "Depended by")),
    owner: extractField(metadataSection, "Owner") ?? "",
    status: parseStatus(extractField(metadataSection, "Status"))
  };
}
function extractField(section, key) {
  const regex = new RegExp(`-\\s+\\*\\*${escapeRegex(key)}\\*\\*:\\s*(.+)`, "i");
  const match = section.match(regex);
  return match ? match[1].trim() : null;
}
function parseLayer(value) {
  if (!value)
    return Layer.Module;
  const normalized = value.trim();
  if (normalized in Layer)
    return normalized;
  return Layer.Module;
}
function parseTags(value) {
  if (!value)
    return [];
  const inner = value.replace(/^\[|\]$/g, "").trim();
  if (!inner)
    return [];
  return inner.split(",").map((t) => t.trim()).filter(Boolean);
}
function parseDependencyLinks(value) {
  if (!value || value.toLowerCase() === "none")
    return [];
  const links = [];
  const linkRegex = /\[([^\]]*)\]\(([^)]+)\)/g;
  let match;
  while ((match = linkRegex.exec(value)) !== null) {
    links.push(match[2]);
  }
  if (links.length === 0 && value.trim()) {
    return value.split(",").map((s) => s.trim()).filter(Boolean);
  }
  return links;
}
function parseStatus(value) {
  if (!value)
    return "Planned";
  const normalized = value.trim();
  if (normalized.startsWith("Active"))
    return "Active";
  if (normalized.startsWith("Deprecated"))
    return "Deprecated";
  return "Planned";
}
function parseFilesSection(section) {
  if (!section)
    return [];
  const files = [];
  const lineRegex = /^-\s+`([^`]+)`(?:\s*[—–-]\s*(.*))?\s*$/gm;
  let match;
  while ((match = lineRegex.exec(section)) !== null) {
    const name = match[1].trim();
    const ext = name.includes(".") ? name.split(".").pop() ?? "" : "";
    files.push({
      name,
      extension: ext,
      description: (match[2] ?? "").trim(),
      documented: true
    });
  }
  return files;
}
function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// core/parser/parser.ts
async function parseArchitectureMd(filePath) {
  const content = await readFile2(filePath, "utf-8");
  return parseContent(content);
}

// ../shared/dist/utils/utils.js
function flattenElements(root) {
  const result = [root];
  for (const child of root.children) {
    result.push(...flattenElements(child));
  }
  return result;
}
function matchesIgnorePattern(name, patterns) {
  for (const pattern of patterns) {
    if (pattern === name)
      return true;
    if (pattern.includes("*")) {
      const regex = new RegExp("^" + pattern.replace(/\./g, "\\.").replace(/\*/g, ".*") + "$");
      if (regex.test(name))
        return true;
    }
  }
  return false;
}

// core/tree/tree.ts
async function buildArchitectureTree(rootPath, config) {
  const mode = config.workspaceMode ?? DEFAULT_WORKSPACE_MODE;
  const root = await traverseDirectory(rootPath, rootPath, 0, config, mode);
  return { root, rootPath };
}
async function hasArchitectureMd(dirPath) {
  try {
    await stat(join2(dirPath, ARCHITECTURE_FILENAME));
    return true;
  } catch {
    return false;
  }
}
async function traverseDirectory(dirPath, rootPath, depth, config, mode) {
  const name = depth === 0 ? basename(rootPath) : basename(dirPath);
  const relPath = relative(rootPath, dirPath) || ".";
  const archMdPath = join2(dirPath, ARCHITECTURE_FILENAME);
  let overview = "";
  let metadata = defaultMetadata(Layer.Module);
  let documentedFiles = [];
  try {
    const parsed = await parseArchitectureMd(archMdPath);
    overview = parsed.overview;
    metadata = parsed.metadata;
    documentedFiles = parsed.files ?? [];
  } catch {
  }
  const entries = await readdir(dirPath, { withFileTypes: true });
  const subdirs = entries.filter((e) => e.isDirectory());
  const children = [];
  for (const sub of subdirs) {
    const subPath = join2(dirPath, sub.name);
    const subHasArch = await hasArchitectureMd(subPath);
    const ignored = matchesIgnorePattern(sub.name, config.ignore);
    if (ignored && !subHasArch) continue;
    if (subHasArch || depth === 0) {
      const child = await traverseDirectory(subPath, rootPath, depth + 1, config, mode);
      children.push(child);
    } else {
      const promoted = await collectPromotedChildren(subPath, rootPath, depth + 1, config, mode);
      children.push(...promoted);
    }
  }
  const depthMap = depthToLayerMap(mode);
  const layer = children.length > 0 ? depthMap[depth] ?? Layer.Component : Layer.Module;
  const finalLayer = metadata.layer !== Layer.Module ? metadata.layer : layer;
  let files = [];
  if (finalLayer === Layer.Docs) {
    files = collectDocsFiles(entries);
  } else {
    files = mergeFileInfo(entries, documentedFiles);
  }
  return {
    name,
    path: dirPath,
    relativePath: relPath,
    layer: finalLayer,
    overview,
    metadata: { ...metadata, layer: finalLayer },
    children,
    files
  };
}
async function collectPromotedChildren(dirPath, rootPath, depth, config, mode) {
  const entries = await readdir(dirPath, { withFileTypes: true });
  const subdirs = entries.filter((e) => e.isDirectory());
  const promoted = [];
  for (const sub of subdirs) {
    const subPath = join2(dirPath, sub.name);
    const subHasArch = await hasArchitectureMd(subPath);
    const ignored = matchesIgnorePattern(sub.name, config.ignore);
    if (ignored && !subHasArch) continue;
    if (subHasArch) {
      const child = await traverseDirectory(subPath, rootPath, depth, config, mode);
      promoted.push(child);
    } else {
      const deeper = await collectPromotedChildren(subPath, rootPath, depth, config, mode);
      promoted.push(...deeper);
    }
  }
  return promoted;
}
function collectDocsFiles(entries) {
  const files = [];
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    if (entry.name === ARCHITECTURE_FILENAME) continue;
    if (entry.name.endsWith(".mermaid.md")) continue;
    const ext = entry.name.includes(".") ? entry.name.split(".").pop() ?? "" : "";
    files.push({
      name: entry.name,
      extension: ext,
      description: "",
      documented: true
    });
  }
  return files;
}
function mergeFileInfo(entries, documentedFiles) {
  const docMap = new Map(documentedFiles.map((f) => [f.name, f]));
  const files = [];
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    if (entry.name === ARCHITECTURE_FILENAME) continue;
    if (entry.name.endsWith(".mermaid.md")) continue;
    const doc = docMap.get(entry.name);
    const ext = entry.name.includes(".") ? entry.name.split(".").pop() ?? "" : "";
    files.push({
      name: entry.name,
      extension: ext,
      description: doc?.description ?? "",
      documented: !!doc
    });
  }
  return files;
}
function getElementByPath(tree, relativePath) {
  const normalized = relativePath.replace(/\\/g, "/");
  if (normalized === "." || normalized === "") return tree.root;
  return findElement(tree.root, normalized);
}
function findElement(element, relativePath) {
  const normalized = element.relativePath.replace(/\\/g, "/");
  if (normalized === relativePath) return element;
  for (const child of element.children) {
    const found = findElement(child, relativePath);
    if (found) return found;
  }
  return null;
}
function flattenTree(tree) {
  return flattenElements(tree.root);
}
function defaultMetadata(layer) {
  return {
    layer,
    tags: [],
    dependsOn: [],
    dependedBy: [],
    owner: "",
    status: "Planned"
  };
}

// core/drift/drift.ts
import { resolve as resolve3 } from "node:path";
import { simpleGit as simpleGit2 } from "simple-git";

// tools/validation/validation.ts
import { resolve as resolve2, join as join3, relative as relative2 } from "node:path";
import { readdir as readdir2, access } from "node:fs/promises";
import { z } from "zod";
import { simpleGit } from "simple-git";
async function buildGitTimestampMap(git2) {
  const timestamps = /* @__PURE__ */ new Map();
  try {
    const raw = await git2.raw([
      "log",
      "--format=%aI",
      "--name-only",
      "--diff-filter=ACDMRT"
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
  }
  return timestamps;
}
async function handleValidateStaleness(args) {
  const absRoot = resolve2(args.rootPath);
  const git2 = simpleGit(absRoot);
  const config = await loadConfig(absRoot);
  const tree = await buildArchitectureTree(absRoot, config);
  const elements = flattenTree(tree);
  const stale = [];
  const untracked = [];
  const gitTimestamps = await buildGitTimestampMap(git2);
  for (const el of elements) {
    if (el.relativePath === ".") continue;
    if (el.layer === Layer.Docs) continue;
    try {
      const archRelPath = join3(el.relativePath, ARCHITECTURE_FILENAME).replace(/\\/g, "/");
      const archDateStr = gitTimestamps.get(archRelPath);
      if (!archDateStr) {
        untracked.push({
          path: el.path,
          relativePath: el.relativePath,
          name: el.name
        });
        continue;
      }
      const archDate = new Date(archDateStr);
      const entries = await readdir2(el.path, { withFileTypes: true });
      const codeFiles = entries.filter(
        (e) => e.isFile() && e.name !== ARCHITECTURE_FILENAME
      );
      let latestCodeDate = null;
      for (const file of codeFiles) {
        const fileRelPath = join3(el.relativePath, file.name).replace(/\\/g, "/");
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
          archLastModified: archDate.toISOString()
        });
      }
    } catch {
    }
  }
  return {
    staleCount: stale.length,
    staleElements: stale,
    untrackedCount: untracked.length,
    untrackedElements: untracked
  };
}
async function handleFindOrphans(args) {
  const absRoot = resolve2(args.rootPath);
  const config = await loadConfig(absRoot);
  const mode = config.workspaceMode ?? "context";
  const orphans = [];
  const layersByDepth = mode === "landscape" ? ["Landscape", "Context", "Container", "Component", "Module"] : ["Context", "Container", "Component", "Module"];
  const maxLayerIndex = layersByDepth.length - 1;
  async function walk(dirPath, depth) {
    const entries = await readdir2(dirPath, { withFileTypes: true });
    const hasArchMd = entries.some(
      (e) => e.isFile() && e.name === ARCHITECTURE_FILENAME
    );
    const hasCode = entries.some(
      (e) => e.isFile() && e.name !== ARCHITECTURE_FILENAME && !e.name.startsWith(".")
    );
    if (!hasArchMd && hasCode && depth > 0) {
      orphans.push({
        path: relative2(absRoot, dirPath) || ".",
        suggestedLayer: layersByDepth[Math.min(depth, maxLayerIndex)],
        depth
      });
    }
    const subdirs = entries.filter(
      (e) => e.isDirectory() && !matchesIgnorePattern(e.name, config.ignore)
    );
    for (const sub of subdirs) {
      await walk(join3(dirPath, sub.name), depth + 1);
    }
  }
  await walk(absRoot, 0);
  return { orphanCount: orphans.length, orphans };
}
async function handleCheckLinks(args) {
  const absRoot = resolve2(args.rootPath);
  const config = await loadConfig(absRoot);
  const tree = await buildArchitectureTree(absRoot, config);
  const elements = flattenTree(tree);
  const broken = [];
  for (const el of elements) {
    for (const dep of el.metadata.dependsOn) {
      if (dep.toLowerCase() === "none") continue;
      const resolved = resolveLink(el.path, dep);
      if (resolved && !await fileExists(resolved)) {
        broken.push({
          sourcePath: el.relativePath,
          sourceName: el.name,
          targetPath: dep,
          direction: "dependsOn"
        });
      }
    }
    for (const dep of el.metadata.dependedBy) {
      if (dep.toLowerCase() === "none") continue;
      const resolved = resolveLink(el.path, dep);
      if (resolved && !await fileExists(resolved)) {
        broken.push({
          sourcePath: el.relativePath,
          sourceName: el.name,
          targetPath: dep,
          direction: "dependedBy"
        });
      }
    }
  }
  return { brokenCount: broken.length, brokenLinks: broken };
}
async function handleFindMixedLayers(args) {
  const absRoot = resolve2(args.rootPath);
  const config = await loadConfig(absRoot);
  const tree = await buildArchitectureTree(absRoot, config);
  const elements = flattenTree(tree);
  const mixed = [];
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
          layer: c.layer
        }))
      });
    }
  }
  return {
    mixedCount: mixed.length,
    mixedLayers: mixed,
    suggestion: mixed.length > 0 ? "Each element should contain children of only one layer type. Modules (L4) are the only layer that should contain code files. If an element has both Components and Modules as children, consider grouping the Modules into Component folders." : "No mixed-layer violations found."
  };
}
async function handleValidateFiles(args) {
  const absRoot = resolve2(args.rootPath);
  const config = await loadConfig(absRoot);
  const tree = await buildArchitectureTree(absRoot, config);
  const elements = flattenTree(tree);
  const drifted = [];
  let totalModules = 0;
  let cleanModules = 0;
  for (const el of elements) {
    if (el.files.length === 0) continue;
    totalModules++;
    const undocumented = el.files.filter((f) => !f.documented).map((f) => f.name);
    let missingFiles = [];
    let filesMissingPinningRationale = [];
    try {
      const parsed = await parseArchitectureMd(join3(el.path, ARCHITECTURE_FILENAME));
      const documentedEntries = parsed.files ?? [];
      const documentedNames = documentedEntries.map((f) => f.name);
      const onDiskNames = new Set(el.files.map((f) => f.name));
      missingFiles = documentedNames.filter((name) => !onDiskNames.has(name));
      if (el.layer !== Layer.Module && el.layer !== Layer.Docs) {
        filesMissingPinningRationale = documentedEntries.filter((f) => !f.description || !f.description.trim()).map((f) => f.name);
      }
    } catch {
    }
    const documentedCount = el.files.filter((f) => f.documented).length;
    const hasDrift = undocumented.length > 0 || missingFiles.length > 0 || filesMissingPinningRationale.length > 0;
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
        totalOnDisk: el.files.length
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
    suggestion: drifted.length > 0 ? "Update the ## Files section in each element's architecture.md to match the files on disk. Use update_element to add missing file descriptions, remove entries for deleted files, or add a pinning rationale to each non-Module file description (see ADR-016)." : "All ## Files sections are in sync with the filesystem."
  };
}
function registerValidationTools(server, ctx) {
  const rootPathSchema = z.string().optional().describe(
    `Absolute path to the project root. Optional \u2014 defaults to the server's configured root (${ctx.defaultRootPath}).`
  );
  const resolveRoot = (rootPath) => rootPath ?? ctx.defaultRootPath;
  server.tool(
    "validate_staleness",
    "Compares git timestamps of code files vs. architecture.md to identify stale documentation. Returns elements where code has been modified more recently than their architecture.md.",
    { rootPath: rootPathSchema },
    async (args) => jsonResult(await handleValidateStaleness({ rootPath: resolveRoot(args.rootPath) }))
  );
  server.tool(
    "find_orphans",
    "Finds folders that contain code files but no architecture.md. Returns paths with suggested C4 layer based on depth.",
    { rootPath: rootPathSchema },
    async (args) => jsonResult(await handleFindOrphans({ rootPath: resolveRoot(args.rootPath) }))
  );
  server.tool(
    "check_links",
    "Validates that all dependency links in architecture.md files resolve to existing elements. Returns broken links with source, target, and direction.",
    { rootPath: rootPathSchema },
    async (args) => jsonResult(await handleCheckLinks({ rootPath: resolveRoot(args.rootPath) }))
  );
  server.tool(
    "find_mixed_layers",
    "Finds elements whose direct children span multiple layer types (e.g., both Components and Modules at the same level). The uniform children rule requires all children of an element to be the same layer type \u2014 code should only live in Modules, and each level of the hierarchy should contain one type of element for a clean drill-down experience.",
    { rootPath: rootPathSchema },
    async (args) => jsonResult(await handleFindMixedLayers({ rootPath: resolveRoot(args.rootPath) }))
  );
  server.tool(
    "validate_files",
    "Reports modules where on-disk files diverge from the ## Files section in architecture.md. Detects undocumented files (on disk but not in ## Files), missing files (in ## Files but not on disk), and reports coverage per module.",
    { rootPath: rootPathSchema },
    async (args) => jsonResult(await handleValidateFiles({ rootPath: resolveRoot(args.rootPath) }))
  );
}
function resolveLink(elementDir, link) {
  if (!link || link === "None" || link === "none") return null;
  return join3(elementDir, link);
}
async function fileExists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}
function jsonResult(data) {
  return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
}

// core/drift/drift.ts
var MAX_ITEMS = 10;
async function computeDriftFooter(args) {
  const absRoot = resolve3(args.rootPath);
  let config;
  try {
    config = await loadConfig(absRoot);
  } catch {
    return null;
  }
  if (config.suppressDriftWarnings) return null;
  let tree;
  try {
    tree = await buildArchitectureTree(absRoot, config);
  } catch {
    return null;
  }
  const scope = await resolveScope(absRoot, tree, args.elementPath);
  if (scope.size === 0) return null;
  const items = await collectScopedDrift(absRoot, tree, scope);
  if (items.length === 0) return null;
  return formatFooter(items);
}
async function withDriftFooter(result, args) {
  const footer = await computeDriftFooter(args);
  if (!footer) return result;
  return {
    ...result,
    content: [...result.content, { type: "text", text: footer }]
  };
}
async function jsonResultWithDrift(data, args) {
  const base = {
    content: [{ type: "text", text: JSON.stringify(data, null, 2) }]
  };
  return withDriftFooter(base, args);
}
async function resolveScope(rootPath, tree, explicitElementPath) {
  const scope = /* @__PURE__ */ new Set();
  const elements = flattenTree(tree);
  if (explicitElementPath) {
    const normalized = normalize(explicitElementPath);
    for (const el of elements) {
      const elPath = normalize(el.relativePath);
      if (elPath === normalized || elPath.startsWith(normalized + "/")) {
        scope.add(elPath);
      }
    }
  }
  const dirtyFiles = await gitDirtyFiles(rootPath);
  for (const file of dirtyFiles) {
    const owner = findOwningElement(elements, file);
    if (owner) scope.add(normalize(owner.relativePath));
  }
  return scope;
}
async function gitDirtyFiles(rootPath) {
  try {
    const git2 = simpleGit2(rootPath);
    const status = await git2.status();
    const paths = /* @__PURE__ */ new Set();
    for (const f of status.not_added) paths.add(f);
    for (const f of status.created) paths.add(f);
    for (const f of status.modified) paths.add(f);
    for (const f of status.deleted) paths.add(f);
    for (const r of status.renamed) paths.add(r.to);
    return [...paths].map(normalize);
  } catch {
    return [];
  }
}
function findOwningElement(elements, filePath) {
  const file = normalize(filePath);
  const sorted = [...elements].sort(
    (a, b) => pathDepth(b.relativePath) - pathDepth(a.relativePath)
  );
  for (const el of sorted) {
    const elPath = normalize(el.relativePath);
    if (elPath === "." || elPath === "") continue;
    if (file === elPath || file.startsWith(elPath + "/")) return el;
  }
  return null;
}
async function collectScopedDrift(rootPath, tree, scope) {
  const items = [];
  try {
    const fileResult = await handleValidateFiles({ rootPath });
    for (const m of fileResult.modules) {
      const rel = normalize(m.relativePath);
      if (!scope.has(rel)) continue;
      if (m.undocumentedFiles.length > 0) {
        items.push({
          elementPath: rel,
          message: `${m.undocumentedFiles.length} undocumented file${m.undocumentedFiles.length === 1 ? "" : "s"} (${m.undocumentedFiles.slice(0, 3).map(quote).join(", ")}${m.undocumentedFiles.length > 3 ? ", \u2026" : ""}). Run \`update_element\`.`
        });
      }
      if (m.missingFiles.length > 0) {
        items.push({
          elementPath: rel,
          message: `${m.missingFiles.length} documented file${m.missingFiles.length === 1 ? "" : "s"} no longer on disk (${m.missingFiles.slice(0, 3).map(quote).join(", ")}${m.missingFiles.length > 3 ? ", \u2026" : ""}). Run \`update_element\`.`
        });
      }
      if (m.filesMissingPinningRationale.length > 0) {
        items.push({
          elementPath: rel,
          message: `${m.filesMissingPinningRationale.length} pinned file${m.filesMissingPinningRationale.length === 1 ? "" : "s"} missing rationale (${m.filesMissingPinningRationale.slice(0, 3).map(quote).join(", ")}${m.filesMissingPinningRationale.length > 3 ? ", \u2026" : ""}). Add a short "why is this here?" note to each description.`
        });
      }
    }
  } catch {
  }
  try {
    const linkResult = await handleCheckLinks({ rootPath });
    for (const b of linkResult.brokenLinks) {
      const src = normalize(b.sourcePath);
      if (!scope.has(src)) continue;
      items.push({
        elementPath: src,
        message: `broken ${b.direction} link \u2192 \`${b.targetPath}\`. Run \`check_links\`.`
      });
    }
  } catch {
  }
  try {
    const orphanResult = await handleFindOrphans({ rootPath });
    for (const o of orphanResult.orphans) {
      const op = normalize(o.path);
      if (!isUnderScope(op, scope)) continue;
      items.push({
        elementPath: op,
        message: `code folder without architecture.md (suggested layer: ${o.suggestedLayer}). Run \`create_element\`.`
      });
    }
  } catch {
  }
  return dedupe(items);
}
function isUnderScope(elementPath, scope) {
  if (scope.has(elementPath)) return true;
  for (const s of scope) {
    if (s === "." || s === "") continue;
    if (elementPath.startsWith(s + "/")) return true;
  }
  return false;
}
function formatFooter(items) {
  const lines = [];
  lines.push("\u26A0 Drift detected in the elements you touched:");
  const shown = items.slice(0, MAX_ITEMS);
  for (const it of shown) {
    lines.push(`  - \`${it.elementPath}\` \u2014 ${it.message}`);
  }
  if (items.length > MAX_ITEMS) {
    lines.push(`  \u2026 and ${items.length - MAX_ITEMS} more. Run \`validate_files\` for the full picture.`);
  }
  lines.push(
    "Resolve drift before claiming the task complete (per agent-rules.md). Silence temporarily with `suppress_drift_warnings: true` in `.tessera/config.yaml`."
  );
  return lines.join("\n");
}
function normalize(p) {
  return p.replace(/\\/g, "/").replace(/^\.\//, "").replace(/\/$/, "");
}
function pathDepth(p) {
  const n = normalize(p);
  if (n === "" || n === ".") return 0;
  return n.split("/").length;
}
function quote(s) {
  return `\`${s}\``;
}
function dedupe(items) {
  const seen = /* @__PURE__ */ new Set();
  const out = [];
  for (const it of items) {
    const key = `${it.elementPath}::${it.message}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(it);
  }
  return out;
}

// tools/read/read.ts
async function handleGetArchitectureTree(args) {
  const absRoot = resolve4(args.rootPath);
  const config = await loadConfig(absRoot);
  return buildArchitectureTree(absRoot, config);
}
async function handleGetElement(args) {
  const absRoot = resolve4(args.rootPath);
  const absElement = join4(absRoot, args.elementPath, ARCHITECTURE_FILENAME);
  return parseArchitectureMd(absElement);
}
async function handleSearchElements(args) {
  const absRoot = resolve4(args.rootPath);
  const config = await loadConfig(absRoot);
  const tree = await buildArchitectureTree(absRoot, config);
  const allElements = flattenTree(tree);
  const q = args.query.toLowerCase();
  const results = [];
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
async function handleGetElementForFile(args) {
  const absRoot = resolve4(args.rootPath);
  const config = await loadConfig(absRoot);
  const tree = await buildArchitectureTree(absRoot, config);
  const allElements = flattenTree(tree);
  let normalizedFile = args.filePath.replace(/\\/g, "/");
  const normalizedRoot = absRoot.replace(/\\/g, "/");
  if (normalizedFile.startsWith(normalizedRoot)) {
    normalizedFile = normalizedFile.slice(normalizedRoot.length).replace(/^\//, "");
  }
  const sorted = [...allElements].sort(
    (a, b) => b.relativePath.replace(/\\/g, "/").split("/").length - a.relativePath.replace(/\\/g, "/").split("/").length
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
        dependedBy: el.metadata.dependedBy
      };
      try {
        const parsed = await parseArchitectureMd(join4(el.path, ARCHITECTURE_FILENAME));
        return { element: elementSummary, architectureMd: parsed };
      } catch {
        return {
          element: elementSummary,
          architectureMd: null,
          note: "architecture.md could not be parsed"
        };
      }
    }
  }
  return {
    error: "No architecture element found for this file",
    filePath: normalizedFile,
    hint: "This file may be in an undocumented folder. Use find_orphans to check."
  };
}
function registerReadTools(server, ctx) {
  const rootPathSchema = z2.string().optional().describe(
    `Absolute path to the project root. Optional \u2014 defaults to the server's configured root (${ctx.defaultRootPath}).`
  );
  const resolveRoot = (rootPath) => rootPath ?? ctx.defaultRootPath;
  server.tool(
    TOOL_NAMES.GET_ARCHITECTURE_TREE,
    "Returns the full architecture element hierarchy as a JSON tree with layer, name, path, and tags for each element",
    { rootPath: rootPathSchema },
    async (args) => {
      const rootPath = resolveRoot(args.rootPath);
      const data = await handleGetArchitectureTree({ rootPath });
      return jsonResultWithDrift(data, { rootPath });
    }
  );
  server.tool(
    TOOL_NAMES.GET_ELEMENT,
    "Returns the full architecture.md content and parsed metadata for a given element path",
    {
      rootPath: rootPathSchema,
      elementPath: z2.string().describe("Relative path to the element from root (e.g., 'extension/webview')")
    },
    async (args) => {
      const rootPath = resolveRoot(args.rootPath);
      try {
        const data = await handleGetElement({ rootPath, elementPath: args.elementPath });
        return jsonResultWithDrift(data, { rootPath, elementPath: args.elementPath });
      } catch {
        return errorResult(`Error: No architecture.md found at ${args.elementPath}`);
      }
    }
  );
  server.tool(
    TOOL_NAMES.SEARCH_ELEMENTS,
    "Searches elements by name, tag, or overview text across all layers. Returns matching elements with paths and layer info.",
    {
      rootPath: rootPathSchema,
      query: z2.string().describe("Search query \u2014 matched against element names, tags, and overview text")
    },
    async (args) => {
      const rootPath = resolveRoot(args.rootPath);
      const data = await handleSearchElements({ rootPath, query: args.query });
      return jsonResultWithDrift(data, { rootPath });
    }
  );
  server.tool(
    TOOL_NAMES.GET_ELEMENT_FOR_FILE,
    "Given a file path, returns the architecture.md context for the module that owns that file. Use this to quickly understand the architectural context around any source file without reading the code.",
    {
      rootPath: rootPathSchema,
      filePath: z2.string().describe("Absolute or root-relative path to a source file (e.g., 'extension/webview/canvas/Canvas.tsx')")
    },
    async (args) => {
      const rootPath = resolveRoot(args.rootPath);
      const data = await handleGetElementForFile({ rootPath, filePath: args.filePath });
      const elementPath = "element" in data ? data.element.relativePath : void 0;
      return jsonResultWithDrift(data, { rootPath, elementPath });
    }
  );
}
function toSearchResult(el) {
  return {
    name: el.name,
    path: el.path,
    relativePath: el.relativePath,
    layer: el.layer,
    overview: el.overview,
    tags: el.metadata.tags
  };
}
function errorResult(message) {
  return {
    content: [{ type: "text", text: message }],
    isError: true
  };
}

// tools/write/write.ts
import { mkdir, writeFile, readFile as readFile3 } from "node:fs/promises";
import { resolve as resolve5, join as join5, relative as relative3 } from "node:path";
import { z as z3 } from "zod";

// ../shared/dist/templates/templates.js
function generateTemplate(layer, name) {
  switch (layer) {
    case Layer.Landscape:
      return landscapeTemplate(name);
    case Layer.Context:
      return contextTemplate(name);
    case Layer.Container:
      return containerTemplate(name);
    case Layer.Component:
      return componentTemplate(name);
    case Layer.Module:
      return moduleTemplate(name);
    case Layer.Docs:
      return docsTemplate(name);
  }
}
function landscapeTemplate(name) {
  return `# ${name}

## Overview
What this system landscape is \u2014 the portfolio of software systems that live
in this workspace, and what binds them together (shared users, shared data
boundaries, shared deployment pipeline, etc.).

${pinnedFilesBlock()}
## Systems
- **[System Name]**: One-line description of what it does
- **[System Name]**: One-line description of what it does

## External Systems
- **[External System]**: How the landscape interacts with it

## Actors
- **[Actor Name]**: Which systems they interact with, and how

## Metadata
- **Layer**: Landscape
- **Tags**: []
- **Owner**: @username
- **Status**: Planned

## Key Decisions
- [Decision and rationale \u2014 include ADR links where they exist]
`;
}
function contextTemplate(name) {
  return `# ${name}

## Overview
What the system is, its purpose, the problem it solves.

${pinnedFilesBlock()}
## External Systems
- **[System Name]**: Description of interaction

## Actors
- **[Actor Name]**: Role and interaction pattern

## Metadata
- **Layer**: Context
- **Tags**: []
- **Owner**: @username
- **Status**: Planned

## Key Decisions
- [Decision and rationale]
`;
}
function containerTemplate(name) {
  return `# ${name}

## Overview
What this container does and its role in the system.

${pinnedFilesBlock()}
## Technology
- **Runtime**: e.g., Node.js 20
- **Framework**: e.g., React, Express
- **Data store**: if applicable

## Metadata
- **Layer**: Container
- **Tags**: []
- **Depends on**: None
- **Depended by**: None
- **Owner**: @username
- **Status**: Planned

## API Surface
- Public interfaces this container exposes

## Deployment
- How and where this is deployed

## Key Decisions
- [Decision and rationale]
`;
}
function componentTemplate(name) {
  return `# ${name}

## Overview
What this component does within its parent container.

${pinnedFilesBlock()}
## Metadata
- **Layer**: Component
- **Tags**: []
- **Depends on**: None
- **Depended by**: None
- **Owner**: @username
- **Status**: Planned

## Interfaces
- Public API or contract this component exposes

## Key Decisions
- [Decision and rationale]
`;
}
function moduleTemplate(name) {
  return `# ${name}

## Overview
What this module does and why it exists.

## Files
- \`filename.ext\` \u2014 Description of what this file does

## Functions
- \`functionName(params): ReturnType\` \u2014 Description

## Classes
- \`ClassName\` \u2014 Description and responsibilities

## Metadata
- **Layer**: Module
- **Tags**: []
- **Depends on**: None
- **Depended by**: None
- **Owner**: @username
- **Status**: Planned

## Key Decisions
- [Decision and rationale]
`;
}
function pinnedFilesBlock() {
  return `## Files
<!-- Files pinned at this folder's root (build config, entry points, root meta
     like README/LICENSE). Application code belongs in child Modules. Include
     a short pinning rationale in each description \u2014 see ADR-016. Delete this
     section entirely if nothing is pinned here. -->
- \`filename.ext\` \u2014 Description. Pinned: why it must live here.

`;
}
function docsTemplate(name) {
  return `# ${name}

## Overview
What this documentation folder contains and how to use it.

## Metadata
- **Layer**: Docs
- **Tags**: []
- **Owner**: @username
- **Status**: Planned

## Conventions
- [Naming conventions, file format rules, etc.]
`;
}

// tools/write/write.ts
async function handleCreateElement(args) {
  const absParent = resolve5(args.parentPath);
  const elementDir = join5(absParent, args.name);
  const archMdPath = join5(elementDir, ARCHITECTURE_FILENAME);
  await mkdir(elementDir, { recursive: true });
  const content = generateTemplate(args.layer, args.name);
  await writeFile(archMdPath, content, "utf-8");
  return {
    created: true,
    path: elementDir,
    architectureMd: archMdPath,
    layer: args.layer
  };
}
async function handleUpdateElement(args) {
  const absElement = resolve5(args.elementPath);
  const archMdPath = join5(absElement, ARCHITECTURE_FILENAME);
  await readFile3(archMdPath, "utf-8");
  await writeFile(archMdPath, args.content, "utf-8");
  return { updated: true, path: archMdPath };
}
function registerWriteTools(server, ctx) {
  const rootPath = ctx.defaultRootPath;
  server.tool(
    TOOL_NAMES.CREATE_ELEMENT,
    "Creates a new architectural element: folder + templated architecture.md at the specified layer and path",
    {
      parentPath: z3.string().describe("Absolute path to the parent folder where the new element will be created"),
      name: z3.string().describe("Name of the new element (used as folder name and architecture.md title)"),
      layer: z3.enum(["Context", "Container", "Component", "Module", "Docs"]).describe("C4 layer for the new element")
    },
    async (args) => {
      try {
        const result = await handleCreateElement({
          parentPath: args.parentPath,
          name: args.name,
          layer: args.layer
        });
        return jsonResultWithDrift(result, {
          rootPath,
          elementPath: toRelative(rootPath, args.parentPath)
        });
      } catch (err) {
        return errorResult2(`Error creating element: ${err}`);
      }
    }
  );
  server.tool(
    TOOL_NAMES.UPDATE_ELEMENT,
    "Updates an existing architecture.md file with new content. Can replace the entire file or merge sections.",
    {
      elementPath: z3.string().describe("Absolute path to the element folder containing architecture.md"),
      content: z3.string().describe("New architecture.md content (replaces the entire file)")
    },
    async (args) => {
      try {
        const result = await handleUpdateElement(args);
        return jsonResultWithDrift(result, {
          rootPath,
          elementPath: toRelative(rootPath, args.elementPath)
        });
      } catch (err) {
        return errorResult2(`Error updating element: ${err}`);
      }
    }
  );
}
function toRelative(rootPath, absPath) {
  try {
    const rel = relative3(resolve5(rootPath), resolve5(absPath)).replace(/\\/g, "/");
    if (!rel || rel.startsWith("..")) return void 0;
    return rel;
  } catch {
    return void 0;
  }
}
function errorResult2(message) {
  return {
    content: [{ type: "text", text: message }],
    isError: true
  };
}

// tools/context/context.ts
import { readFile as readFile4 } from "node:fs/promises";
import { resolve as resolve6, join as join6 } from "node:path";
import { z as z4 } from "zod";
var NO_RULES_MESSAGE = "No agent-rules.md found. Create .tessera/agent-rules.md to define project rules.";
async function handleGetRules(args) {
  const absRoot = resolve6(args.rootPath);
  const rulesPath = join6(absRoot, CONFIG_DIR, AGENT_RULES_FILE);
  try {
    return await readFile4(rulesPath, "utf-8");
  } catch {
    return NO_RULES_MESSAGE;
  }
}
async function handleGetElementContext(args) {
  const absRoot = resolve6(args.rootPath);
  const config = await loadConfig(absRoot);
  const tree = await buildArchitectureTree(absRoot, config);
  const element = getElementByPath(tree, args.elementPath);
  if (!element) {
    throw new Error(`Element not found at path '${args.elementPath}'`);
  }
  const parent = findParent(tree.root, args.elementPath);
  const siblings = parent ? parent.children.filter((c) => c.relativePath !== element.relativePath) : [];
  return {
    element,
    parent,
    siblings,
    children: element.children
  };
}
function registerContextTools(server, serverCtx) {
  const rootPathSchema = z4.string().optional().describe(
    `Absolute path to the project root. Optional \u2014 defaults to the server's configured root (${serverCtx.defaultRootPath}).`
  );
  const resolveRoot = (rootPath) => rootPath ?? serverCtx.defaultRootPath;
  server.tool(
    TOOL_NAMES.GET_RULES,
    "Returns project-level architectural rules for AI agent context injection from .tessera/agent-rules.md",
    {
      rootPath: rootPathSchema
    },
    async (args) => {
      const rootPath = resolveRoot(args.rootPath);
      const text = await handleGetRules({ rootPath });
      return withDriftFooter(
        { content: [{ type: "text", text }] },
        { rootPath }
      );
    }
  );
  server.tool(
    TOOL_NAMES.GET_ELEMENT_CONTEXT,
    "Returns a summary of an element and its immediate neighbors (parent, siblings, children) for focused agent work",
    {
      rootPath: rootPathSchema,
      elementPath: z4.string().describe("Relative path to the element from root")
    },
    async (args) => {
      const rootPath = resolveRoot(args.rootPath);
      try {
        const result = await handleGetElementContext({ rootPath, elementPath: args.elementPath });
        return jsonResultWithDrift(result, { rootPath, elementPath: args.elementPath });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          content: [{ type: "text", text: `Error: ${message}` }],
          isError: true
        };
      }
    }
  );
}
function findParent(current, targetRelPath) {
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

// tools/diagram/diagram.ts
import { resolve as resolve7, join as join7, relative as relative4 } from "node:path";
import { readdir as readdir3, readFile as readFile5, writeFile as writeFile2 } from "node:fs/promises";
import { z as z5 } from "zod";
var DIAGRAM_TYPES = {
  [Layer.Context]: [
    { name: "business-capability-map", description: "Which business functions exist, before software is introduced" },
    { name: "actor-journey", description: "How external users navigate across multiple systems over time" },
    { name: "trust-boundary", description: "Security zones and attack surfaces across system boundaries" }
  ],
  [Layer.Container]: [
    { name: "data-flow", description: "How data moves between containers, with transformation steps" },
    { name: "sequence-diagram", description: "Runtime interaction between containers for a specific use case" },
    { name: "event-flow", description: "Topics, queues, producers and consumers across containers" },
    { name: "deployment-diagram", description: "How containers map onto infrastructure (nodes, cloud regions, k8s)" },
    { name: "network-topology", description: "Firewall rules, VPCs, subnets \u2014 the actual network layer" }
  ],
  [Layer.Component]: [
    { name: "state-machine", description: "Lifecycle of a key entity managed within a component" },
    { name: "activity-diagram", description: "Step-by-step process logic within a service" },
    { name: "sequence-diagram", description: "Internal call chains within a container for a specific operation" },
    { name: "domain-model", description: "Aggregates, entities, value objects \u2014 the DDD view" }
  ],
  [Layer.Module]: [
    { name: "class-diagram", description: "OOP structure inside a component" },
    { name: "erd", description: "Data schema and relationships, usually per-service" },
    { name: "dependency-graph", description: "Module/package coupling within a codebase" }
  ]
};
async function handlePrepareDiagramContext(args) {
  const absRoot = resolve7(args.rootPath);
  const config = await loadConfig(absRoot);
  const tree = await buildArchitectureTree(absRoot, config);
  const element = getElementByPath(tree, args.elementPath);
  if (!element) {
    throw new Error(`Element not found at '${args.elementPath}'`);
  }
  const archMdPath = join7(element.path, ARCHITECTURE_FILENAME);
  let archContent = "";
  try {
    const parsed = await parseArchitectureMd(archMdPath);
    archContent = parsed.raw;
  } catch {
    archContent = "(no architecture.md found)";
  }
  const codeContents = {};
  try {
    const entries = await readdir3(element.path, { withFileTypes: true });
    const codeFiles = entries.filter(
      (e) => e.isFile() && e.name !== ARCHITECTURE_FILENAME && !e.name.endsWith(".mermaid.md")
    );
    for (const file of codeFiles.slice(0, 10)) {
      try {
        const content = await readFile5(join7(element.path, file.name), "utf-8");
        codeContents[file.name] = content.length > 5e3 ? content.slice(0, 5e3) + "\n... (truncated)" : content;
      } catch {
      }
    }
  } catch {
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
      dependedBy: element.metadata.dependedBy
    },
    diagramType: {
      name: args.diagramType,
      description: typeInfo?.description ?? "Unknown diagram type"
    },
    architectureMd: archContent,
    codeFiles: codeContents,
    children: element.children.map((c) => ({
      name: c.name,
      layer: c.layer,
      overview: c.overview,
      tags: c.metadata.tags
    })),
    instruction: `Generate a Mermaid diagram of type "${args.diagramType}" for the element "${element.name}". Use the architecture.md content, code files, and relationship data provided above to create an accurate diagram. Output ONLY the Mermaid syntax (starting with the diagram type declaration like "graph TD", "sequenceDiagram", etc.).`
  };
}
async function handleSaveDiagram(args) {
  const absPath = resolve7(args.elementPath);
  const filename = `${args.diagramType}.mermaid.md`;
  const filePath = join7(absPath, filename);
  const title = args.diagramType.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  const content = `# ${title}

\`\`\`mermaid
${args.mermaidContent}
\`\`\`
`;
  await writeFile2(filePath, content, "utf-8");
  return { saved: true, path: filePath, filename };
}
function handleListDiagramTypes(args) {
  return DIAGRAM_TYPES[args.layer] ?? [];
}
async function handleListDiagrams(args) {
  const absPath = resolve7(args.elementPath);
  try {
    const entries = await readdir3(absPath, { withFileTypes: true });
    return entries.filter((e) => e.isFile() && e.name.endsWith(".mermaid.md")).map((e) => ({
      filename: e.name,
      type: e.name.replace(".mermaid.md", ""),
      path: join7(absPath, e.name)
    }));
  } catch {
    return [];
  }
}
function registerDiagramTools(server, ctx) {
  const rootPathSchema = z5.string().optional().describe(
    `Absolute path to the project root. Optional \u2014 defaults to the server's configured root (${ctx.defaultRootPath}).`
  );
  server.tool(
    "prepare_diagram_context",
    "Assembles all relevant context for generating a Mermaid diagram: element overview, code contents, relationship data, and diagram type description. Returns structured data the AI agent uses to generate the Mermaid syntax.",
    {
      rootPath: rootPathSchema,
      elementPath: z5.string().describe("Relative path to the element from root"),
      diagramType: z5.string().describe("Diagram type identifier (e.g., 'sequence-diagram', 'data-flow')")
    },
    async (args) => {
      const rootPath = args.rootPath ?? ctx.defaultRootPath;
      try {
        const data = await handlePrepareDiagramContext({
          rootPath,
          elementPath: args.elementPath,
          diagramType: args.diagramType
        });
        return jsonResultWithDrift(data, { rootPath, elementPath: args.elementPath });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return errorResult3(`Error: ${message}`);
      }
    }
  );
  server.tool(
    "save_diagram",
    "Saves a Mermaid diagram to an element's folder as [diagram-type].mermaid.md",
    {
      elementPath: z5.string().describe("Absolute path to the element folder"),
      diagramType: z5.string().describe("Diagram type identifier (used as filename prefix)"),
      mermaidContent: z5.string().describe("The Mermaid diagram syntax to save")
    },
    async (args) => {
      const rootPath = ctx.defaultRootPath;
      try {
        const data = await handleSaveDiagram(args);
        return jsonResultWithDrift(data, {
          rootPath,
          elementPath: toRelative2(rootPath, args.elementPath)
        });
      } catch (err) {
        return errorResult3(`Error saving diagram: ${err}`);
      }
    }
  );
  server.tool(
    "list_diagram_types",
    "Returns the available supplementary diagram types for a given C4 layer",
    {
      layer: z5.enum(["Context", "Container", "Component", "Module", "Docs"]).describe("C4 layer")
    },
    async (args) => jsonResultWithDrift(handleListDiagramTypes(args), { rootPath: ctx.defaultRootPath })
  );
  server.tool(
    "list_diagrams",
    "Lists existing .mermaid.md diagram files for a given element",
    {
      elementPath: z5.string().describe("Absolute path to the element folder")
    },
    async (args) => {
      const rootPath = ctx.defaultRootPath;
      const data = await handleListDiagrams(args);
      return jsonResultWithDrift(data, {
        rootPath,
        elementPath: toRelative2(rootPath, args.elementPath)
      });
    }
  );
}
function toRelative2(rootPath, absPath) {
  try {
    const rel = relative4(resolve7(rootPath), resolve7(absPath)).replace(/\\/g, "/");
    if (!rel || rel.startsWith("..")) return void 0;
    return rel;
  } catch {
    return void 0;
  }
}
function errorResult3(message) {
  return {
    content: [{ type: "text", text: message }],
    isError: true
  };
}

// tools/scaffold/scaffold.ts
import { z as z6 } from "zod";

// ../shared/dist/scaffold/scaffold.js
import { resolve as resolve8, join as join8, relative as relative5, basename as basename2 } from "node:path";
import { readdir as readdir4, writeFile as writeFile3 } from "node:fs/promises";
var PASS_THROUGH_NAMES = /* @__PURE__ */ new Set([
  "src",
  "lib",
  "app",
  "apps",
  "packages",
  "internal",
  "pkg",
  "cmd"
]);
async function proposeScaffold(args) {
  const absRoot = resolve8(args.rootPath);
  const proposals = [];
  const mode = args.workspaceMode ?? DEFAULT_WORKSPACE_MODE;
  async function walk(dirPath, depth) {
    const entries = await readdir4(dirPath, { withFileTypes: true });
    const subdirs = entries.filter((e) => e.isDirectory() && !matchesIgnorePattern(e.name, args.ignorePatterns));
    const files = entries.filter((e) => e.isFile());
    const hasArchMd = files.some((e) => e.name === ARCHITECTURE_FILENAME);
    const hasCode = files.some((e) => e.name !== ARCHITECTURE_FILENAME && !e.name.startsWith(".") && !e.name.endsWith(".md"));
    const name = basename2(dirPath);
    const relPath = relative5(absRoot, dirPath) || ".";
    const isPassThrough = !hasArchMd && subdirs.length > 0 && !hasCode || !hasArchMd && PASS_THROUGH_NAMES.has(name.toLowerCase());
    if (depth > 0) {
      let suggestedLayer;
      let reason;
      if (isPassThrough) {
        suggestedLayer = "pass-through";
        reason = subdirs.length > 0 && !hasCode ? `Folder contains only subfolders and no code files \u2014 likely a pass-through folder. Its children will be promoted to the parent level.` : `Conventionally named wrapper folder ("${name}") \u2014 likely a pass-through. Its children will be promoted to the parent level.`;
      } else if (subdirs.length === 0) {
        suggestedLayer = "Module";
        reason = "Leaf folder (no subfolders) \u2014 maps to L4 Module";
      } else if (mode === "landscape" && depth === 1) {
        suggestedLayer = "Context";
        reason = `Top-level folder at depth 1 in landscape mode with ${subdirs.length} subfolder(s) \u2014 maps to L1 Context (a software system within the landscape)`;
      } else if (mode === "landscape" && depth === 2) {
        suggestedLayer = "Container";
        reason = `Folder at depth 2 in landscape mode with ${subdirs.length} subfolder(s) \u2014 maps to L2 Container`;
      } else if (mode === "landscape" && depth === 3) {
        suggestedLayer = "Component";
        reason = `Folder at depth 3 in landscape mode with ${subdirs.length} subfolder(s) \u2014 maps to L3 Component`;
      } else if (depth === 1) {
        suggestedLayer = "Container";
        reason = `Top-level folder at depth 1 with ${subdirs.length} subfolder(s) \u2014 maps to L2 Container`;
      } else if (depth === 2) {
        suggestedLayer = "Component";
        reason = `Folder at depth 2 with ${subdirs.length} subfolder(s) \u2014 maps to L3 Component`;
      } else {
        suggestedLayer = subdirs.length > 0 ? "Component" : "Module";
        reason = subdirs.length > 0 ? `Nested folder with subfolders \u2014 suggest L3 Component` : `Nested leaf folder \u2014 suggest L4 Module`;
      }
      proposals.push({
        path: relPath,
        suggestedLayer,
        suggestedName: name,
        reason,
        hasArchitectureMd: hasArchMd,
        isPassThrough
      });
    } else if (!hasArchMd) {
      const rootLayer = mode === "landscape" ? "Landscape" : "Context";
      const rootReason = mode === "landscape" ? "Project root in landscape mode \u2014 maps to L0 Landscape (a workspace of multiple software systems)" : "Project root \u2014 maps to L1 Context";
      proposals.push({
        path: ".",
        suggestedLayer: rootLayer,
        suggestedName: basename2(absRoot),
        reason: rootReason,
        hasArchitectureMd: false,
        isPassThrough: false
      });
    }
    for (const sub of subdirs) {
      await walk(join8(dirPath, sub.name), depth + 1);
    }
  }
  await walk(absRoot, 0);
  const needsWork = proposals.filter((p) => !p.hasArchitectureMd && !p.isPassThrough);
  const passThrough = proposals.filter((p) => p.isPassThrough);
  const alreadyDone = proposals.filter((p) => p.hasArchitectureMd);
  return {
    totalFolders: proposals.length,
    needsArchitectureMd: needsWork.length,
    passThroughFolders: passThrough.length,
    alreadyDocumented: alreadyDone.length,
    proposals: needsWork,
    passThrough: passThrough.map((p) => ({
      path: p.path,
      name: p.suggestedName,
      reason: p.reason
    })),
    existingElements: alreadyDone.map((p) => ({ path: p.path, layer: p.suggestedLayer }))
  };
}
async function applyScaffold(args) {
  const absRoot = resolve8(args.rootPath);
  const results = [];
  for (const el of args.elements) {
    const dirPath = el.path === "." ? absRoot : join8(absRoot, el.path);
    const archPath = join8(dirPath, ARCHITECTURE_FILENAME);
    try {
      if (!args.dryRun) {
        const content = generateTemplate(el.layer, el.name);
        await writeFile3(archPath, content, "utf-8");
      }
      results.push({ path: el.path, created: true });
    } catch (err) {
      results.push({ path: el.path, created: false, error: String(err) });
    }
  }
  const created = results.filter((r) => r.created).length;
  const failed = results.filter((r) => !r.created).length;
  return { created, failed, results };
}

// tools/scaffold/scaffold.ts
async function handleScaffoldExistingCodebase(args) {
  const config = await loadConfig(args.rootPath);
  return proposeScaffold({
    rootPath: args.rootPath,
    ignorePatterns: config.ignore,
    workspaceMode: config.workspaceMode
  });
}
async function handleApplyScaffold(args) {
  return applyScaffold(args);
}
function registerScaffoldTools(server, ctx) {
  const rootPathSchema = z6.string().optional().describe(
    `Absolute path to the project root. Optional \u2014 defaults to the server's configured root (${ctx.defaultRootPath}).`
  );
  const resolveRoot = (rootPath) => rootPath ?? ctx.defaultRootPath;
  server.tool(
    "scaffold_existing_codebase",
    "Analyzes an existing codebase's folder structure and proposes a C4 layer mapping. Does NOT create any files \u2014 returns a proposal for review.",
    { rootPath: rootPathSchema },
    async (args) => {
      const rootPath = resolveRoot(args.rootPath);
      const data = await handleScaffoldExistingCodebase({ rootPath });
      return jsonResultWithDrift(data, { rootPath });
    }
  );
  server.tool(
    "apply_scaffold",
    "Creates architecture.md files for specified folders based on a scaffold proposal. Does NOT move or rename existing files. Pass dryRun=true to preview without writing.",
    {
      rootPath: rootPathSchema,
      elements: z6.array(
        z6.object({
          path: z6.string().describe("Relative path from root"),
          layer: z6.enum(["Landscape", "Context", "Container", "Component", "Module", "Docs"]),
          name: z6.string().describe("Element name for the architecture.md title")
        })
      ).describe("Array of elements to create architecture.md for"),
      dryRun: z6.boolean().optional().describe("If true, returns what would be created without writing any files")
    },
    async (args) => {
      const rootPath = resolveRoot(args.rootPath);
      const typedElements = args.elements.map((el) => ({
        path: el.path,
        layer: el.layer,
        name: el.name
      }));
      const data = await handleApplyScaffold({
        rootPath,
        elements: typedElements,
        dryRun: args.dryRun
      });
      return jsonResultWithDrift(data, { rootPath });
    }
  );
}

// tools/docs/docs.ts
import { resolve as resolve9, join as join9, relative as relative6, dirname } from "node:path";
import { readdir as readdir5, readFile as readFile6, writeFile as writeFile4, mkdir as mkdir2, stat as stat2 } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { tmpdir } from "node:os";
import { z as z7 } from "zod";
var execFileAsync = promisify(execFile);
async function findMmdc(rootPath) {
  const isWin = process.platform === "win32";
  const ext = isWin ? ".cmd" : "";
  const localBin = join9(rootPath, "node_modules", ".bin", `mmdc${ext}`);
  try {
    await stat2(localBin);
    return localBin;
  } catch {
  }
  try {
    const mcpBin = join9(
      dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1")),
      "..",
      "..",
      "node_modules",
      ".bin",
      `mmdc${ext}`
    );
    await stat2(mcpBin);
    return mcpBin;
  } catch {
  }
  try {
    const globalBin = `mmdc${ext}`;
    await execFileAsync(globalBin, ["--version"], { timeout: 5e3 });
    return globalBin;
  } catch {
  }
  return null;
}
var MMDC_MISSING = {
  kind: "mmdc-missing",
  error: "mmdc (Mermaid CLI) is not installed. Docs compilation requires @mermaid-js/mermaid-cli.",
  fix: "Install it with: npm install -g @mermaid-js/mermaid-cli",
  note: "@mermaid-js/mermaid-cli is an optional dependency of @tessera/mcp to keep the base install lightweight. Install it separately when you need diagram rendering."
};
async function collectDiagramSources(rootPath) {
  const config = await loadConfig(rootPath);
  const tree = await buildArchitectureTree(rootPath, config);
  const elements = flattenTree(tree);
  const sources = [];
  for (const el of elements) {
    try {
      const entries = await readdir5(el.path, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isFile() && entry.name.endsWith(".mermaid.md")) {
          sources.push({
            sourcePath: join9(el.path, entry.name),
            diagramType: entry.name.replace(".mermaid.md", ""),
            elementRelativePath: el.relativePath,
            elementName: el.name
          });
        }
      }
    } catch {
    }
  }
  return sources;
}
function extractMermaidCode(markdown) {
  const match = markdown.match(/```mermaid\n([\s\S]*?)```/);
  return match ? match[1].trim() : null;
}
async function renderDiagramToSvg(mmdcPath, mermaidCode, outputPath) {
  const tempInput = join9(
    tmpdir(),
    `mermaid-${Date.now()}-${Math.random().toString(36).slice(2)}.mmd`
  );
  try {
    await writeFile4(tempInput, mermaidCode, "utf-8");
    await mkdir2(dirname(outputPath), { recursive: true });
    await execFileAsync(
      mmdcPath,
      ["-i", tempInput, "-o", outputPath, "-b", "transparent", "--quiet"],
      { timeout: 3e4 }
    );
  } finally {
    try {
      const { unlink } = await import("node:fs/promises");
      await unlink(tempInput);
    } catch {
    }
  }
}
function generateIndexMd(compiled, rootPath) {
  const lines = [
    "# Architecture Documentation",
    "",
    "Auto-generated documentation from Tessera diagram sources.",
    "",
    `> Last compiled: ${(/* @__PURE__ */ new Date()).toISOString()}`,
    "",
    "## Diagrams",
    ""
  ];
  const byElement = /* @__PURE__ */ new Map();
  for (const d of compiled) {
    const key = d.elementPath;
    if (!byElement.has(key)) byElement.set(key, []);
    byElement.get(key).push(d);
  }
  for (const [elementPath, diagrams] of byElement) {
    lines.push(`### ${diagrams[0].elementName} (\`${elementPath}\`)`);
    lines.push("");
    for (const d of diagrams) {
      const svgRelative = relative6(join9(rootPath, "docs"), d.svgOutputPath).replace(/\\/g, "/");
      const srcRelative = relative6(join9(rootPath, "docs"), d.sourceOutputPath).replace(/\\/g, "/");
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
async function handleCompileDocs(args) {
  const absRoot = resolve9(args.rootPath);
  const docsDir = join9(absRoot, "docs");
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
      indexPath: join9(docsDir, "index.md"),
      diagrams: [],
      message: "No .mermaid.md diagram files found in the architecture tree."
    };
  }
  const compiled = [];
  const errors = [];
  let skipped = 0;
  for (const source of sources) {
    const elementDocsDir = source.elementRelativePath === "." ? docsDir : join9(docsDir, source.elementRelativePath.replace(/\\/g, "/"));
    const svgOutput = join9(elementDocsDir, `${source.diagramType}.svg`);
    const srcOutput = join9(elementDocsDir, `${source.diagramType}.mermaid.md`);
    if (!args.force) {
      try {
        const sourceStat = await stat2(source.sourcePath);
        const outputStat = await stat2(svgOutput);
        if (outputStat.mtimeMs >= sourceStat.mtimeMs) {
          compiled.push({
            diagramType: source.diagramType,
            elementPath: source.elementRelativePath,
            elementName: source.elementName,
            svgOutputPath: svgOutput,
            sourceOutputPath: srcOutput
          });
          skipped++;
          continue;
        }
      } catch {
      }
    }
    try {
      const markdown = await readFile6(source.sourcePath, "utf-8");
      const mermaidCode = extractMermaidCode(markdown);
      if (!mermaidCode) {
        errors.push({ source: source.sourcePath, error: "No mermaid code block found in file" });
        continue;
      }
      await renderDiagramToSvg(mmdcPath, mermaidCode, svgOutput);
      await mkdir2(elementDocsDir, { recursive: true });
      await writeFile4(srcOutput, markdown, "utf-8");
      compiled.push({
        diagramType: source.diagramType,
        elementPath: source.elementRelativePath,
        elementName: source.elementName,
        svgOutputPath: svgOutput,
        sourceOutputPath: srcOutput
      });
    } catch (err) {
      errors.push({
        source: source.sourcePath,
        error: err instanceof Error ? err.message : String(err)
      });
    }
  }
  const indexContent = generateIndexMd(compiled, absRoot);
  await mkdir2(docsDir, { recursive: true });
  await writeFile4(join9(docsDir, "index.md"), indexContent, "utf-8");
  return {
    kind: "success",
    compiled: compiled.length,
    rendered: compiled.length - skipped,
    skipped,
    errors,
    docsPath: docsDir,
    indexPath: join9(docsDir, "index.md"),
    diagrams: compiled.map((d) => ({
      type: d.diagramType,
      element: d.elementPath,
      svg: relative6(absRoot, d.svgOutputPath).replace(/\\/g, "/")
    }))
  };
}
async function handleCheckDiagramStaleness(args) {
  const absRoot = resolve9(args.rootPath);
  const docsDir = join9(absRoot, "docs");
  const sources = await collectDiagramSources(absRoot);
  const stale = [];
  const missing = [];
  for (const source of sources) {
    const elementDocsDir = source.elementRelativePath === "." ? docsDir : join9(docsDir, source.elementRelativePath.replace(/\\/g, "/"));
    const svgOutput = join9(elementDocsDir, `${source.diagramType}.svg`);
    try {
      const sourceStat = await stat2(source.sourcePath);
      const outputStat = await stat2(svgOutput);
      if (sourceStat.mtimeMs > outputStat.mtimeMs) {
        stale.push({
          diagramType: source.diagramType,
          elementPath: source.elementRelativePath,
          elementName: source.elementName,
          sourceModified: sourceStat.mtimeMs,
          outputModified: outputStat.mtimeMs,
          sourcePath: relative6(absRoot, source.sourcePath).replace(/\\/g, "/"),
          outputPath: relative6(absRoot, svgOutput).replace(/\\/g, "/")
        });
      }
    } catch {
      missing.push({
        diagramType: source.diagramType,
        elementPath: source.elementRelativePath,
        elementName: source.elementName,
        sourcePath: relative6(absRoot, source.sourcePath).replace(/\\/g, "/")
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
    suggestion: stale.length > 0 || missing.length > 0 ? "Run compile_docs to render stale/missing diagrams, or compile_docs with force=true to re-render everything." : "All diagrams are up to date."
  };
}
function registerDocsTools(server, ctx) {
  const rootPathSchema = z7.string().optional().describe(
    `Absolute path to the project root. Optional \u2014 defaults to the server's configured root (${ctx.defaultRootPath}).`
  );
  const resolveRoot = (rootPath) => rootPath ?? ctx.defaultRootPath;
  server.tool(
    "compile_docs",
    "Walks the architecture tree, finds all .mermaid.md diagram source files, renders them to SVG, and organizes the output in a docs/ folder with an index catalog. The docs/ folder mirrors the architecture tree structure.",
    {
      rootPath: rootPathSchema,
      force: z7.boolean().optional().describe("Re-render all diagrams even if not stale (default: false)")
    },
    async (args) => {
      const rootPath = resolveRoot(args.rootPath);
      const result = await handleCompileDocs({ rootPath, force: args.force });
      if (result.kind === "mmdc-missing") {
        return withDriftFooter(
          {
            content: [{
              type: "text",
              text: JSON.stringify({ error: result.error, fix: result.fix, note: result.note }, null, 2)
            }],
            isError: true
          },
          { rootPath }
        );
      }
      const { kind, ...rest } = result;
      return jsonResultWithDrift(rest, { rootPath });
    }
  );
  server.tool(
    "check_diagram_staleness",
    "Compares .mermaid.md source files to their rendered SVG counterparts in docs/ and reports which diagrams are stale (source newer than output) or missing from docs/.",
    {
      rootPath: rootPathSchema
    },
    async (args) => {
      const rootPath = resolveRoot(args.rootPath);
      const data = await handleCheckDiagramStaleness({ rootPath });
      return jsonResultWithDrift(data, { rootPath });
    }
  );
}

// tools/protocols/protocols.ts
import { access as access2, mkdir as mkdir3, writeFile as writeFile5 } from "node:fs/promises";
import { dirname as dirname2, join as join10, resolve as resolve10 } from "node:path";
import { z as z8 } from "zod";
var PROTOCOL_DIR = ".tessera-protocols";
var REQUIRED_FILES = [
  "README.md",
  "capability/user.md",
  "capability/agent.md",
  "goals/_active.md",
  "goals/_archive.md",
  "comprehension/_index.md",
  "context/current-session.md"
];
async function handlePrepareProtocolBootstrap(args) {
  const absRoot = resolve10(args.rootPath);
  const protocolRoot = join10(absRoot, PROTOCOL_DIR);
  const existingFiles = [];
  const missingFiles = [];
  for (const relPath of REQUIRED_FILES) {
    if (await pathExists(join10(protocolRoot, relPath))) {
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
        required: true
      },
      {
        id: "active_goals",
        question: "What are the current goals, success criteria, and explicit non-goals?",
        records: ["goals/_active.md"],
        required: true
      },
      {
        id: "user_capability",
        question: "What should the agent know about your familiarity with the languages, frameworks, and domain in this project?",
        records: ["capability/user.md"],
        required: true
      },
      {
        id: "agent_limits",
        question: "Are there project-specific areas where agents commonly make wrong assumptions?",
        records: ["capability/agent.md", "comprehension/*.md"],
        required: false
      },
      {
        id: "high_risk_comprehension",
        question: "Which architectural areas, naming conventions, or workflows are most important for an agent to understand correctly?",
        records: ["comprehension/_index.md", "comprehension/*.md"],
        required: false
      },
      {
        id: "session_context",
        question: "What should the first working session focus on, and what assumptions remain open?",
        records: ["context/current-session.md"],
        required: true
      }
    ],
    suggestedWorkflow: [
      "Call prepare_protocol_bootstrap to inspect the current protocol installation.",
      "Ask the returned questions in the chat and let the user correct the framing.",
      "Call apply_protocol_bootstrap only with answers the user explicitly supplied or confirmed.",
      "Use scaffold_existing_codebase/apply_scaffold separately for architecture.md initialization when needed."
    ]
  };
}
async function handleApplyProtocolBootstrap(args) {
  const absRoot = resolve10(args.rootPath);
  const protocolRoot = join10(absRoot, PROTOCOL_DIR);
  const today = (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
  const userId = args.userId?.trim() || "user";
  const comprehensionRecords = args.comprehensionRecords ?? [];
  const files = /* @__PURE__ */ new Map();
  files.set("README.md", protocolReadme(args.projectName));
  files.set("capability/user.md", userCapabilityContent(args.userCapabilities ?? [], today));
  files.set("capability/agent.md", agentCapabilityContent(args.agentCapabilities ?? [], today));
  files.set("goals/_active.md", activeGoalsContent(args.goals, today, userId));
  files.set("goals/_archive.md", "# Archived Goals\n\nCompleted or superseded goals move here.\n");
  files.set("comprehension/_index.md", comprehensionIndexContent(comprehensionRecords));
  files.set(
    "context/current-session.md",
    currentSessionContent(args.projectName, args.sessionScope, args.openAssumptions ?? [])
  );
  for (const record of comprehensionRecords) {
    files.set(
      `comprehension/${comprehensionFilename(record)}`,
      comprehensionRecordContent(record, today, userId)
    );
  }
  const created = [];
  const skipped = [];
  if (!args.dryRun) {
    await mkdir3(protocolRoot, { recursive: true });
  }
  for (const [relPath, content] of files) {
    const absPath = join10(protocolRoot, relPath);
    const exists = await pathExists(absPath);
    if (exists && !args.overwrite) {
      skipped.push(relPath);
      continue;
    }
    created.push(relPath);
    if (!args.dryRun) {
      await mkdir3(dirname2(absPath), { recursive: true });
      await writeFile5(absPath, content, "utf-8");
    }
  }
  return {
    protocolRoot,
    dryRun: !!args.dryRun,
    created,
    skipped
  };
}
function registerProtocolTools(server, ctx) {
  const rootPathSchema = z8.string().optional().describe(
    `Absolute path to the project root. Optional \u2014 defaults to the server's configured root (${ctx.defaultRootPath}).`
  );
  const resolveRoot = (rootPath) => rootPath ?? ctx.defaultRootPath;
  server.tool(
    "prepare_protocol_bootstrap",
    "Inspects the workspace and returns the guided questions an agent should ask before initializing Tessera Protocols. Does not write files.",
    { rootPath: rootPathSchema },
    async (args) => jsonResult2(await handlePrepareProtocolBootstrap({ rootPath: resolveRoot(args.rootPath) }))
  );
  server.tool(
    "apply_protocol_bootstrap",
    "Creates a baseline .tessera-protocols folder from explicit user-confirmed bootstrap answers. Existing files are skipped unless overwrite=true.",
    {
      rootPath: rootPathSchema,
      projectName: z8.string().describe("Project or workspace name supplied by the user"),
      userId: z8.string().optional().describe("Identifier to use in confirmed_by fields"),
      goals: z8.array(z8.object({
        title: z8.string(),
        outcome: z8.string(),
        successCriteria: z8.array(z8.string()),
        nonGoals: z8.array(z8.string()).optional(),
        priority: z8.enum(["high", "medium", "low"]).optional(),
        targetDate: z8.string().nullable().optional(),
        system: z8.string().nullable().optional()
      })).describe("User-confirmed active goals"),
      userCapabilities: z8.array(z8.object({
        title: z8.string(),
        system: z8.string().optional(),
        evidenceLevel: z8.enum(["demonstrated", "declared", "uncertain"]),
        evidence: z8.string(),
        limits: z8.string().optional()
      })).optional(),
      agentCapabilities: z8.array(z8.object({
        title: z8.string(),
        system: z8.string().optional(),
        limit: z8.string()
      })).optional(),
      comprehensionRecords: z8.array(z8.object({
        title: z8.string(),
        filename: z8.string().optional(),
        system: z8.string().nullable().optional(),
        element: z8.string(),
        elementType: z8.enum(["tessera-element", "concept", "cross-cutting"]).optional(),
        claimedUnderstanding: z8.string(),
        knownGaps: z8.string().optional(),
        assumptionsToVerify: z8.string().optional(),
        evidence: z8.array(z8.string()).optional(),
        evidenceLevel: z8.enum(["demonstrated", "declared", "uncertain"]).optional(),
        status: z8.enum(["proposed", "confirmed"]).optional(),
        source: z8.enum(["agent", "user", "joint"]).optional()
      })).optional(),
      sessionScope: z8.string().optional(),
      openAssumptions: z8.array(z8.string()).optional(),
      dryRun: z8.boolean().optional(),
      overwrite: z8.boolean().optional()
    },
    async (args) => jsonResult2(await handleApplyProtocolBootstrap({
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
      overwrite: args.overwrite
    }))
  );
}
async function pathExists(path) {
  try {
    await access2(path);
    return true;
  } catch {
    return false;
  }
}
function protocolReadme(projectName) {
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
function activeGoalsContent(goals, today, userId) {
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
function userCapabilityContent(capabilities, today) {
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
function agentCapabilityContent(capabilities, today) {
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
function comprehensionIndexContent(records) {
  if (records.length === 0) {
    return "# Comprehension Index\n\nNo comprehension records have been created yet.\n";
  }
  return `# Comprehension Index

${records.map((record) => `- [${record.title}](./${comprehensionFilename(record)}) \u2014 ${record.element}`).join("\n")}
`;
}
function currentSessionContent(projectName, sessionScope, openAssumptions) {
  return `# Session: ${(/* @__PURE__ */ new Date()).toISOString().slice(0, 16).replace("T", " ")}

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
function comprehensionRecordContent(record, today, userId) {
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
function comprehensionFilename(record) {
  if (record.filename) return record.filename.endsWith(".md") ? record.filename : `${record.filename}.md`;
  const system = record.system ?? "workspace";
  const topic = record.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return `${system}--${topic || "comprehension"}.md`;
}
function markdownList(items) {
  if (items.length === 0) return "- None recorded.";
  return items.map((item) => `- ${item}`).join("\n");
}
function yamlNullable(value) {
  if (!value) return "null";
  return value;
}
function escapeYamlString(value) {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}
function jsonResult2(data) {
  return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
}

// tools/workflows/workflows.ts
import { access as access3, readFile as readFile7, writeFile as writeFile6 } from "node:fs/promises";
import { join as join11, resolve as resolve11 } from "node:path";
import { execFile as execFile2 } from "node:child_process";
import { promisify as promisify2 } from "node:util";
import { z as z9 } from "zod";
var execFileAsync2 = promisify2(execFile2);
async function handleReviewArchitectureDrift(args) {
  const rootPath = resolve11(args.rootPath);
  const [stale, orphans, brokenLinks, mixedLayers, fileDrift] = await Promise.all([
    handleValidateStaleness({ rootPath }),
    handleFindOrphans({ rootPath }),
    handleCheckLinks({ rootPath }),
    handleFindMixedLayers({ rootPath }),
    handleValidateFiles({ rootPath })
  ]);
  const plan = [];
  for (const item of brokenLinks.brokenLinks) {
    plan.push({
      priority: "high",
      category: "broken-link",
      path: item.sourcePath,
      action: `Fix or remove ${item.direction} link to ${item.targetPath}.`
    });
  }
  for (const item of mixedLayers.mixedLayers) {
    plan.push({
      priority: "high",
      category: "mixed-layers",
      path: item.parentPath,
      action: `Restructure children so they share one layer type: ${item.layersFound.join(", ")}.`
    });
  }
  for (const item of fileDrift.modules) {
    const parts = [
      item.undocumentedFiles.length ? `${item.undocumentedFiles.length} undocumented file(s)` : "",
      item.missingFiles.length ? `${item.missingFiles.length} missing documented file(s)` : "",
      item.filesMissingPinningRationale.length ? `${item.filesMissingPinningRationale.length} missing pinning rationale(s)` : ""
    ].filter(Boolean);
    plan.push({
      priority: "medium",
      category: "file-drift",
      path: item.relativePath,
      action: `Update ## Files: ${parts.join(", ")}.`
    });
  }
  for (const item of stale.staleElements) {
    plan.push({
      priority: "medium",
      category: "stale-doc",
      path: item.relativePath,
      action: "Review changed code and update architecture.md semantics if behavior, interfaces, or dependencies changed."
    });
  }
  for (const item of orphans.orphans) {
    plan.push({
      priority: "low",
      category: "orphan",
      path: item.path,
      action: `Create architecture.md or mark folder as pass-through. Suggested layer: ${item.suggestedLayer}.`
    });
  }
  return {
    summary: {
      stale: stale.staleCount,
      untracked: stale.untrackedCount,
      orphans: orphans.orphanCount,
      brokenLinks: brokenLinks.brokenCount,
      mixedLayers: mixedLayers.mixedCount,
      fileDrift: fileDrift.driftedModules
    },
    plan,
    raw: { stale, orphans, brokenLinks, mixedLayers, fileDrift }
  };
}
async function handleUpdateStaleDocumentation(args) {
  const rootPath = resolve11(args.rootPath);
  const config = await loadConfig(rootPath);
  const tree = await buildArchitectureTree(rootPath, config);
  const elements = flattenTree(tree).filter(
    (el) => args.elementPath ? normalize2(el.relativePath) === normalize2(args.elementPath) || normalize2(el.relativePath).startsWith(`${normalize2(args.elementPath)}/`) : true
  );
  const fileDrift = await handleValidateFiles({ rootPath });
  const stale = await handleValidateStaleness({ rootPath });
  const drafts = [];
  for (const el of elements) {
    const drift = fileDrift.modules.find((m) => normalize2(m.relativePath) === normalize2(el.relativePath));
    const staleEntry = stale.staleElements.find((s) => normalize2(s.relativePath) === normalize2(el.relativePath));
    if (!drift && !staleEntry) continue;
    const archPath = join11(el.path, ARCHITECTURE_FILENAME);
    let currentContent = "";
    try {
      currentContent = await readFile7(archPath, "utf-8");
    } catch {
      continue;
    }
    const reasons = [];
    if (drift) {
      if (drift.undocumentedFiles.length) reasons.push(`Undocumented files: ${drift.undocumentedFiles.join(", ")}`);
      if (drift.missingFiles.length) reasons.push(`Documented files no longer on disk: ${drift.missingFiles.join(", ")}`);
      if (drift.filesMissingPinningRationale.length) reasons.push(`Missing pinning rationales: ${drift.filesMissingPinningRationale.join(", ")}`);
    }
    if (staleEntry) reasons.push("Code changed after architecture.md; semantic review required.");
    const proposedContent = drift ? replaceFilesSection(currentContent, el) : currentContent;
    const shouldApply = !!args.applyFileSections && proposedContent !== currentContent;
    if (shouldApply) {
      await writeFile6(archPath, proposedContent, "utf-8");
    }
    drafts.push({
      elementPath: el.relativePath,
      name: el.name,
      reasons,
      currentContent,
      proposedContent,
      applied: shouldApply,
      semanticReviewRequired: !!staleEntry
    });
  }
  return {
    dryRun: !args.applyFileSections,
    note: "This tool only drafts/applies deterministic ## Files synchronization. Semantic changes still require agent/user review before apply_documentation_updates.",
    drafts
  };
}
async function handleApplyDocumentationUpdates(args) {
  const rootPath = resolve11(args.rootPath);
  const results = [];
  for (const update of args.updates) {
    const archPath = join11(rootPath, update.elementPath, ARCHITECTURE_FILENAME);
    try {
      await access3(archPath);
      if (!args.dryRun) {
        await writeFile6(archPath, update.content, "utf-8");
      }
      results.push({ elementPath: update.elementPath, path: archPath, applied: !args.dryRun });
    } catch (err) {
      results.push({
        elementPath: update.elementPath,
        path: archPath,
        applied: false,
        error: err instanceof Error ? err.message : String(err)
      });
    }
  }
  return { dryRun: !!args.dryRun, updated: results.filter((r) => r.applied).length, results };
}
async function handlePrepareArchitecturePrSummary(args) {
  const rootPath = resolve11(args.rootPath);
  const status = await git(rootPath, ["status", "--short"]);
  const diffNames = await git(rootPath, ["diff", "--name-status", "HEAD"]);
  const changed = diffNames.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const archFiles = changed.filter((line) => line.includes(ARCHITECTURE_FILENAME));
  const codeFiles = changed.filter((line) => !line.includes(ARCHITECTURE_FILENAME));
  let affectedElements = [];
  try {
    const config = await loadConfig(rootPath);
    const tree = await buildArchitectureTree(rootPath, config);
    const elements = flattenTree(tree);
    const set = /* @__PURE__ */ new Set();
    for (const line of changed) {
      const file = line.replace(/^[A-Z?]+\s+/, "").replace(/\\/g, "/");
      const owner = findOwningElement2(elements, file);
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
      "- Check dependency links when interfaces or call paths changed."
    ].join("\n")
  };
}
async function handleBootstrapTesseraProject(args) {
  const rootPath = resolve11(args.rootPath);
  const [architecture, protocols] = await Promise.all([
    handleScaffoldExistingCodebase({ rootPath }),
    handlePrepareProtocolBootstrap({ rootPath })
  ]);
  return {
    architecture,
    protocols,
    nextSteps: [
      "Review architecture.proposals with the user, then call apply_scaffold for approved elements.",
      "Ask protocols.questions in chat, then call apply_protocol_bootstrap with explicit user-confirmed answers.",
      "Run review_architecture_drift after bootstrap to catch any missing metadata or file drift."
    ]
  };
}
async function handleSuggestArchitectureImprovements(args) {
  const rootPath = resolve11(args.rootPath);
  const config = await loadConfig(rootPath);
  const tree = await buildArchitectureTree(rootPath, config);
  const elements = flattenTree(tree);
  const [mixed, links, files, orphans] = await Promise.all([
    handleFindMixedLayers({ rootPath }),
    handleCheckLinks({ rootPath }),
    handleValidateFiles({ rootPath }),
    handleFindOrphans({ rootPath })
  ]);
  const suggestions = [];
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
async function handleGenerateArchitectureDiagram(args) {
  const rootPath = resolve11(args.rootPath);
  const config = await loadConfig(rootPath);
  const tree = await buildArchitectureTree(rootPath, config);
  const element = args.elementPath ? getElementByPath(tree, args.elementPath) : tree.root;
  if (!element) throw new Error(`Element not found: ${args.elementPath}`);
  const mermaid = await buildDiagram(rootPath, tree, element, args.diagramType);
  let savedPath = null;
  if (args.save) {
    const filename = `${args.diagramType}.mermaid.md`;
    savedPath = join11(element.path, filename);
    await writeFile6(savedPath, `# ${titleCase(args.diagramType)}

\`\`\`mermaid
${mermaid}
\`\`\`
`, "utf-8");
  }
  return {
    diagramType: args.diagramType,
    elementPath: element.relativePath,
    mermaid,
    savedPath
  };
}
async function handleGenerateSystemMap(args) {
  return handleGenerateArchitectureDiagram({ rootPath: args.rootPath, diagramType: "system-map", save: args.save });
}
async function handleValidateReleaseReadiness(args) {
  const rootPath = resolve11(args.rootPath);
  const checks = [];
  const has = async (rel) => pathExists2(join11(rootPath, rel));
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
      detail: pkg ? `name=${pkg.name}` : "package.json could not be read"
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
    checks
  };
}
function registerWorkflowTools(server, ctx) {
  const rootPathSchema = z9.string().optional().describe(`Absolute path to the project root. Optional \u2014 defaults to the server's configured root (${ctx.defaultRootPath}).`);
  const resolveRoot = (rootPath) => rootPath ?? ctx.defaultRootPath;
  server.tool("review_architecture_drift", "Aggregates stale docs, orphan folders, broken links, mixed layers, and file drift into a prioritized update plan.", { rootPath: rootPathSchema }, async (args) => {
    const rootPath = resolveRoot(args.rootPath);
    return jsonResultWithDrift(await handleReviewArchitectureDrift({ rootPath }), { rootPath });
  });
  server.tool("update_stale_documentation", "Plans documentation updates for stale/drifted elements. By default this is a dry run; set applyFileSections=true to apply only deterministic ## Files synchronization.", {
    rootPath: rootPathSchema,
    elementPath: z9.string().optional(),
    applyFileSections: z9.boolean().optional()
  }, async (args) => {
    const rootPath = resolveRoot(args.rootPath);
    return jsonResultWithDrift(await handleUpdateStaleDocumentation({ rootPath, elementPath: args.elementPath, applyFileSections: args.applyFileSections }), { rootPath, elementPath: args.elementPath });
  });
  server.tool("apply_documentation_updates", "Applies exact reviewed replacement content to architecture.md files. Use after update_stale_documentation or human/agent review.", {
    rootPath: rootPathSchema,
    updates: z9.array(z9.object({ elementPath: z9.string(), content: z9.string() })),
    dryRun: z9.boolean().optional()
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
    diagramType: z9.enum(["flowchart", "system-map", "dependency-graph", "ownership-map", "tag-map", "staleness-report", "file-coverage-report", "context-view", "container-view", "component-view"]),
    elementPath: z9.string().optional(),
    save: z9.boolean().optional()
  }, async (args) => {
    const rootPath = resolveRoot(args.rootPath);
    return jsonResultWithDrift(await handleGenerateArchitectureDiagram({ rootPath, diagramType: args.diagramType, elementPath: args.elementPath, save: args.save }), { rootPath, elementPath: args.elementPath });
  });
  server.tool("generate_system_map", "Convenience command that generates a Mermaid system map from the current architecture tree.", {
    rootPath: rootPathSchema,
    save: z9.boolean().optional()
  }, async (args) => {
    const rootPath = resolveRoot(args.rootPath);
    return jsonResultWithDrift(await handleGenerateSystemMap({ rootPath, save: args.save }), { rootPath });
  });
  server.tool("validate_release_readiness", "Checks package/spec metadata and build artifacts for MCP, extension, framework, or protocol release readiness.", {
    rootPath: rootPathSchema,
    target: z9.enum(["mcp", "extension", "framework", "protocol"])
  }, async (args) => {
    const rootPath = resolveRoot(args.rootPath);
    return jsonResultWithDrift(await handleValidateReleaseReadiness({ rootPath, target: args.target }), { rootPath });
  });
}
async function buildDiagram(rootPath, tree, element, type) {
  const elements = flattenTree(tree);
  if (type === "dependency-graph") return dependencyGraph(elements);
  if (type === "ownership-map") return ownershipMap(elements);
  if (type === "tag-map") return tagMap(elements);
  if (type === "staleness-report") return stalenessReport(rootPath);
  if (type === "file-coverage-report") return fileCoverageReport(rootPath);
  if (type === "system-map") return systemMap(tree);
  return hierarchyGraph(element, type);
}
function hierarchyGraph(root, type) {
  const lines = ["graph TD", `  ${nodeId(root.relativePath)}["${escapeLabel(root.name)}<br/>${root.layer}"]`];
  const walk = (el) => {
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
function systemMap(tree) {
  const root = tree.root;
  const systems = root.layer === Layer.Landscape ? root.children : [root];
  const lines = ["graph LR", `  landscape["${escapeLabel(root.name)}<br/>${root.layer}"]`];
  for (const sys of systems) {
    lines.push(`  landscape --> ${nodeId(sys.relativePath)}["${escapeLabel(sys.name)}<br/>${sys.layer}"]`);
  }
  addDependencyLines(lines, systems.length ? flattenFrom(systems) : [root]);
  return lines.join("\n");
}
function dependencyGraph(elements) {
  const lines = ["graph LR"];
  for (const el of elements) lines.push(`  ${nodeId(el.relativePath)}["${escapeLabel(el.name)}"]`);
  addDependencyLines(lines, elements);
  return lines.join("\n");
}
function ownershipMap(elements) {
  const lines = ["graph TD"];
  const byOwner = /* @__PURE__ */ new Map();
  for (const el of elements) {
    const owner = el.metadata.owner || "Unowned";
    if (!byOwner.has(owner)) byOwner.set(owner, []);
    byOwner.get(owner).push(el);
  }
  let i = 0;
  for (const [owner, owned] of byOwner) {
    const ownerId = `owner_${i++}`;
    lines.push(`  ${ownerId}["${escapeLabel(owner)}"]`);
    for (const el of owned) lines.push(`  ${ownerId} --> ${nodeId(el.relativePath)}["${escapeLabel(el.name)}<br/>${el.layer}"]`);
  }
  return lines.join("\n");
}
function tagMap(elements) {
  const lines = ["graph TD"];
  const tags = /* @__PURE__ */ new Map();
  for (const el of elements) {
    for (const tag of el.metadata.tags) {
      if (!tags.has(tag)) tags.set(tag, []);
      tags.get(tag).push(el);
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
async function stalenessReport(rootPath) {
  const stale = await handleValidateStaleness({ rootPath });
  const lines = ["graph TD", `  summary["Stale: ${stale.staleCount}<br/>Untracked: ${stale.untrackedCount}"]`];
  for (const item of stale.staleElements) lines.push(`  summary --> ${nodeId(item.relativePath)}["${escapeLabel(item.name)}<br/>stale"]`);
  for (const item of stale.untrackedElements) lines.push(`  summary --> ${nodeId(item.relativePath)}["${escapeLabel(item.name)}<br/>untracked"]`);
  return lines.join("\n");
}
async function fileCoverageReport(rootPath) {
  const files = await handleValidateFiles({ rootPath });
  const lines = ["graph TD", `  summary["Clean: ${files.cleanModules}<br/>Drifted: ${files.driftedModules}"]`];
  for (const item of files.modules) {
    lines.push(`  summary --> ${nodeId(item.relativePath)}["${escapeLabel(item.name)}<br/>${item.documentedCount}/${item.totalOnDisk} documented"]`);
  }
  return lines.join("\n");
}
function addDependencyLines(lines, elements) {
  const byArchPath = /* @__PURE__ */ new Map();
  for (const el of elements) {
    byArchPath.set(`${normalize2(el.relativePath)}/${ARCHITECTURE_FILENAME}`.replace(/^\.\//, ""), el);
  }
  for (const el of elements) {
    for (const dep of el.metadata.dependsOn) {
      const normalized = normalize2(join11(normalize2(el.relativePath), dep));
      const target = byArchPath.get(normalized) ?? byArchPath.get(normalize2(dep));
      if (target) lines.push(`  ${nodeId(el.relativePath)} --> ${nodeId(target.relativePath)}`);
    }
  }
}
function replaceFilesSection(content, element) {
  const fileLines = element.files.map((file) => `- \`${file.name}\` \u2014 ${file.description || (element.layer === Layer.Module ? "TODO: describe this file." : "TODO: add pinning rationale.")}`).join("\n");
  const section = `## Files
${fileLines || "- None."}`;
  if (/^## Files\s*\n[\s\S]*?(?=^##\s|\s*$)/m.test(content)) {
    return content.replace(/^## Files\s*\n[\s\S]*?(?=^##\s|\s*$)/m, section);
  }
  const metadataIndex = content.search(/^## Metadata\s*$/m);
  if (metadataIndex >= 0) return `${content.slice(0, metadataIndex).trimEnd()}

${section}

${content.slice(metadataIndex)}`;
  return `${content.trimEnd()}

${section}
`;
}
async function checkFile(rootPath, relPath, name) {
  const exists = await pathExists2(join11(rootPath, relPath));
  return { name, status: exists ? "pass" : "fail", detail: relPath };
}
async function packageJsonCheck(rootPath, field, name) {
  const pkg = await readPackage(rootPath);
  const ok = !!pkg && Object.prototype.hasOwnProperty.call(pkg, field);
  return { name, status: ok ? "pass" : "fail", detail: ok ? `${field} present` : `${field} missing` };
}
async function readPackage(rootPath) {
  try {
    return JSON.parse(await readFile7(join11(rootPath, "package.json"), "utf-8"));
  } catch {
    return null;
  }
}
async function pathExists2(path) {
  try {
    await access3(path);
    return true;
  } catch {
    return false;
  }
}
async function git(cwd, args) {
  try {
    const { stdout } = await execFileAsync2("git", args, { cwd });
    return stdout;
  } catch {
    return "";
  }
}
function findOwningElement2(elements, filePath) {
  const file = normalize2(filePath);
  const sorted = [...elements].sort((a, b) => normalize2(b.relativePath).split("/").length - normalize2(a.relativePath).split("/").length);
  for (const el of sorted) {
    const rel = normalize2(el.relativePath);
    if (rel === "." || rel === "") continue;
    if (file === rel || file.startsWith(`${rel}/`)) return el;
  }
  return null;
}
function flattenFrom(elements) {
  return elements.flatMap((el) => [el, ...flattenFrom(el.children)]);
}
function nodeId(path) {
  return `n_${slug(path || "root")}`;
}
function slug(value) {
  return value.replace(/[^a-zA-Z0-9]/g, "_").replace(/^_+|_+$/g, "") || "root";
}
function normalize2(path) {
  return path.replace(/\\/g, "/").replace(/^\.\//, "").replace(/\/$/, "");
}
function escapeLabel(value) {
  return value.replace(/"/g, '\\"');
}
function titleCase(value) {
  return value.replace(/-/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

// index.ts
async function main() {
  const ctx = {
    defaultRootPath: resolveDefaultRootPath(process.argv.slice(2), process.env, process.cwd())
  };
  console.error(`[${PRODUCT_NAME}] default root: ${ctx.defaultRootPath}`);
  const server = new McpServer({
    name: PRODUCT_NAME,
    version: "0.1.0"
  });
  registerReadTools(server, ctx);
  registerWriteTools(server, ctx);
  registerContextTools(server, ctx);
  registerValidationTools(server, ctx);
  registerDiagramTools(server, ctx);
  registerScaffoldTools(server, ctx);
  registerDocsTools(server, ctx);
  registerProtocolTools(server, ctx);
  registerWorkflowTools(server, ctx);
  const transport = new StdioServerTransport();
  await server.connect(transport);
}
main().catch((err) => {
  console.error("Fatal error starting MCP server:", err);
  process.exit(1);
});
