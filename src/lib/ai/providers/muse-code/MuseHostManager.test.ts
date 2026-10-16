import { afterEach, expect, it } from "vitest";
import { mkdtemp, mkdir, writeFile, chmod, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resolveMuseBinary } from "./MuseHostManager";
const directories: string[] = [];
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "muse-path-test-"));
  directories.push(root);
  return root;
}
async function executable(file: string) {
  await writeFile(file, "#!/bin/sh\nexit 0\n");
  await chmod(file, 0o700);
}
afterEach(async () => {
  await Promise.all(
    directories
      .splice(0)
      .map((root) => rm(root, { recursive: true, force: true })),
  );
});
it("finds a newly installed CLI even when the server inherited an older PATH", async () => {
  const home = await fixture();
  const bin = join(home, ".local/bin");
  await mkdir(bin, { recursive: true });
  const muse = join(bin, "muse");
  await executable(muse);
  expect(
    await resolveMuseBinary(
      { PATH: "/does-not-exist", MUSE_BIN: "muse" },
      home,
    ),
  ).toBe(muse);
});
it("honors an explicit binary and does not silently substitute another installation", async () => {
  const home = await fixture();
  const binary = join(home, "custom-muse");
  await executable(binary);
  expect(await resolveMuseBinary({ MUSE_BIN: binary }, home)).toBe(binary);
  await expect(
    resolveMuseBinary({ MUSE_BIN: join(home, "missing") }, home),
  ).rejects.toMatchObject({ code: "MUSE_UNAVAILABLE" });
});
