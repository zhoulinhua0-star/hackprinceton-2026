import { test } from "node:test";
import assert from "node:assert/strict";
import { PutItemCommand, ScanCommand } from "@aws-sdk/client-dynamodb";
import type { AttributeValue } from "@aws-sdk/client-dynamodb";
import { DynamoStore, fromItem, toItem, type DynamoLike } from "./adapters/dynamo-store.ts";
import { day1State } from "./seed.ts";

type Item = Record<string, AttributeValue>;
/** An in-memory table that speaks the two commands the store uses. `failNext` makes the next N writes throw. */
class FakeTable implements DynamoLike {
  rows = new Map<string, Item>();
  puts = 0;
  failNext = 0;
  async send(cmd: PutItemCommand | ScanCommand) {
    if (cmd instanceof PutItemCommand) {
      if (this.failNext > 0) { this.failNext--; throw new Error("ProvisionedThroughputExceededException"); }
      this.puts++;
      this.rows.set(cmd.input.Item!.id!.S!, cmd.input.Item!);
      return {};
    }
    // one item per page, to prove the scan follows LastEvaluatedKey
    const all = [...this.rows.values()];
    const start = cmd.input.ExclusiveStartKey ? Number(cmd.input.ExclusiveStartKey.page!.N) : 0;
    const page = all.slice(start, start + 1);
    return { Items: page, ...(start + 1 < all.length ? { LastEvaluatedKey: { page: { N: String(start + 1) } } } : {}) };
  }
}

test("an item round-trips, and carries readable columns for the AWS console", () => {
  const s = day1State("+15555550100", true);
  s.agentName = "Juno";
  const item = toItem(s, new Date("2026-11-14T12:00:00Z"));
  assert.equal(item.id!.S, "+15555550100");
  assert.equal(item.agentName!.S, "Juno");
  assert.equal(item.updatedAt!.S, "2026-11-14T12:00:00.000Z");
  assert.ok(item.state?.S && !item.stateGz);
  assert.deepEqual(fromItem(item), s);
});

test("a very large state is gzipped to stay under DynamoDB's item limit, and still reads back", () => {
  const s = day1State("+15555550100", true);
  s.messages = Array.from({ length: 200 }, (_, i) => ({ dir: "out" as const, text: "x".repeat(2000) + i, at: "2026-11-14T12:00:00Z" }));
  const item = toItem(s);
  assert.ok(item.stateGz?.B && !item.state);
  assert.ok(item.stateGz.B.length < 400_000);
  assert.deepEqual(fromItem(item), s);
  assert.equal(fromItem({ id: { S: "x" }, state: { S: "{not json" } }), undefined);
});

test("open loads every student across scan pages; saves write through; reads are copies", async () => {
  const t = new FakeTable();
  for (const id of ["+15555550100", "+15555550101", "+15555550102"]) t.rows.set(id, toItem(day1State(id, true)));
  const store = await DynamoStore.open({ db: t, table: "test" });
  assert.deepEqual((await store.ids()).sort(), ["+15555550100", "+15555550101", "+15555550102"]);

  const s = (await store.load("+15555550100"))!;
  s.agentName = "Pip";
  s.messages.push({ dir: "in", text: "hi", at: "2026-11-14T12:00:00Z" });
  assert.equal((await store.load("+15555550100"))!.agentName, undefined); // a loaded copy is not the stored one
  await store.save(s);
  assert.equal((await store.load("+15555550100"))!.agentName, "Pip"); // memory updates at once
  await store.flush();
  assert.equal(fromItem(t.rows.get("+15555550100")!)!.agentName, "Pip");

  const again = await DynamoStore.open({ db: t, table: "test" }); // a restart sees it
  assert.equal((await again.load("+15555550100"))!.messages.at(-1)!.text, "hi");
});

test("a failed write is retried without breaking the save, and only the newest state is sent", async () => {
  const t = new FakeTable();
  const logs: string[] = [];
  const store = await DynamoStore.open({ db: t, table: "test", retryMs: 1, log: (l) => logs.push(l) });
  t.failNext = 2;
  const s = day1State("+15555550100", true);
  await store.save(s); // does not throw
  for (let i = 1; i <= 5; i++) { s.messages.push({ dir: "in", text: `m${i}`, at: "2026-11-14T12:00:00Z" }); await store.save(s); }
  await store.flush();
  assert.equal(logs.length, 2);
  assert.equal(fromItem(t.rows.get("+15555550100")!)!.messages.at(-1)!.text, "m5");
  assert.ok(t.puts <= 2, `coalesced writes, got ${t.puts}`);
});
