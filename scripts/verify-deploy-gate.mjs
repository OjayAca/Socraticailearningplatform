import { spawnSync } from "node:child_process";
const project = process.env.GCLOUD_PROJECT || process.env.MINDGUIDE_TARGET_PROJECT;
if (!project) throw new Error("Deployment requires an explicit MINDGUIDE_TARGET_PROJECT.");
const args = ["--import", "tsx", "scripts/release-preflight.ts", `--project=${project}`];
if (process.env.MINDGUIDE_DEPLOY_MODE === "closed-staging") args.push("--closed-staging");
else {
  if (!process.env.MINDGUIDE_OWNER_EVIDENCE || !process.env.MINDGUIDE_OWNER_PUBLIC_KEY) throw new Error("Participant deployment requires signed owner evidence and its public key.");
  args.push(`--evidence=${process.env.MINDGUIDE_OWNER_EVIDENCE}`, `--owner-key=${process.env.MINDGUIDE_OWNER_PUBLIC_KEY}`);
}
const result = spawnSync(process.execPath, args, { stdio: "inherit", windowsHide: true });
if (result.error) throw result.error;
process.exit(result.status ?? 1);
