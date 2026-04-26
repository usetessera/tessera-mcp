import { mkdtempSync, rmSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const trackedDirs: Set<string> = new Set();

/**
 * Creates a temporary directory for fixture content. Tracked so that
 * cleanupAllTempDirs() can remove all of them at suite teardown.
 */
export function createTempDir(prefix = "tessera-fixture-"): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  trackedDirs.add(dir);
  return dir;
}

/**
 * Removes every temp dir created via createTempDir. Call from afterAll.
 */
export function cleanupAllTempDirs(): void {
  for (const dir of trackedDirs) {
    try {
      rmSync(dir, { recursive: true, force: true, maxRetries: 3 });
    } catch {
      // Best effort — Windows can hold file handles briefly
    }
  }
  trackedDirs.clear();
}

/**
 * Writes a file under rootPath at the given relative path, creating
 * intermediate directories as needed.
 */
export async function writeFixtureFile(
  rootPath: string,
  relPath: string,
  content: string,
): Promise<void> {
  const fullPath = join(rootPath, relPath);
  await mkdir(dirname(fullPath), { recursive: true });
  await writeFile(fullPath, content, "utf-8");
}

/**
 * Initializes a git repository at rootPath with a stable identity
 * (no GPG signing, fixed user). Returns once `git init` is done.
 */
export async function initGitRepo(rootPath: string): Promise<void> {
  await execFileAsync("git", ["init", "-q", "-b", "main"], { cwd: rootPath });
  await execFileAsync("git", ["config", "user.email", "test@example.com"], { cwd: rootPath });
  await execFileAsync("git", ["config", "user.name", "Tessera Test"], { cwd: rootPath });
  await execFileAsync("git", ["config", "commit.gpgsign", "false"], { cwd: rootPath });
}

/**
 * Stages all current changes under rootPath and commits them. If isoDate
 * is provided, both author and committer dates are set to that value, so
 * `git log --format=%aI` returns it deterministically.
 */
export async function commitAll(
  rootPath: string,
  message: string,
  isoDate?: string,
): Promise<void> {
  await execFileAsync("git", ["add", "-A"], { cwd: rootPath });
  const env = isoDate
    ? { ...process.env, GIT_AUTHOR_DATE: isoDate, GIT_COMMITTER_DATE: isoDate }
    : process.env;
  await execFileAsync(
    "git",
    ["commit", "-q", "-m", message, "--allow-empty"],
    { cwd: rootPath, env },
  );
}

/**
 * Convenience: write a single architecture.md for an element with
 * minimal valid content (title, overview, metadata).
 */
export function archMd(opts: {
  name: string;
  layer: "Context" | "Container" | "Component" | "Module" | "Docs";
  overview?: string;
  tags?: string[];
  dependsOn?: string[];
  dependedBy?: string[];
  files?: { name: string; description: string }[];
  extraSections?: string;
}): string {
  const overview = opts.overview ?? `Auto-generated overview for ${opts.name}.`;
  const tags = `[${(opts.tags ?? []).join(", ")}]`;
  const deps = (links: string[] | undefined): string => {
    if (!links || links.length === 0) return "None";
    return links.map((l) => `[${l}](${l})`).join(", ");
  };
  const filesSection = opts.files && opts.files.length > 0
    ? `\n\n## Files\n${opts.files.map((f) => `- \`${f.name}\` — ${f.description}`).join("\n")}`
    : "";
  const extra = opts.extraSections ? `\n\n${opts.extraSections}` : "";
  return `# ${opts.name}

## Overview
${overview}

## Metadata
- **Layer**: ${opts.layer}
- **Tags**: ${tags}
- **Depends on**: ${deps(opts.dependsOn)}
- **Depended by**: ${deps(opts.dependedBy)}
- **Owner**: @test
- **Status**: Active${filesSection}${extra}
`;
}
