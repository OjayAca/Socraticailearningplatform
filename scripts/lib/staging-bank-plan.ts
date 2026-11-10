import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { prepareQuestionBank } from "../question-bank-core.ts";
import { questionBankDocuments } from "../question-bank-documents.ts";

export const sourceHash = "5579cfa063b1cb640948662f0399acabd51ad8d6b8271d445390508e7cf93ce0";
const originalHash = "f1fded3636d0514fb5f09ae29b7a2d2f65cdf3341a6225853a4cad36a5446dc0";
async function readBank(path:string, hash:string) {
  const raw = await readFile(path);
  if (createHash("sha256").update(raw).digest("hex") !== hash) throw new Error("Pinned bank source changed: " + path);
  return prepareQuestionBank(JSON.parse(raw.toString()));
}
export async function stagingPlan() {
  const records = await readBank("docs/question-bank-expansion/MINDGUIDE_84_Question_Expansion.json",sourceHash);
  const originals = await readBank("scripts/data/E_MINDGUIDE_Problem_Bank.json",originalHash);
  const approval = JSON.parse(await readFile("docs/QUESTION_BANK_APPROVAL_2026-10-25.json","utf8"));
  if (approval.sourceFileHash !== originalHash) throw new Error("Original bank evidence mismatch.");
  const baseline = await questionBankDocuments(originals,originalHash,approval);
  const entries = await questionBankDocuments(records,sourceHash);
  for (const record of records) entries.get("problems/"+record.id)!.importSource = "MINDGUIDE_84_Question_Expansion";
  const paths = [...entries.keys()];
  if (records.length !== 84 || entries.size !== 924 || baseline.size !== 468 || paths.some(p=>baseline.has(p)))
    throw new Error("Unexpected expansion inventory.");
  // Each group contains 42 whole questions and 462 content documents.
  return {records, baseline, entries, groups:[paths.slice(0,462),paths.slice(462)]};
}
export type Plan = Awaited<ReturnType<typeof stagingPlan>>;
