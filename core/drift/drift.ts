import { resolve } from "node:path";
import { simpleGit } from "simple-git";
import type { ArchitectureElement, ArchitectureTree } from "../../shared/types/types.js";
import { buildArchitectureTree, flattenTree } from "../tree/tree.js";
import { loadConfig } from "../config/config.js";
import {
  handleValidateFiles,
  handleCheckLinks,
  handleFindOrphans,
} from "../../tools/validation/validation.js";

/**
 * Wall 2 of the drift-enforcement bundle (see ADR-015). Computes a short,
 * scoped drift footer appended to MCP tool responses. Scope is:
 *
 *   (element targeted by current call) ∪ (elements containing git-dirty files)
 *
 * A global "drift exists somewhere" footer is noise. A scoped footer naming
 * the element the agent just worked with is actionable and hard to ignore.
 */

const MAX_ITEMS = 10;

export interface DriftFooterArgs {
  /** Absolute project root */
  rootPath: string;
  /** Optional relative path of the element the current tool call targets */
  elementPath?: string;
}

/** Content block type matching MCP SDK's text response shape */
type TextBlock = { type: "text"; text: string };
type ToolResult = { content: TextBlock[]; isError?: boolean };

/**
 * Computes the drift footer string. Returns null when:
 *   - the user opted out via `suppress_drift_warnings: true`
 *   - the scope is empty and no drift exists
 *   - we can't read the project (missing config, git error in a non-git dir, etc.)
 */
