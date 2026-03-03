import type { StoredAudit } from "./schema";

// In-memory store as fallback when Vercel KV / Upstash Redis is not configured.
// In production, set KV_REST_API_URL and KV_REST_API_TOKEN env vars to use Vercel KV.

const memoryStore = new Map<string, StoredAudit>();

let kvModule: typeof import("@vercel/kv") | null = null;

async function getKv() {
  if (
    !process.env.KV_REST_API_URL ||
    !process.env.KV_REST_API_TOKEN
  ) {
    return null;
  }
  if (!kvModule) {
    kvModule = await import("@vercel/kv");
  }
  return kvModule.kv;
}

export async function storeAudit(
  id: string,
  data: StoredAudit
): Promise<void> {
  const kv = await getKv();
  if (kv) {
    await kv.set(`audit:${id}`, JSON.stringify(data), { ex: 60 * 60 * 24 * 30 }); // 30 days
  } else {
    memoryStore.set(id, data);
  }
}

export async function getAudit(id: string): Promise<StoredAudit | null> {
  const kv = await getKv();
  if (kv) {
    const raw = await kv.get<string>(`audit:${id}`);
    if (!raw) return null;
    return typeof raw === "string" ? JSON.parse(raw) : raw;
  }
  return memoryStore.get(id) ?? null;
}
