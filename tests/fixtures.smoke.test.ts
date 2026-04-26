import { afterAll, describe, expect, it } from "vitest";
import { existsSync } from "node:fs";
import { join } from "node:path";
import {
  buildBrokenLinksFixture,
  buildCleanFixture,
  buildFileDriftFixture,
  buildMixedLayersFixture,
  buildOrphanFixture,
  buildPassThroughFixture,
  buildStaleFixture,
} from "./fixtures/index.js";
import { cleanupAllTempDirs } from "./helpers/fixtures.js";

afterAll(() => {
  cleanupAllTempDirs();
});

describe("fixtures smoke test", () => {
  it("clean fixture creates expected files", async () => {
    const root = await buildCleanFixture();
    expect(existsSync(join(root, "architecture.md"))).toBe(true);
    expect(existsSync(join(root, "api/routes/users/users.ts"))).toBe(true);
    expect(existsSync(join(root, "web/components/button/button.tsx"))).toBe(true);
  });

  it("stale fixture initializes git with controlled timestamps", async () => {
    const root = await buildStaleFixture();
    expect(existsSync(join(root, ".git"))).toBe(true);
    expect(existsSync(join(root, "stale/stale.ts"))).toBe(true);
    expect(existsSync(join(root, "untracked/architecture.md"))).toBe(true);
  });

  it("orphan fixture has folders with code but no architecture.md", async () => {
    const root = await buildOrphanFixture();
    expect(existsSync(join(root, "orphan-shallow/handler.ts"))).toBe(true);
    expect(existsSync(join(root, "orphan-shallow/architecture.md"))).toBe(false);
    expect(existsSync(join(root, "nested/orphan-deep/service.ts"))).toBe(true);
    expect(existsSync(join(root, "nested/orphan-deep/architecture.md"))).toBe(false);
  });

  it("broken-links fixture has invalid dependency targets", async () => {
    const root = await buildBrokenLinksFixture();
    expect(existsSync(join(root, "bad/architecture.md"))).toBe(true);
    expect(existsSync(join(root, "missing/architecture.md"))).toBe(false);
  });

  it("mixed-layers fixture has a Container with both Component and Module children", async () => {
    const root = await buildMixedLayersFixture();
    expect(existsSync(join(root, "messy/comp/architecture.md"))).toBe(true);
    expect(existsSync(join(root, "messy/loose-module/architecture.md"))).toBe(true);
  });

  it("file-drift fixture has documented/undocumented/missing combinations", async () => {
    const root = await buildFileDriftFixture();
    expect(existsSync(join(root, "undocumented/extra.ts"))).toBe(true);
    expect(existsSync(join(root, "missing/real.ts"))).toBe(true);
    expect(existsSync(join(root, "missing/ghost.ts"))).toBe(false);
  });

  it("pass-through fixture has wrapper folders without architecture.md", async () => {
    const root = await buildPassThroughFixture();
    expect(existsSync(join(root, "api/src/routes/handler.ts"))).toBe(true);
    expect(existsSync(join(root, "api/src/architecture.md"))).toBe(false);
    expect(existsSync(join(root, "web/lib/components/button/button.tsx"))).toBe(true);
  });
});
