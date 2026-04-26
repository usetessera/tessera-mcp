/**
 * Programmatic fixture builders for tool integration tests.
 *
 * Each builder creates a fresh temp directory representing a known project
 * state and returns its absolute root path. Tests assert the behavior of
 * tool handlers against these states. Temp dirs are tracked centrally and
 * removed by cleanupAllTempDirs() in suite teardown.
 *
 * Fixtures intentionally avoid checked-in files so we can:
 *   - reason about state directly in code,
 *   - control git timestamps for staleness tests,
 *   - avoid nested .git complications.
 */
import {
  archMd,
  commitAll,
  createTempDir,
  initGitRepo,
  writeFixtureFile,
} from "../helpers/fixtures.js";

/**
 * Healthy 3-layer tree with all docs in sync, no orphans, no broken links.
 *
 *   root/                                Context
 *     api/                               Container
 *       routes/                          Component
 *         users/                         Module (users.ts documented)
 *     web/                               Container
 *       components/                      Component
 *         button/                        Module (button.tsx documented)
 */
export async function buildCleanFixture(): Promise<string> {
  const root = createTempDir("tessera-clean-");

  await writeFixtureFile(root, "architecture.md", archMd({
    name: "TestSystem",
    layer: "Context",
    overview: "A clean test system with two containers.",
    tags: ["test", "clean"],
  }));

  // Container: api
  await writeFixtureFile(root, "api/architecture.md", archMd({
    name: "API",
    layer: "Container",
    overview: "HTTP API container.",
    tags: ["backend"],
    dependsOn: ["../web/architecture.md"],
  }));
  await writeFixtureFile(root, "api/routes/architecture.md", archMd({
    name: "Routes",
    layer: "Component",
    overview: "Route handlers for the API.",
  }));
  await writeFixtureFile(root, "api/routes/users/architecture.md", archMd({
    name: "Users",
    layer: "Module",
    files: [{ name: "users.ts", description: "User CRUD handlers." }],
  }));
  await writeFixtureFile(root, "api/routes/users/users.ts", "export const users = [];\n");

  // Container: web
  await writeFixtureFile(root, "web/architecture.md", archMd({
    name: "Web",
    layer: "Container",
    overview: "Frontend web container.",
    tags: ["frontend"],
    dependedBy: ["../api/architecture.md"],
  }));
  await writeFixtureFile(root, "web/components/architecture.md", archMd({
    name: "Components",
    layer: "Component",
    overview: "React component groupings.",
  }));
  await writeFixtureFile(root, "web/components/button/architecture.md", archMd({
    name: "Button",
    layer: "Module",
    files: [{ name: "button.tsx", description: "Reusable button component." }],
  }));
  await writeFixtureFile(root, "web/components/button/button.tsx", "export const Button = () => null;\n");

  return root;
}

/**
 * Project with one stale module: code committed long after architecture.md.
 * Contains a real git history so validate_staleness can resolve dates.
 *
 *   root/
 *     fresh/        — code & arch.md committed at the same time (clean)
 *     stale/        — arch.md committed 2020, code re-committed 2026
 *     untracked/    — arch.md exists but never committed
 */
export async function buildStaleFixture(): Promise<string> {
  const root = createTempDir("tessera-stale-");

  // Root context
  await writeFixtureFile(root, "architecture.md", archMd({
    name: "StaleTestSystem",
    layer: "Context",
  }));

  // Fresh module (will be in sync)
  await writeFixtureFile(root, "fresh/architecture.md", archMd({
    name: "Fresh",
    layer: "Module",
    files: [{ name: "fresh.ts", description: "Fresh code." }],
  }));
  await writeFixtureFile(root, "fresh/fresh.ts", "export const fresh = true;\n");

  // Stale module — initial commit (both files at 2020)
  await writeFixtureFile(root, "stale/architecture.md", archMd({
    name: "Stale",
    layer: "Module",
    files: [{ name: "stale.ts", description: "Will be modified later." }],
  }));
  await writeFixtureFile(root, "stale/stale.ts", "export const stale = 1;\n");

  await initGitRepo(root);
  await commitAll(root, "initial commit", "2020-01-01T00:00:00Z");

  // Modify stale.ts and re-commit at a later date — only stale.ts gets the new timestamp.
  await writeFixtureFile(root, "stale/stale.ts", "export const stale = 2;\n");
  await commitAll(root, "update stale code", "2026-01-01T00:00:00Z");

  // Untracked element — created after the last commit, never committed
  await writeFixtureFile(root, "untracked/architecture.md", archMd({
    name: "Untracked",
    layer: "Module",
  }));
  await writeFixtureFile(root, "untracked/untracked.ts", "export const x = 1;\n");

  return root;
}

