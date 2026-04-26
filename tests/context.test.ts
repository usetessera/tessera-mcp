import { afterAll, describe, expect, it } from "vitest";
import {
  NO_RULES_MESSAGE,
  handleGetElementContext,
  handleGetRules,
} from "../tools/context/context.js";
import { buildCleanFixture } from "./fixtures/index.js";
import { cleanupAllTempDirs, writeFixtureFile } from "./helpers/fixtures.js";

afterAll(() => {
  cleanupAllTempDirs();
});

describe("get_rules", () => {
  it("returns the sentinel message when agent-rules.md is missing", async () => {
    const root = await buildCleanFixture();
    const text = await handleGetRules({ rootPath: root });
    expect(text).toBe(NO_RULES_MESSAGE);
  });

  it("returns the file contents when agent-rules.md exists", async () => {
    const root = await buildCleanFixture();
    await writeFixtureFile(root, ".tessera/agent-rules.md", "# Rules\n\nUse Tessera.");
    const text = await handleGetRules({ rootPath: root });
    expect(text).toContain("# Rules");
  });
});

describe("get_element_context", () => {
  it("returns parent, siblings, and children for a Component", async () => {
    const root = await buildCleanFixture();
    const ctx = await handleGetElementContext({
      rootPath: root,
      elementPath: "api/routes",
    });

    expect(ctx.element.name).toBe("routes");
    expect(ctx.parent?.name).toBe("api");
    expect(ctx.children.map((c) => c.name)).toContain("users");
    // routes is the only Component under api in this fixture
    expect(ctx.siblings).toEqual([]);
  });

  it("returns parent=null for the root context", async () => {
    const root = await buildCleanFixture();
    const ctx = await handleGetElementContext({
      rootPath: root,
      elementPath: ".",
    });
    expect(ctx.parent).toBeNull();
    expect(ctx.children.length).toBeGreaterThan(0);
  });

  it("throws when the element path does not exist", async () => {
    const root = await buildCleanFixture();
    await expect(
      handleGetElementContext({ rootPath: root, elementPath: "no/such/element" }),
    ).rejects.toThrow();
  });
});
