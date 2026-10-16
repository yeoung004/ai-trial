import {
  MuseClient,
  spawnMspConnection,
  readSessionDurability,
  type SpawnedMspConnection,
} from "@muse-code/sdk";
import { mkdtemp, mkdir, rm, readFile } from "node:fs/promises";
import { tmpdir, homedir } from "node:os";
import { join } from "node:path";
import { disconnected, MuseError } from "./MuseErrors.js";

export class MuseHostManager {
  private host?: SpawnedMspConnection;
  private client?: MuseClient;
  private directory?: string;
  async open() {
    // Empty preset suppresses built-ins. Refuse locally configured extensions:
    // approvals alone cannot prevent startup hooks or read-only MCP execution.
    try {
      const settings = JSON.parse(
        await readFile(
          join(
            process.env.XDG_CONFIG_HOME || join(homedir(), ".config"),
            "muse/settings.json",
          ),
          "utf8",
        ),
      );
      for (const key of [
        "mcp_servers",
        "hooks",
        "plugins",
        "managed_hooks_path",
      ]) {
        const value = settings[key];
        if (value && (typeof value !== "object" || Object.keys(value).length))
          throw new MuseError(
            "MUSE_CONFIGURATION",
            "Muse reasoning requires a local configuration without MCP servers, plugins, or hooks.",
          );
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
    this.directory = await mkdtemp(join(tmpdir(), "ai-court-"));
    await mkdir(join(this.directory, ".git")); // Stop inherited project instructions at this empty boundary.
    const env = { ...process.env };
    for (const key of Object.keys(env))
      if (/API_KEY|TRANSPORT_TRACE/.test(key)) delete env[key];
    const handshake = spawnMspConnection({
      command: process.env.MUSE_BIN || "muse",
      args: ["serve", "--preset", "empty", "--provider", "meta"],
      cwd: this.directory,
      env,
      shutdownTimeoutMs: 1000,
    });
    try {
      this.host = await this.bound(
        handshake.initialize({
          clientInfo: { name: "ai_court", version: "1.0.0" },
          capabilities: { experimentalApi: true },
        }),
        12000,
      );
      this.client = new MuseClient(this.host.connection, {
        durability: readSessionDurability(this.host.initializeResult),
        host: this.host,
      });
      return {
        client: this.client,
        connection: this.host.connection,
        workspaceRoot: this.directory,
      };
    } catch {
      await handshake.close().catch(() => undefined);
      await this.close();
      throw disconnected();
    }
  }
  async bound<T>(promise: Promise<T>, ms = 12000): Promise<T> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        promise,
        new Promise<never>((_, reject) => {
          timer = setTimeout(
            () =>
              reject(
                new MuseError(
                  "MUSE_TIMEOUT",
                  "Muse Code did not respond in time.",
                ),
              ),
            ms,
          );
        }),
      ]);
    } finally {
      clearTimeout(timer);
    }
  }
  async close() {
    if (this.client) await this.client.close().catch(() => undefined);
    else if (this.host) await this.host.close().catch(() => undefined);
    if (this.directory)
      await rm(this.directory, { recursive: true, force: true });
    this.host = undefined;
    this.client = undefined;
  }
  async withHost<T>(
    work: (host: Awaited<ReturnType<MuseHostManager["open"]>>) => Promise<T>,
  ) {
    try {
      return await work(await this.open());
    } finally {
      await this.close();
    }
  }
}
