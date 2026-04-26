import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import yaml from "js-yaml";
import {
  CONFIG_DIR,
  CONFIG_FILE,
  DEFAULT_IGNORE_PATTERNS,
  DEFAULT_WORKSPACE_MODE,
  type WorkspaceMode,
} from "../../shared/constants/constants.js";
import type { ConfigFile } from "../../shared/types/types.js";

/**
 * Loads the .tessera/config.yaml file.
 * Returns sensible defaults if the file doesn't exist.
 */
export async function loadConfig(rootPath: string): Promise<ConfigFile> {
  const configPath = join(rootPath, CONFIG_DIR, CONFIG_FILE);

  try {
    const content = await readFile(configPath, "utf-8");
    const parsed = yaml.load(content) as Record<string, unknown> | null;

    if (!parsed || typeof parsed !== "object") {
      return defaultConfig();
    }

    // Accept both "ignore" and "ignores" as the config key
    const ignoreValue = parsed.ignore ?? parsed.ignores;
    // Accept both `workspace_mode` (canonical YAML snake_case) and
    // `workspaceMode` (camelCase) so either style works.
    const modeValue = parsed.workspace_mode ?? parsed.workspaceMode;
    const workspaceMode = parseWorkspaceMode(modeValue);

    // User patterns are additive — merged on top of the sensible defaults
    // so users can't accidentally un-ignore node_modules, .tessera, .git, etc.
    // by listing their own patterns. An architecture.md is still the escape
    // hatch for folders the user wants to bring back in.
    const userPatterns = Array.isArray(ignoreValue)
      ? ignoreValue.filter((item): item is string => typeof item === "string")
      : [];
    const suppressRaw =
      parsed.suppress_drift_warnings ?? parsed.suppressDriftWarnings;
    const suppressDriftWarnings = suppressRaw === true;
    return {
      ignore: mergeIgnorePatterns(userPatterns),
      workspaceMode,
      suppressDriftWarnings,
    };
  } catch {
    return defaultConfig();
  }
}

function mergeIgnorePatterns(userPatterns: string[]): string[] {
  return [...new Set([...DEFAULT_IGNORE_PATTERNS, ...userPatterns])];
}

/** Returns the configured workspace mode, falling back to the default. */
export function getWorkspaceMode(config: ConfigFile): WorkspaceMode {
  return config.workspaceMode ?? DEFAULT_WORKSPACE_MODE;
}

function parseWorkspaceMode(value: unknown): WorkspaceMode {
  if (typeof value !== "string") return DEFAULT_WORKSPACE_MODE;
  const normalized = value.trim().toLowerCase();
  if (normalized === "landscape") return "landscape";
  if (normalized === "context") return "context";
  return DEFAULT_WORKSPACE_MODE;
}

/**
 * Returns the ignore patterns from a config, falling back to defaults only
 * if the config somehow has an empty list. `loadConfig` already merges
 * defaults with user patterns, so in practice this just returns config.ignore.
 */
export function getIgnorePatterns(config: ConfigFile): string[] {
  return config.ignore.length > 0 ? config.ignore : [...DEFAULT_IGNORE_PATTERNS];
}

/**
 * Server-wide context passed to each tool registrar. Currently just the
 * resolved default root path, so tool callers can omit `rootPath` and
 * operate on a single configured project.
 */
export interface ServerContext {
  defaultRootPath: string;
}

/**
 * Resolves the default project root for the server at startup.
 * Precedence: `--root <path>` or `--root=<path>` argv > TESSERA_ROOT env > cwd.
 */
export function resolveDefaultRootPath(
  argv: readonly string[],
  env: NodeJS.ProcessEnv,
  cwd: string,
): string {
  const flagIdx = argv.findIndex((a) => a === "--root");
  if (flagIdx >= 0 && argv[flagIdx + 1]) return resolve(argv[flagIdx + 1]);
  const eqArg = argv.find((a) => a.startsWith("--root="));
  if (eqArg) return resolve(eqArg.slice("--root=".length));
  if (env.TESSERA_ROOT && env.TESSERA_ROOT.trim()) return resolve(env.TESSERA_ROOT);
  return resolve(cwd);
}

function defaultConfig(): ConfigFile {
  return {
    ignore: [...DEFAULT_IGNORE_PATTERNS],
    workspaceMode: DEFAULT_WORKSPACE_MODE,
  };
}
