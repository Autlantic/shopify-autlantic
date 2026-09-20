import { mkdirSync, readFileSync, writeFileSync, renameSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";

export type PaymentSessionRecord = {
  shopifyGid: string;
  shopDomain: string;
  amount: string;
  currency: string;
  gid: string;
  paymentLinkId?: string;
  checkoutUrl?: string;
  status: "pending" | "resolved" | "rejected";
  createdAt: number;
};

export type ActivityRow = {
  at: number;
  ok: boolean;
  type: string;
  message: string;
};

type StateFile = {
  sessions: Record<string, PaymentSessionRecord>;
  processedEvents: Record<string, number>;
  activity: ActivityRow[];
};

function path(): string {
  return process.env.AUTLANTIC_SHOPIFY_STATE_PATH?.trim() || "./.data/state.json";
}

function empty(): StateFile {
  return { sessions: {}, processedEvents: {}, activity: [] };
}

function load(): StateFile {
  const p = path();
  if (!existsSync(p)) {
    return empty();
  }
  try {
    const raw = JSON.parse(readFileSync(p, "utf8")) as StateFile;
    return {
      sessions: raw.sessions ?? {},
      processedEvents: raw.processedEvents ?? {},
      activity: Array.isArray(raw.activity) ? raw.activity : [],
    };
  } catch {
    return empty();
  }
}

/** Atomic replace so a crash mid-write does not truncate the file. Single-instance only. */
function save(state: StateFile): void {
  const p = path();
  mkdirSync(dirname(p), { recursive: true });
  const tmp = join(dirname(p), `.${Date.now()}.${process.pid}.tmp`);
  writeFileSync(tmp, JSON.stringify(state, null, 2));
  renameSync(tmp, p);
}

export function putSession(record: PaymentSessionRecord): void {
  const state = load();
  state.sessions[record.gid] = record;
  save(state);
}

export function getSession(gid: string): PaymentSessionRecord | undefined {
  return load().sessions[gid];
}

export function findSessionByPaymentLink(linkId: string): PaymentSessionRecord | undefined {
  const state = load();
  return Object.values(state.sessions).find((s) => s.paymentLinkId === linkId);
}

export function markSession(gid: string, status: PaymentSessionRecord["status"]): void {
  const state = load();
  const row = state.sessions[gid];
  if (!row) return;
  row.status = status;
  state.sessions[gid] = row;
  save(state);
}

export function alreadyProcessed(eventId: string): boolean {
  return Boolean(load().processedEvents[eventId]);
}

export function markProcessed(eventId: string): void {
  const state = load();
  state.processedEvents[eventId] = Date.now();
  const ids = Object.entries(state.processedEvents).sort((a, b) => a[1] - b[1]);
  if (ids.length > 500) {
    state.processedEvents = Object.fromEntries(ids.slice(-500));
  }
  save(state);
}

export function addActivity(row: Omit<ActivityRow, "at">): void {
  const state = load();
  state.activity.push({ ...row, at: Date.now() });
  if (state.activity.length > 30) {
    state.activity = state.activity.slice(-30);
  }
  save(state);
}

export function listActivity(): ActivityRow[] {
  return [...load().activity].reverse();
}