/**
 * Project with folders that contain code but no architecture.md.
 *
 *   root/
 *     architecture.md
 *     documented/
 *       architecture.md
 *       index.ts
 *     orphan-shallow/        — has code, no arch.md (orphan at depth 1)
 *       handler.ts
 *     nested/
 *       architecture.md      — documented Container
 *       orphan-deep/         — orphan at depth 2
 *         service.ts
 */
export async function buildOrphanFixture(): Promise<string> {
  const root = createTempDir("tessera-orphan-");

  await writeFixtureFile(root, "architecture.md", archMd({
    name: "OrphanTestSystem",
    layer: "Context",
  }));

  await writeFixtureFile(root, "documented/architecture.md", archMd({
    name: "Documented",
    layer: "Module",
    files: [{ name: "index.ts", description: "Entry point." }],
  }));
  await writeFixtureFile(root, "documented/index.ts", "export {};\n");

  await writeFixtureFile(root, "orphan-shallow/handler.ts", "export const handler = () => {};\n");

  await writeFixtureFile(root, "nested/architecture.md", archMd({
    name: "Nested",
    layer: "Container",
  }));
  await writeFixtureFile(root, "nested/orphan-deep/service.ts", "export const service = {};\n");

  return root;
}

/**
 * Project with architecture.md files referencing non-existent dependency targets.
 */
export async function buildBrokenLinksFixture(): Promise<string> {
  const root = createTempDir("tessera-brokenlinks-");

  await writeFixtureFile(root, "architecture.md", archMd({
    name: "BrokenLinksSystem",
    layer: "Context",
  }));

  await writeFixtureFile(root, "good/architecture.md", archMd({
    name: "Good",
    layer: "Container",
  }));

  await writeFixtureFile(root, "bad/architecture.md", archMd({
    name: "Bad",
    layer: "Container",
    // Both these targets do NOT exist on disk.
    dependsOn: ["../missing/architecture.md"],
    dependedBy: ["../also-missing/architecture.md"],
  }));

  // A link that DOES resolve, to confirm we don't false-positive on valid ones.
  await writeFixtureFile(root, "ok/architecture.md", archMd({
    name: "Ok",
    layer: "Container",
    dependsOn: ["../good/architecture.md"],
  }));

  return root;
}

/**
 * Project violating the uniform children rule: a Container whose children
 * include both a Component and a Module.
 */
export async function buildMixedLayersFixture(): Promise<string> {
  const root = createTempDir("tessera-mixed-");

  await writeFixtureFile(root, "architecture.md", archMd({
    name: "MixedSystem",
    layer: "Context",
  }));

  // Container with mixed children
  await writeFixtureFile(root, "messy/architecture.md", archMd({
    name: "Messy",
    layer: "Container",
  }));

  // Child A: Component (has children of its own)
  await writeFixtureFile(root, "messy/comp/architecture.md", archMd({
    name: "Comp",
    layer: "Component",
  }));
  await writeFixtureFile(root, "messy/comp/leaf/architecture.md", archMd({
    name: "Leaf",
    layer: "Module",
    files: [{ name: "leaf.ts", description: "Leaf code." }],
  }));
  await writeFixtureFile(root, "messy/comp/leaf/leaf.ts", "export const x = 1;\n");

  // Child B: Module directly under Container — violates uniform children rule
  await writeFixtureFile(root, "messy/loose-module/architecture.md", archMd({
    name: "LooseModule",
    layer: "Module",
    files: [{ name: "loose.ts", description: "Should have been wrapped in a Component." }],
  }));
  await writeFixtureFile(root, "messy/loose-module/loose.ts", "export const y = 2;\n");

  // A clean container for control
  await writeFixtureFile(root, "tidy/architecture.md", archMd({
    name: "Tidy",
    layer: "Container",
  }));
  await writeFixtureFile(root, "tidy/comp1/architecture.md", archMd({
    name: "Comp1",
    layer: "Component",
  }));
  await writeFixtureFile(root, "tidy/comp1/leaf/architecture.md", archMd({
    name: "TidyLeaf",
    layer: "Module",
    files: [{ name: "leaf.ts", description: "Tidy leaf." }],
  }));
  await writeFixtureFile(root, "tidy/comp1/leaf/leaf.ts", "export {};\n");
  await writeFixtureFile(root, "tidy/comp2/architecture.md", archMd({
    name: "Comp2",
    layer: "Component",
  }));
  await writeFixtureFile(root, "tidy/comp2/leaf/architecture.md", archMd({
    name: "TidyLeaf2",
    layer: "Module",
    files: [{ name: "leaf.ts", description: "Tidy leaf 2." }],
  }));
  await writeFixtureFile(root, "tidy/comp2/leaf/leaf.ts", "export {};\n");

  return root;
}