export async function computeDriftFooter(args: DriftFooterArgs): Promise<string | null> {
  const absRoot = resolve(args.rootPath);
  let config;
  try {
    config = await loadConfig(absRoot);
  } catch {
    return null;
  }
  if (config.suppressDriftWarnings) return null;

  let tree: ArchitectureTree;
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

/**
 * Appends the drift footer to a tool result, mutating nothing. No-op when
 * the footer is empty. Callers route every tool response through this.
 */
export async function withDriftFooter(
  result: ToolResult,
  args: DriftFooterArgs,
): Promise<ToolResult> {
  const footer = await computeDriftFooter(args);
  if (!footer) return result;
  return {
    ...result,
    content: [...result.content, { type: "text", text: footer }],
  };
}

/**
 * Convenience wrapper: serialises `data` as a JSON text block and appends
 * the drift footer in one call. Most tool handlers should use this instead
 * of the per-file `jsonResult` + manual `withDriftFooter`.
 */
export async function jsonResultWithDrift(
  data: unknown,
  args: DriftFooterArgs,
): Promise<ToolResult> {
  const base: ToolResult = {
    content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
  };
  return withDriftFooter(base, args);
}

// ── Scope resolution ──

async function resolveScope(
  rootPath: string,
  tree: ArchitectureTree,
  explicitElementPath?: string,
): Promise<Set<string>> {
  const scope = new Set<string>();
  const elements = flattenTree(tree);

  // Explicit target — include the element and its subtree.
  if (explicitElementPath) {
    const normalized = normalize(explicitElementPath);
    for (const el of elements) {
      const elPath = normalize(el.relativePath);
      if (elPath === normalized || elPath.startsWith(normalized + "/")) {
        scope.add(elPath);
      }
    }
  }

  // Git-dirty files — include the element that owns each one.
  const dirtyFiles = await gitDirtyFiles(rootPath);
  for (const file of dirtyFiles) {
    const owner = findOwningElement(elements, file);
    if (owner) scope.add(normalize(owner.relativePath));
  }

  return scope;
}

async function gitDirtyFiles(rootPath: string): Promise<string[]> {
  try {
    const git = simpleGit(rootPath);
    const status = await git.status();
    const paths = new Set<string>();
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

function findOwningElement(
  elements: ArchitectureElement[],
  filePath: string,
): ArchitectureElement | null {
  const file = normalize(filePath);
  // Deepest match wins — sort elements by path depth descending.
  const sorted = [...elements].sort(
    (a, b) => pathDepth(b.relativePath) - pathDepth(a.relativePath),
  );
  for (const el of sorted) {
    const elPath = normalize(el.relativePath);
    if (elPath === "." || elPath === "") continue;
    if (file === elPath || file.startsWith(elPath + "/")) return el;
  }
  return null;
}

// ── Drift collection (scoped) ──

interface DriftItem {
  elementPath: string;
  message: string;
}

async function collectScopedDrift(
  rootPath: string,
  tree: ArchitectureTree,
  scope: Set<string>,
): Promise<DriftItem[]> {
  const items: DriftItem[] = [];

  // File-level drift (undocumented / missing files in Modules).
  try {
    const fileResult = await handleValidateFiles({ rootPath });
    for (const m of fileResult.modules) {
      const rel = normalize(m.relativePath);
      if (!scope.has(rel)) continue;
      if (m.undocumentedFiles.length > 0) {
        items.push({
          elementPath: rel,
          message: `${m.undocumentedFiles.length} undocumented file${
            m.undocumentedFiles.length === 1 ? "" : "s"
          } (${m.undocumentedFiles.slice(0, 3).map(quote).join(", ")}${
            m.undocumentedFiles.length > 3 ? ", …" : ""
          }). Run \`update_element\`.`,
        });
      }
      if (m.missingFiles.length > 0) {
        items.push({
          elementPath: rel,
          message: `${m.missingFiles.length} documented file${
            m.missingFiles.length === 1 ? "" : "s"
          } no longer on disk (${m.missingFiles.slice(0, 3).map(quote).join(", ")}${
            m.missingFiles.length > 3 ? ", …" : ""
          }). Run \`update_element\`.`,
        });
      }
      // ADR-016: non-Module ## Files entries need a pinning rationale so
      // readers understand why the file lives at a non-Module layer.
      if (m.filesMissingPinningRationale.length > 0) {
        items.push({
          elementPath: rel,
          message: `${m.filesMissingPinningRationale.length} pinned file${
            m.filesMissingPinningRationale.length === 1 ? "" : "s"
          } missing rationale (${m.filesMissingPinningRationale
            .slice(0, 3)
            .map(quote)
            .join(", ")}${m.filesMissingPinningRationale.length > 3 ? ", …" : ""}). Add a short "why is this here?" note to each description.`,
        });
      }
    }
  } catch {
    // validation failure — skip this category
  }

  // Broken relationship links (source or target in scope).
  try {
    const linkResult = await handleCheckLinks({ rootPath });
    for (const b of linkResult.brokenLinks) {
      const src = normalize(b.sourcePath);
      if (!scope.has(src)) continue;
      items.push({
        elementPath: src,
        message: `broken ${b.direction} link → \`${b.targetPath}\`. Run \`check_links\`.`,
      });
    }
  } catch {
    // skip
  }

  // Orphans (code folders without architecture.md) under any scoped element.
  try {
    const orphanResult = await handleFindOrphans({ rootPath });
    for (const o of orphanResult.orphans) {
      const op = normalize(o.path);
      if (!isUnderScope(op, scope)) continue;
      items.push({
        elementPath: op,
        message: `code folder without architecture.md (suggested layer: ${o.suggestedLayer}). Run \`create_element\`.`,
      });
    }
  } catch {
    // skip
  }

  return dedupe(items);
}

function isUnderScope(elementPath: string, scope: Set<string>): boolean {
  if (scope.has(elementPath)) return true;
  for (const s of scope) {
    if (s === "." || s === "") continue;
    if (elementPath.startsWith(s + "/")) return true;
  }
  return false;
}

// ── Formatting ──

function formatFooter(items: DriftItem[]): string {
  const lines: string[] = [];
  lines.push("⚠ Drift detected in the elements you touched:");
  const shown = items.slice(0, MAX_ITEMS);
  for (const it of shown) {
    lines.push(`  - \`${it.elementPath}\` — ${it.message}`);
  }
  if (items.length > MAX_ITEMS) {
    lines.push(`  … and ${items.length - MAX_ITEMS} more. Run \`validate_files\` for the full picture.`);
  }
  lines.push(
    "Resolve drift before claiming the task complete (per agent-rules.md). " +
      "Silence temporarily with `suppress_drift_warnings: true` in `.tessera/config.yaml`.",
  );
  return lines.join("\n");
}

// ── Small utilities ──

function normalize(p: string): string {
  return p.replace(/\\/g, "/").replace(/^\.\//, "").replace(/\/$/, "");
}

function pathDepth(p: string): number {
  const n = normalize(p);
  if (n === "" || n === ".") return 0;
  return n.split("/").length;
}

function quote(s: string): string {
  return `\`${s}\``;
}

function dedupe(items: DriftItem[]): DriftItem[] {
  const seen = new Set<string>();
  const out: DriftItem[] = [];
  for (const it of items) {
    const key = `${it.elementPath}::${it.message}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(it);
  }
  return out;
}
