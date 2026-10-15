import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DEFAULT_MODELS, requireJudgeModel, validateModels } from "./registry";
import { getModels, getSession, listSessions, saveModels, saveSession } from "./storage";

describe("local council storage", () => {
  let directory: string;
  let previousDirectory: string | undefined;

  beforeEach(async () => {
    directory = await mkdtemp(path.join(tmpdir(), "council-storage-"));
    previousDirectory = process.env.COUNCIL_DATA_DIR;
    process.env.COUNCIL_DATA_DIR = directory;
  });

  afterEach(async () => {
    if (previousDirectory === undefined) delete process.env.COUNCIL_DATA_DIR;
    else process.env.COUNCIL_DATA_DIR = previousDirectory;
    await rm(directory, { recursive: true, force: true });
  });

  it("seeds an editable model registry without persisting unknown fields", async () => {
    const seeded = await getModels();
    expect(seeded).toEqual(DEFAULT_MODELS);
    expect(seeded.some((model) => model.provider === "gateway")).toBe(true);
    expect(seeded.some((model) => model.tier === "judge")).toBe(true);

    const edited = await saveModels([{ ...seeded[0], enabled: false, apiKey: "must-not-persist" }]);
    expect(edited).toEqual([{ ...seeded[0], enabled: false }]);
    expect(await getModels()).toEqual(edited);
    expect(await readFile(path.join(directory, "models.json"), "utf8")).not.toContain("must-not-persist");
    expect((await readdir(directory)).filter((filename) => filename.endsWith(".tmp"))).toEqual([]);
  });

  it("rejects invalid registry edits and requires an enabled Final Judge selection", async () => {
    const seeded = await getModels();
    expect(() => requireJudgeModel(undefined, seeded)).toThrow(/Final Judge/);
    expect(requireJudgeModel(seeded[0].id, seeded)).toEqual(seeded[0]);
    expect(() => validateModels([{ ...seeded[0], inputCostPerMillion: -1 }])).toThrow();
    await expect(saveModels([{ ...seeded[0], provider: "unsupported" }])).rejects.toThrow();
    expect(await getModels()).toEqual(seeded);
  });

  it("keeps concurrent session saves and strips nested credentials", async () => {
    await Promise.all(
      Array.from({ length: 12 }, (_, index) =>
        saveSession({
          id: `session-${index}`,
          createdAt: new Date(Date.UTC(2026, 0, 1, 0, 0, index)).toISOString(),
          status: "complete",
          result: {
            usage: { totalTokens: index, inputTokens: index },
            apiKey: "private",
            provider: { accessToken: "also-private" },
          },
        }),
      ),
    );

    const records = await listSessions();
    expect(records).toHaveLength(12);
    expect(records[0].id).toBe("session-11");
    expect((await getSession("session-3"))?.result).toEqual({
      usage: { totalTokens: 3, inputTokens: 3 },
      provider: {},
    });
    expect(await getSession("missing")).toBeNull();
    expect(await readFile(path.join(directory, "sessions.json"), "utf8")).not.toContain("private");

    await saveSession({ id: "session-3", createdAt: records[8].createdAt, status: "updated" });
    expect((await listSessions())).toHaveLength(12);
    expect((await getSession("session-3"))?.status).toBe("updated");
  });
});
