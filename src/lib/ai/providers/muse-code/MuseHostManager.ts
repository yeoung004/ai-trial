import {
  MuseClient,
  spawnMspConnection,
  readSessionDurability,
  type SpawnedMspConnection,
} from "@muse-code/sdk";
import { mkdtemp, mkdir, rm, readFile, access } from "node:fs/promises";
import { tmpdir, homedir } from "node:os";
import { join, delimiter, isAbsolute } from "node:path";
import { constants } from "node:fs";
import { disconnected, MuseError } from "./MuseErrors.js";

export const museHostArgs = [
  "serve",
  "--provider",
  "meta",
  "--no-session-log",
  "--disable-shell",
  "--disable-write",
  "--disable-request-user-input",
  "-c",
  'run.workflow_trigger_mode="off"',
  "-c",
  "tools.artifact.enabled=false",
  "-c",
  "tools.web_fetch.enabled=false",
  "-c",
  'tools.web_search.mode="off"',
];

export async function resolveMuseBinary(
  env: NodeJS.ProcessEnv = process.env,
  home = homedir(),
) {
  const configured = env.MUSE_BIN || "muse";
  const candidates =
    isAbsolute(configured) || configured.includes("/")
      ? [configured]
      : [
          ...(env.PATH || "")
            .split(delimiter)
            .filter(Boolean)
            .map((directory) => join(directory, configured)),
          ...(configured === "muse" ? [join(home, ".local/bin/muse")] : []),
        ];
  for (const candidate of candidates) {
    try {
      await access(candidate, constants.X_OK);
      return candidate;
    } catch {
      /* Try next known installation path. */
    }
  }
  throw disconnected();
}

export class MuseHostManager {
  private host?: SpawnedMspConnection;
  private client?: MuseClient;
  private directory?: string;
  async open() {
    // Serve does not support the TUI empty preset. Disable supported tools
    // and workflows explicitly. Refuse locally configured extensions:
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
    const command = await resolveMuseBinary();
    this.directory = await mkdtemp(join(tmpdir(), "ai-court-"));
    await mkdir(join(this.directory, ".git")); // Stop inherited project instructions at this empty boundary.
    const env = { ...process.env };
    for (const key of Object.keys(env))
      if (/API_KEY|TRANSPORT_TRACE/.test(key)) delete env[key];
    const handshake = spawnMspConnection({
      command,
      args: museHostArgs,
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
    } catch (error) {
      const exit = await handshake.close().catch(() => undefined);
      await this.close();
      if (error instanceof MuseError) throw error;
      throw new MuseError(
        "MUSE_HOST_FAILED",
        exit?.code === 2
          ? "Muse rejected the SDK host startup options. Check CLI compatibility."
          : "Muse could not start its SDK host. Check the local installation and host configuration.",
      );
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
