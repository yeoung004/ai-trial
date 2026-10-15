import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import type { ModelConfig } from "../shared/types";
import { DEFAULT_MODELS, validateModels } from "./registry";

/** A completed council execution and its metadata, stored without provider keys. */
export interface SessionRecord {
  id: string;
  createdAt: string;
  [key: string]: unknown;
}

// Read/modify/write operations share one queue so concurrent requests in this
// server process cannot overwrite each other's sessions or model edits.
let pending: Promise<void> = Promise.resolve();

function serialize<T>(operation: () => Promise<T>): Promise<T> {
  const result = pending.then(operation, operation);
  pending = result.then(() => undefined, () => undefined);
  return result;
}

function dataPath(filename: string): string {
  return path.join(process.env.COUNCIL_DATA_DIR ?? path.join(process.cwd(), "data"), filename);
}

async function readJson(filename: string): Promise<unknown | null> {
  const filenamePath = dataPath(filename);
  let contents: string;
  try {
    contents = await fs.readFile(filenamePath, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
  try {
    return JSON.parse(contents) as unknown;
  } catch {
    throw new Error(`Stored ${filename} is invalid JSON`);
  }
}

async function writeJson(filename: string, value: unknown): Promise<void> {
  const target = dataPath(filename);
  const directory = path.dirname(target);
  await fs.mkdir(directory, { recursive: true, mode: 0o700 });
  const temporary = path.join(directory, `.${filename}.${process.pid}.${randomUUID()}.tmp`);
  try {
    await fs.writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, {
      encoding: "utf8",
      flag: "wx",
      mode: 0o600,
    });
    await fs.rename(temporary, target);
  } finally {
    await fs.rm(temporary, { force: true });
  }
}

function readSessionArray(value: unknown): SessionRecord[] {
  if (value === null) return [];
  if (!Array.isArray(value)) throw new Error("Stored sessions must be an array");
  for (const record of value) {
    if (
      !record ||
      typeof record !== "object" ||
      Array.isArray(record) ||
      typeof record.id !== "string" ||
      !record.id ||
      typeof record.createdAt !== "string" ||
      !record.createdAt
    ) {
      throw new Error("Stored session has an invalid id or createdAt");
    }
  }
  return value as SessionRecord[];
}

// Guard against accidentally persisting a credential if a caller passes one
// alongside otherwise valid result metadata. Normal token usage fields stay.
function isSensitiveKey(key: string): boolean {
  const normalized = key.replace(/[^a-z0-9]/gi, "").toLowerCase();
  return (
    normalized === "token" ||
    normalized === "authorization" ||
    normalized === "password" ||
    normalized === "credential" ||
    normalized === "credentials" ||
    normalized === "headers" ||
    normalized.endsWith("apikey") ||
    normalized.endsWith("secret") ||
    normalized.endsWith("accesstoken") ||
    normalized.endsWith("refreshtoken") ||
    normalized.endsWith("authtoken")
  );
}

function stripCredentials(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stripCredentials);
  if (value instanceof Date) return value.toISOString();
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).filter(([key]) => !isSensitiveKey(key)).map(([key, item]) => [key, stripCredentials(item)]),
    );
  }
  return value;
}

/** Newest sessions first. The full structured result is retained for inspection. */
export function listSessions(): Promise<SessionRecord[]> {
  return serialize(async () => {
    const records = readSessionArray(await readJson("sessions.json"));
    return records.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  });
}

export function getSession(id: string): Promise<SessionRecord | null> {
  return serialize(async () => {
    if (!id) return null;
    const records = readSessionArray(await readJson("sessions.json"));
    return records.find((record) => record.id === id) ?? null;
  });
}

/** Upsert a session by id. Secrets in unexpected fields are removed first. */
export function saveSession<T extends SessionRecord>(record: T): Promise<T> {
  return serialize(async () => {
    if (typeof record?.id !== "string" || !record.id.trim()) {
      throw new Error("Session id must be a nonempty string");
    }
    if (typeof record.createdAt !== "string" || !record.createdAt.trim()) {
      throw new Error("Session createdAt must be a nonempty string");
    }
    const sanitized = stripCredentials(record) as T;
    const records = readSessionArray(await readJson("sessions.json"));
    const index = records.findIndex((existing) => existing.id === record.id);
    if (index >= 0) records[index] = sanitized;
    else records.push(sanitized);
    await writeJson("sessions.json", records);
    return sanitized;
  });
}

/** Seed the editable registry on first access. No credentials are stored. */
export function getModels(): Promise<ModelConfig[]> {
  return serialize(async () => {
    const stored = await readJson("models.json");
    if (stored !== null) return validateModels(stored);
    const defaults = validateModels(DEFAULT_MODELS);
    await writeJson("models.json", defaults);
    return defaults;
  });
}

export function saveModels(value: unknown): Promise<ModelConfig[]> {
  return serialize(async () => {
    const models = validateModels(value);
    await writeJson("models.json", models);
    return models;
  });
}
