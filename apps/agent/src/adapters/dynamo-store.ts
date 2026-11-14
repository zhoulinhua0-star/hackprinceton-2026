// Student state in Amazon DynamoDB: one item per student, keyed by phone number.
// Reads come from memory (loaded once at start), so the dashboard's 1.5s polling costs nothing.
// Every save is written through to DynamoDB in the background; a failed write is retried and never breaks a reply.
import { gunzipSync, gzipSync } from "node:zlib";
import {
  CreateTableCommand, DescribeTableCommand, DynamoDBClient, PutItemCommand, ScanCommand, waitUntilTableExists,
  type AttributeValue,
} from "@aws-sdk/client-dynamodb";
import type { Store, StudentState } from "@syllabus-crew/core";

/** Above this the state is gzipped (DynamoDB's item limit is 400 KB). Below it, it stays readable in the AWS console. */
const GZIP_OVER = 300_000;
type Item = Record<string, AttributeValue>;
/** The two DynamoDB calls the store needs, so tests can pass a fake. */
export interface DynamoLike { send(cmd: PutItemCommand | ScanCommand): Promise<{ Items?: Item[]; LastEvaluatedKey?: Item }> }

export function toItem(s: StudentState, now: Date = new Date()): Item {
  const json = JSON.stringify(s);
  const item: Item = {
    id: { S: s.id },
    phase: { S: s.phase },
    updatedAt: { S: now.toISOString() },
    messageCount: { N: String(s.messages.length) },
  };
  if (s.agentName) item.agentName = { S: s.agentName };
  if (s.courses[0]?.name) item.course = { S: s.courses[0].name };
  if (Buffer.byteLength(json) > GZIP_OVER) item.stateGz = { B: gzipSync(json) };
  else item.state = { S: json };
  return item;
}

export function fromItem(item: Item): StudentState | undefined {
  try {
    if (item.state?.S) return JSON.parse(item.state.S) as StudentState;
    if (item.stateGz?.B) return JSON.parse(gunzipSync(Buffer.from(item.stateGz.B)).toString("utf8")) as StudentState;
  } catch { /* a corrupt item is skipped, not fatal */ }
  return undefined;
}

export class DynamoStore implements Store {
  private m = new Map<string, StudentState>();
  private pending = new Map<string, StudentState>();
  private flushing: Promise<void> | undefined;

  private constructor(private db: DynamoLike, private table: string, private log: (s: string) => void, private retryMs: number) {}

  /** Loads every student from the table. Throws if the table can't be read, so a bad setup fails at start, not mid-demo. */
  static async open(o: { db: DynamoLike; table: string; log?: (s: string) => void; retryMs?: number }): Promise<DynamoStore> {
    const s = new DynamoStore(o.db, o.table, o.log ?? (() => {}), o.retryMs ?? 2000);
    let start: Item | undefined;
    do {
      const page = await o.db.send(new ScanCommand({ TableName: o.table, ExclusiveStartKey: start }));
      for (const it of page.Items ?? []) { const st = fromItem(it); if (st) s.m.set(st.id, st); }
      start = page.LastEvaluatedKey;
    } while (start);
    return s;
  }

  async ids() { return [...this.m.keys()]; }
  async load(id: string) { const s = this.m.get(id); return s ? structuredClone(s) : undefined; }
  async save(s: StudentState) {
    const copy = structuredClone(s);
    this.m.set(s.id, copy);
    this.pending.set(s.id, copy); // the newest state for a student replaces an older unsent one
    this.flushing ??= this.drain().finally(() => { this.flushing = undefined; });
  }

  /** Waits until every save so far has reached DynamoDB (used at shutdown and in tests). */
  async flush(): Promise<void> { while (this.flushing) await this.flushing; }

  private async drain(): Promise<void> {
    let failures = 0;
    while (this.pending.size) {
      const [id, s] = this.pending.entries().next().value as [string, StudentState];
      this.pending.delete(id);
      try {
        await this.db.send(new PutItemCommand({ TableName: this.table, Item: toItem(s) }));
        failures = 0;
      } catch (e) {
        if (!this.pending.has(id)) this.pending.set(id, s); // keep it unless a newer state is already waiting
        failures++;
        this.log(`dynamodb write failed (${failures}): ${String(e)}`);
        await new Promise((r) => setTimeout(r, Math.min(30_000, this.retryMs * 2 ** Math.min(failures - 1, 4))));
      }
    }
  }
}

/** Creates the table if it doesn't exist (on-demand billing, key = id). Returns true when it was created now. */
export async function ensureTable(db: DynamoDBClient, table: string): Promise<boolean> {
  try { await db.send(new DescribeTableCommand({ TableName: table })); return false; } catch (e) {
    if ((e as { name?: string }).name !== "ResourceNotFoundException") throw e;
  }
  await db.send(new CreateTableCommand({
    TableName: table, BillingMode: "PAY_PER_REQUEST",
    AttributeDefinitions: [{ AttributeName: "id", AttributeType: "S" }],
    KeySchema: [{ AttributeName: "id", KeyType: "HASH" }],
    Tags: [{ Key: "project", Value: "syllabus-crew" }],
  }));
  await waitUntilTableExists({ client: db, maxWaitTime: 60 }, { TableName: table });
  return true;
}

export const tableName = () => `${process.env.DYNAMODB_TABLE_PREFIX || "syllabus-crew"}-students`;
export const makeDynamo = () => new DynamoDBClient({ region: process.env.AWS_REGION });
