import { describe, it, expect } from "vitest";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { initializeApp, getApps } from "firebase-admin/app";
import { getFirestore, Timestamp } from "firebase-admin/firestore";

const exec = promisify(execFile);
if (!process.env.FIRESTORE_EMULATOR_HOST) throw new Error("Migration rehearsal requires the emulator.");
if (!getApps().length) initializeApp({projectId:"mindguide-test"});
const db = getFirestore();
const run = (...args: string[]) => exec(process.execPath,["--import","tsx","scripts/migrate-v5.ts","--project=mindguide-test",...args], {env:process.env,windowsHide:true,maxBuffer:4*1024*1024});

describe("v5 migration rehearsal", () => {
  it("preserves history, rejects insecure sources, reapplies without changes and rolls back the exact manifest", async () => {
    for(const collection of await db.listCollections()) await db.recursiveDelete(collection);
    const ref = db.doc("sessions/legacy");
    await ref.set({schemaVersion:2,workflowVersion:2,studentId:"fixture",status:"in_progress",createdAt:Timestamp.fromMillis(1000),ctScore:85});
    await expect(run()).rejects.toThrow();
    await ref.update({schemaVersion:4,workflowVersion:4});
    await db.doc("sessions/legacy/private/reference").set({finalAnswer:"private fixture answer"});
    const dry = await run(); expect(dry.stdout).toContain('"dry-run"');
    expect((await db.collection("problems").get()).empty).toBe(true);
    const applied = await run("--apply");
    const backup = /Backup: (.+)/.exec(applied.stdout)?.[1].trim(); expect(backup).toBeTruthy();
    expect((await db.collection("problems").get()).size).toBe(18);
    expect((await ref.get()).get("status")).toBe("archived");
    expect((await ref.get()).get("ctScore")).toBe(85);
    await expect(run("--verify")).resolves.toBeDefined();
    const repeat = await run("--apply"); expect(repeat.stdout).toContain('"changes": []');
    await run("--rollback",`--backup=${backup}`);
    expect((await db.collection("problems").get()).empty).toBe(true);
    expect((await ref.get()).get("status")).toBe("in_progress");
    expect((await db.doc("system_settings/pilot").get()).get("state")).toBe("closed");
    expect((await db.doc("sessions/legacy/private/reference").get()).get("finalAnswer")).toBe("private fixture answer");
  },120000);
});
