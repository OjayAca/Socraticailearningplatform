import { spawnSync } from "node:child_process";
const target = process.env.GCLOUD_PROJECT || process.env.MINDGUIDE_TARGET_PROJECT;
if (!target) throw new Error("The deployment must identify its target Firebase project.");
const result = spawnSync(process.execPath, ["--import", "tsx", "scripts/migrate-spark.ts", "--verify", `--project=${target}`], { stdio: "inherit", windowsHide: true });
if (result.error) throw result.error;
process.exit(result.status ?? 1);
