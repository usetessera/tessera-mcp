import { afterAll, describe, expect, it } from "vitest";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import {
  handleApplyProtocolBootstrap,
  handlePrepareProtocolBootstrap,
} from "../tools/protocols/protocols.js";
import { cleanupAllTempDirs, createTempDir } from "./helpers/fixtures.js";

afterAll(() => {
  cleanupAllTempDirs();
});

describe("prepare_protocol_bootstrap", () => {
  it("reports missing protocol files and returns guided questions", async () => {
    const root = createTempDir("tessera-protocols-");
    const result = await handlePrepareProtocolBootstrap({ rootPath: root });

    expect(result.installed).toBe(false);
    expect(result.missingFiles).toContain("goals/_active.md");
    expect(result.questions.map((q) => q.id)).toContain("active_goals");
  });
});

describe("apply_protocol_bootstrap", () => {
  it("creates baseline protocol files from confirmed answers", async () => {
    const root = createTempDir("tessera-protocols-");
    const result = await handleApplyProtocolBootstrap({
      rootPath: root,
      projectName: "Example App",
      userId: "tester",
      goals: [
        {
          title: "Prepare release",
          outcome: "The package can be published and installed.",
          successCriteria: ["Build passes", "Install instructions are documented"],
          nonGoals: ["Payment infrastructure"],
          priority: "high",
        },
      ],
      userCapabilities: [
        {
          title: "TypeScript",
          evidenceLevel: "declared",
          evidence: "User stated they are comfortable maintaining TypeScript services.",
        },
      ],
      agentCapabilities: [
        {
          title: "Workspace assumptions",
          limit: "Must ask before changing release scope.",
        },
      ],
      comprehensionRecords: [
        {
          title: "API boundaries",
          system: null,
          element: "backend/api/",
          claimedUnderstanding: "The user described the API boundary during bootstrap.",
          status: "confirmed",
          source: "user",
        },
      ],
    });

    expect(result.created).toContain("README.md");
    expect(result.created).toContain("goals/_active.md");
    expect(result.created).toContain("comprehension/workspace--api-boundaries.md");
    expect(existsSync(join(root, ".tessera-protocols/goals/_active.md"))).toBe(true);

    const goals = await readFile(join(root, ".tessera-protocols/goals/_active.md"), "utf-8");
    expect(goals).toContain("# Prepare release");
    expect(goals).toContain("confirmed_by: tester");
  });

  it("skips existing files unless overwrite is requested", async () => {
    const root = createTempDir("tessera-protocols-");
    await handleApplyProtocolBootstrap({
      rootPath: root,
      projectName: "Example App",
      goals: [],
    });

    const second = await handleApplyProtocolBootstrap({
      rootPath: root,
      projectName: "Example App",
      goals: [],
    });

    expect(second.skipped).toContain("README.md");
    expect(second.created).not.toContain("README.md");
  });
});
