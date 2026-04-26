import { readdir, stat } from "node:fs/promises";
import { join, relative, basename } from "node:path";
import {
  Layer,
  DEPTH_TO_LAYER,
  ARCHITECTURE_FILENAME,
  CONFIG_DIR,
  depthToLayerMap,
  DEFAULT_WORKSPACE_MODE,
  type WorkspaceMode,
} from "../../shared/constants/constants.js";
import type { ArchitectureElement, ArchitectureTree, ConfigFile, FileInfo } from "../../shared/types/types.js";
import type { Dirent } from "node:fs";
import { parseArchitectureMd } from "../parser/parser.js";
import { matchesIgnorePattern } from "./ignore.js";
import { flattenElements as flattenElementsShared } from "@tessera/shared/utils";

/**
 * Builds the full architecture tree by recursively walking the filesystem.
 * Respects ignore patterns from config. Infers layer from depth and folder contents.
 */
export async function buildArchitectureTree(
  rootPath: string,
  config: ConfigFile,
): Promise<ArchitectureTree> {
  const mode: WorkspaceMode = config.workspaceMode ?? DEFAULT_WORKSPACE_MODE;
  const root = await traverseDirectory(rootPath, rootPath, 0, config, mode);
  return { root, rootPath };
}

/**
 * Checks whether a directory contains an architecture.md file.
 */
async function hasArchitectureMd(dirPath: string): Promise<boolean> {
  try {
    await stat(join(dirPath, ARCHITECTURE_FILENAME));
    return true;
  } catch {
    return false;
  }
}

/**
 * Recursively traverses a directory and builds an ArchitectureElement.
 * Folders without architecture.md are treated as pass-through — their children
 * are promoted to the parent level and inherit the parent's architectural depth.
 */
async function traverseDirectory(
  dirPath: string,
  rootPath: string,
  depth: number,
  config: ConfigFile,
  mode: WorkspaceMode,
): Promise<ArchitectureElement> {
  const name = depth === 0 ? basename(rootPath) : basename(dirPath);
  const relPath = relative(rootPath, dirPath) || ".";

  // Read architecture.md if it exists
  const archMdPath = join(dirPath, ARCHITECTURE_FILENAME);
  let overview = "";
  let metadata = defaultMetadata(Layer.Module);
  let documentedFiles: import("../../shared/types/types.js").FileInfo[] = [];
  try {
    const parsed = await parseArchitectureMd(archMdPath);
    overview = parsed.overview;
    metadata = parsed.metadata;
    documentedFiles = parsed.files ?? [];
  } catch {
    // No architecture.md or parse error — use defaults
  }

  // List subdirectories. An architecture.md is an explicit opt-in that
  // overrides the ignore list — folders like docs/, adrs/, .claude/ can
  // still participate in the tree if the user has documented them.
  const entries = await readdir(dirPath, { withFileTypes: true });
  const subdirs = entries.filter((e) => e.isDirectory());

  // Recurse into subdirectories, promoting children of pass-through folders
  const children: ArchitectureElement[] = [];
  for (const sub of subdirs) {
    const subPath = join(dirPath, sub.name);
    const subHasArch = await hasArchitectureMd(subPath);
    const ignored = matchesIgnorePattern(sub.name, config.ignore);

    if (ignored && !subHasArch) continue;

    if (subHasArch || depth === 0) {
      // Normal case: folder has architecture.md (or is root), treat as element
      const child = await traverseDirectory(subPath, rootPath, depth + 1, config, mode);
      children.push(child);
    } else {
      // Pass-through: folder has no architecture.md — promote its children
      const promoted = await collectPromotedChildren(subPath, rootPath, depth + 1, config, mode);
      children.push(...promoted);
    }
  }

  // Infer layer: if it has children, use depth mapping for the current
  // workspace mode; otherwise Module. In landscape mode the root is L0
  // Landscape, top-level folders are L1 Contexts, and so on.
  const depthMap = depthToLayerMap(mode);
  const layer = children.length > 0
    ? depthMap[depth] ?? Layer.Component
    : Layer.Module;

  // Override with parsed metadata layer if available
  const finalLayer = metadata.layer !== Layer.Module ? metadata.layer : layer;

  // File collection (see ADR-016): every layer collects direct files from
  // disk so scattered/pinned files are visible in the tree and can be
  // rendered on the canvas. Files in child element folders are not included
  // here — they belong to the child. Undocumented files appear with empty
  // descriptions and are surfaced by validate_files / the drift-tax as drift.
  let files: import("../../shared/types/types.js").FileInfo[] = [];
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
    files,
  };
}

