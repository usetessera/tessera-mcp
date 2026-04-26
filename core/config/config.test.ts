import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { resolve, join } from "node:path";
import { mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolveDefaultRootPath, loadConfig } from "./config.js";
import { CONFIG_DIR, CONFIG_FILE, DEFAULT_IGNORE_PATTERNS } from "../../shared/constants/constants.js";

describe("resolveDefaultRootPath", () => {
  const cwd = "/home/user/project";
  const emptyEnv: NodeJS.ProcessEnv = {};

  it("returns cwd when no argv flag and no env var", () => {
    expect(resolveDefaultRootPath([], emptyEnv, cwd)).toBe(resolve(cwd));
  });

  it("prefers --root <path> over env and cwd", () => {
    const env = { TESSERA_ROOT: "/from/env" };
    const result = resolveDefaultRootPath(["--root", "/from/argv"], env, cwd);
    expect(result).toBe(resolve("/from/argv"));
  });

  it("accepts --root=<path> syntax", () => {
    const result = resolveDefaultRootPath(["--root=/from/argv"], emptyEnv, cwd);
    expect(result).toBe(resolve("/from/argv"));
  });

  it("falls back to TESSERA_ROOT env var when no argv flag", () => {
    const env = { TESSERA_ROOT: "/from/env" };
    expect(resolveDefaultRootPath([], env, cwd)).toBe(resolve("/from/env"));
  });

  it("ignores empty TESSERA_ROOT", () => {
    const env = { TESSERA_ROOT: "   " };
    expect(resolveDefaultRootPath([], env, cwd)).toBe(resolve(cwd));
  });

  it("ignores --root flag with no value", () => {
    const result = resolveDefaultRootPath(["--root"], emptyEnv, cwd);
    expect(result).toBe(resolve(cwd));
  });
});

describe("loadConfig", () => {
  const testDir = join(tmpdir(), `tessera-config-test-${Date.now()}`);

  beforeEach(async () => {
    await mkdir(join(testDir, CONFIG_DIR), { recursive: true });
  });

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  it("merges user patterns on top of defaults (does not replace)", async () => {
    const yaml = `ignore:\n  - my-custom-folder\n  - Builds\n`;
    await writeFile(join(testDir, CONFIG_DIR, CONFIG_FILE), yaml, "utf-8");

    const config = await loadConfig(testDir);

    // User patterns included
    expect(config.ignore).toContain("my-custom-folder");
    expect(config.ignore).toContain("Builds");
    // Defaults still included — user can't accidentally un-ignore these
    expect(config.ignore).toContain("node_modules");
    expect(config.ignore).toContain(".git");
    expect(config.ignore).toContain(".tessera");
  });

  it("returns defaults when config file is missing", async () => {
    const config = await loadConfig(testDir);
    expect(config.ignore).toEqual([...DEFAULT_IGNORE_PATTERNS]);
  });

  it("dedupes patterns when user lists a default", async () => {
    const yaml = `ignore:\n  - node_modules\n  - custom\n`;
    await writeFile(join(testDir, CONFIG_DIR, CONFIG_FILE), yaml, "utf-8");

    const config = await loadConfig(testDir);
    const nodeModulesCount = config.ignore.filter((p) => p === "node_modules").length;
    expect(nodeModulesCount).toBe(1);
  });
});
