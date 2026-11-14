// Creates the DynamoDB table and copies the current local state into it.
//   npm run dynamo:setup -w @syllabus-crew/agent
// Then set STORE=dynamo in .env and restart the agent.
import { existsSync, readFileSync } from "node:fs";
import { PutItemCommand } from "@aws-sdk/client-dynamodb";
import type { StudentState } from "@syllabus-crew/core";
import { ensureTable, makeDynamo, tableName, toItem } from "../adapters/dynamo-store.ts";

const db = makeDynamo();
const table = tableName();
const created = await ensureTable(db, table);
console.log(created ? `Created table ${table} (on-demand billing).` : `Table ${table} already exists.`);

const path = new URL("../../../../.data/state.json", import.meta.url).pathname;
const students: StudentState[] = existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) : [];
for (const s of students) await db.send(new PutItemCommand({ TableName: table, Item: toItem(s) }));
console.log(`Copied ${students.length} student record(s) from .data/state.json.`);