/**
 * Project where on-disk files diverge from each Module's ## Files section.
 *
 *   root/
 *     synced/      — disk and ## Files match
 *     undocumented/ — extra file on disk (extra.ts) not in ## Files
 *     missing/     — ## Files lists ghost.ts but it's not on disk
 *     both/        — has both undocumented and missing
 */
export async function buildFileDriftFixture(): Promise<string> {
  const root = createTempDir("tessera-filedrift-");

  await writeFixtureFile(root, "architecture.md", archMd({
    name: "FileDriftSystem",
    layer: "Context",
  }));

  // Synced
  await writeFixtureFile(root, "synced/architecture.md", archMd({
    name: "Synced",
    layer: "Module",
    files: [{ name: "a.ts", description: "Documented file A." }],
  }));
  await writeFixtureFile(root, "synced/a.ts", "export const a = 1;\n");

  // Undocumented: extra.ts on disk but not in ## Files
  await writeFixtureFile(root, "undocumented/architecture.md", archMd({
    name: "Undocumented",
    layer: "Module",
    files: [{ name: "known.ts", description: "Known file." }],
  }));
  await writeFixtureFile(root, "undocumented/known.ts", "export const k = 1;\n");
  await writeFixtureFile(root, "undocumented/extra.ts", "export const e = 1;\n");

  // Missing: ghost.ts is in ## Files but not on disk
  await writeFixtureFile(root, "missing/architecture.md", archMd({
    name: "Missing",
    layer: "Module",
    files: [
      { name: "real.ts", description: "Real file." },
      { name: "ghost.ts", description: "Documented but never created." },
    ],
  }));
  await writeFixtureFile(root, "missing/real.ts", "export const r = 1;\n");

  // Both
  await writeFixtureFile(root, "both/architecture.md", archMd({
    name: "Both",
    layer: "Module",
    files: [
      { name: "documented.ts", description: "Documented and present." },
      { name: "ghost.ts", description: "Listed but not on disk." },
    ],
  }));
  await writeFixtureFile(root, "both/documented.ts", "export const d = 1;\n");
  await writeFixtureFile(root, "both/extra.ts", "export const e = 1;\n");

  return root;
}

/**
 * Project demonstrating pass-through folders: src/, lib/, app/ wrappers
 * that should be transparent to the architecture tree.
 *
 *   root/
 *     architecture.md
 *     api/
 *       architecture.md         — Container
 *       src/                    — pass-through wrapper, no arch.md
 *         routes/
 *           architecture.md     — should appear as api → routes
 *           handler.ts
 *     web/
 *       lib/                    — pass-through wrapper
 *         components/
 *           button/
 *             architecture.md   — should appear as web → button (or similar)
 *             button.tsx
 */
export async function buildPassThroughFixture(): Promise<string> {
  const root = createTempDir("tessera-passthrough-");

  await writeFixtureFile(root, "architecture.md", archMd({
    name: "PassThroughSystem",
    layer: "Context",
  }));

  await writeFixtureFile(root, "api/architecture.md", archMd({
    name: "API",
    layer: "Container",
  }));
  await writeFixtureFile(root, "api/src/routes/architecture.md", archMd({
    name: "Routes",
    layer: "Module",
    files: [{ name: "handler.ts", description: "Request handler." }],
  }));
  await writeFixtureFile(root, "api/src/routes/handler.ts", "export const handler = () => {};\n");

  await writeFixtureFile(root, "web/architecture.md", archMd({
    name: "Web",
    layer: "Container",
  }));
  await writeFixtureFile(root, "web/lib/components/button/architecture.md", archMd({
    name: "Button",
    layer: "Module",
    files: [{ name: "button.tsx", description: "Button component." }],
  }));
  await writeFixtureFile(root, "web/lib/components/button/button.tsx", "export const Button = () => null;\n");

  return root;
}
