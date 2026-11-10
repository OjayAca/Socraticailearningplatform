// @vitest-environment node
import { expect, it } from "vitest";
import { logicPlan, missingPaths } from "../../scripts/seed-staging-logic";
import { contentHash } from "../../src/lib/learning/content-hash";

it("includes the approved progression and return questions with matching private references", async () => {
  const plan = await logicPlan();
  const questions = [...plan.keys()].filter(p => /^problems\/[^/]+$/.test(p));
  expect(questions.sort()).toEqual(["B01", "B02", "B03", "B04", "I01", "I02", "I03"].map(s => "problems/DM-04-" + s));
  for (const path of questions) {
    const id = path.split("/")[1];
    const problem = plan.get(path)!;
    const approval = plan.get("content_validation_records/" + problem.validationRecordId);
    expect(approval).toMatchObject({ decision: "approved", problemId: id, scoringSnapshotHash: await contentHash(plan.get("problem_scoring/" + id)) });
    const source = plan.get(path + "/private/import_source")!.source;
    expect(await contentHash(source)).toBe(problem.sourceHash);
  }
  expect(plan.get("system_settings/pilot")).toEqual({ state:"open", enabledTopicIds:["discrete-mathematics-logic"] });
  expect([...plan.keys()].some(p => /^(users|sessions|pilot_roster|learning_progress)\//.test(p))).toBe(false);
});

it("creates only missing paths on retry and rejects a changed existing document", async () => {
  const plan = await logicPlan();
  const prior = new Map(plan);
  expect(missingPaths(plan, prior)).toEqual([]);
  prior.delete("problems/DM-04-I02");
  expect(missingPaths(plan, prior)).toEqual(["problems/DM-04-I02"]);
  prior.set("problems/DM-04-I01", { difficulty: "Advanced" });
  expect(() => missingPaths(plan, prior)).toThrow("Existing staging data differs");
});