/**
 * Collects children from a pass-through folder (no architecture.md).
 * Recurses through nested pass-through folders until it finds folders with
 * architecture.md or leaf folders.
 */
async function collectPromotedChildren(
  dirPath: string,
  rootPath: string,
  depth: number,
  config: ConfigFile,
  mode: WorkspaceMode,
): Promise<ArchitectureElement[]> {
  const entries = await readdir(dirPath, { withFileTypes: true });
  const subdirs = entries.filter((e) => e.isDirectory());

  const promoted: ArchitectureElement[] = [];
  for (const sub of subdirs) {
    const subPath = join(dirPath, sub.name);
    const subHasArch = await hasArchitectureMd(subPath);
    const ignored = matchesIgnorePattern(sub.name, config.ignore);

    if (ignored && !subHasArch) continue;

    if (subHasArch) {
      // Found an architectural element — traverse it at the current depth
      const child = await traverseDirectory(subPath, rootPath, depth, config, mode);
      promoted.push(child);
    } else {
      // Another pass-through folder — keep looking deeper
      const deeper = await collectPromotedChildren(subPath, rootPath, depth, config, mode);
      promoted.push(...deeper);
    }
  }
  return promoted;
}

/**
 * Collects files from a Docs layer element.
 * All files are marked as documented — they ARE the documentation.
 */
function collectDocsFiles(entries: Dirent[]): FileInfo[] {
  const files: FileInfo[] = [];
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    if (entry.name === ARCHITECTURE_FILENAME) continue;
    if (entry.name.endsWith(".mermaid.md")) continue;

    const ext = entry.name.includes(".") ? entry.name.split(".").pop() ?? "" : "";
    files.push({
      name: entry.name,
      extension: ext,
      description: "",
      documented: true,
    });
  }
  return files;
}

/**
 * Merges actual files on disk with documented files from ## Files section.
 * Files on disk not in docs appear as undocumented. Files in docs not on disk are excluded.
 */
function mergeFileInfo(entries: Dirent[], documentedFiles: FileInfo[]): FileInfo[] {
  const docMap = new Map(documentedFiles.map((f) => [f.name, f]));
  const files: FileInfo[] = [];

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
      documented: !!doc,
    });
  }

  return files;
}

/**
 * Finds an element in the tree by its relative path.
 */
export function getElementByPath(
  tree: ArchitectureTree,
  relativePath: string,
): ArchitectureElement | null {
  const normalized = relativePath.replace(/\\/g, "/");
  if (normalized === "." || normalized === "") return tree.root;

  return findElement(tree.root, normalized);
}

function findElement(
  element: ArchitectureElement,
  relativePath: string,
): ArchitectureElement | null {
  const normalized = element.relativePath.replace(/\\/g, "/");
  if (normalized === relativePath) return element;

  for (const child of element.children) {
    const found = findElement(child, relativePath);
    if (found) return found;
  }
  return null;
}

/**
 * Flattens the tree into an array of all elements for searching.
 * Re-exports flattenElements from shared, maintaining the existing API name.
 */
export function flattenTree(tree: ArchitectureTree): ArchitectureElement[] {
  return flattenElementsShared(tree.root);
}

function defaultMetadata(layer: Layer): import("../../shared/types/types.js").ElementMetadata {
  return {
    layer,
    tags: [],
    dependsOn: [],
    dependedBy: [],
    owner: "",
    status: "Planned",
  };
}
