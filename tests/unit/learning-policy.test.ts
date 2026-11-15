// @vitest-environment node
import { describe, expect, it } from "vitest";
import { recommendation } from "../../server/gemini";
import {
  ADAPTIVE_POLICY,
  effectiveSessionCorrections,
  isIndependentSession,
  updateMisconceptionProfile,
} from "../../server/learning-policy";

const history = (score = 22, difficulty = "Basic", count = 3) => Array.from({length:count},(_,i)=>({
  id:`s${i}`,problemId:`q${i}`,topicId:"topic",difficulty,workflowVersion:6,status:"submitted",
  statsCommittedAt:new Date(i+1),submittedAt:new Date(i+1),supportHistory:[],gateEvaluations:{},
  scorecard:{criteria:Object.fromEntries(["accuracy","logicalValidity","methodSelection","explanationQuality"].map(k=>[k,{score}]))},
}));
describe("topic mastery policy",()=>{
  it("advances strong independent work with auditable evidence and thresholds",()=>{
    expect(recommendation("Basic",history(),"topic")).toMatchObject({recommendedDifficulty:"Intermediate",policyVersion:ADAPTIVE_POLICY.version,decision:"advance",decisionLabel:"Advance",masteryStatus:"Mastered",cooldownSessionsRemaining:0,evidence:{completedSessions:3,accuracy:88,independentSessions:3}});
  });
  it.each([0,1,2])("maintains a current level with %s completed sessions",count=>{
    const rec = recommendation("Intermediate",history(25,"Intermediate",count));
    expect(rec.recommendedDifficulty).toBe("Intermediate");
    expect(rec.cooldownSessionsRemaining).toBe(3 - count);
  });
  it("does not reuse basic mastery to advance an intermediate learner",()=>{
    expect(recommendation("Intermediate",[...history(),...history(25,"Intermediate",1)])).toMatchObject({recommendedDifficulty:"Intermediate",evidence:{completedSessions:1}});
  });
  it("excludes other topics, failed sessions, malformed scores and duplicate questions",()=>{
    const records = history();
    const variants = [
      records.map(s=>({...s,topicId:"other"})), records.map(s=>({...s,status:"abandoned"})),
      records.map(s=>({...s,statsCommittedAt:null})),records.map(s=>({...s,problemId:"same"})),
      records.map(s=>({...s,scorecard:{criteria:{}}})),
    ];
    for (const sessions of variants) expect(recommendation("Basic",sessions,"topic").recommendedDifficulty).toBe("Basic");
  });
  it("maintains mixed evidence and does not let strong averages hide poor method selection or logical validity",()=>{
    expect(recommendation("Basic",history(18)).decision).toBe("maintain_mixed_evidence");
    const weakMethod=history(25);weakMethod.forEach(s=>s.scorecard.criteria.methodSelection.score=12);
    expect(recommendation("Basic",weakMethod).recommendedDifficulty).toBe("Basic");
    const weakLogic=history(25);weakLogic.forEach(s=>s.scorecard.criteria.logicalValidity.score=14);
    expect(recommendation("Basic",weakLogic).recommendedDifficulty).toBe("Basic");
    expect(recommendation("Basic",weakLogic).decision).toBe("maintain_mixed_evidence");
  });
  it("reduces for repeated low performance and clamps basic, allowing immediate remediation at 2 sessions without cooldown",()=>{
    expect(recommendation("Intermediate",history(10,"Intermediate")).recommendedDifficulty).toBe("Basic");
    expect(recommendation("Basic",history(10)).recommendedDifficulty).toBe("Basic");
    const twoStruggling = history(10, "Advanced", 2);
    const immediateRemediation = recommendation("Advanced", twoStruggling, "topic");
    expect(immediateRemediation.recommendedDifficulty).toBe("Intermediate");
    expect(immediateRemediation.decision).toBe("remediation");
    expect(immediateRemediation.decisionLabel).toBe("Remediate");
    expect(immediateRemediation.masteryStatus).toBe("Needs remediation");
  });
  it("holds heavily assisted or repeatedly corrected mastery without reducing final score",()=>{
    for (const change of [
      (s:any)=>{s.supportHistory=[{level:"partial_step"}];},
      (s:any)=>{s.supportHistory=[{level:"targeted_hint"},{level:"targeted_hint"}];},
      (s:any)=>{s.gateEvaluations={guided_computation_or_proof:{correctiveCycleCount:2}};},
    ]) {
      const records=history(25);records.forEach(change);
      expect(recommendation("Basic",records).recommendedDifficulty).toBe("Basic");
      expect(records[0].scorecard.criteria.accuracy.score).toBe(25);
    }
  });
  it("recognizes neutral socratic_prompt and independent self-correction in session independence", () => {
    const selfCorrectedSession = {
      ...history(24, "Basic", 1)[0],
      supportHistory: [{ level: "socratic_prompt" }, { level: "targeted_hint" }],
      gateEvaluations: {
        method_selection: { correctiveCycleCount: 2, selfCorrected: true },
      },
    };
    expect(effectiveSessionCorrections(selfCorrectedSession)).toBe(1);
    expect(isIndependentSession(selfCorrectedSession)).toBe(true);
  });
  it("uses a rolling window and counts each session once",()=>{
    const records=history(25,"Basic",6);records[0].scorecard.criteria.accuracy.score=0;
    expect(recommendation("Basic",[...records,records[5]]).evidence).toMatchObject({completedSessions:5,accuracy:100});
  });

  it("factors recurring misconceptions into advancement blocking and remediation, while ignoring tentative or resolved ones", () => {
    const strongButMisconceived = history(24, "Basic").map((s, idx) => ({
      ...s,
      diagnosisSummary: idx < 2 ? ["conceptual_error"] : [],
    }));
    const blocked = recommendation("Basic", strongButMisconceived, "topic");
    expect(blocked.recommendedDifficulty).toBe("Basic");
    expect(blocked.decision).toBe("maintain_mixed_evidence");
    expect(blocked.evidence.recurringMisconceptions).toEqual(["conceptual_error"]);

    // Tentative single medium-confidence misconception does not block advancement
    let profile = updateMisconceptionProfile({}, {
      id: "s0",
      topicId: "topic",
      tentativeDiagnoses: ["theorem_condition_violation"],
      diagnosisSummary: [],
      selfCorrectedCategories: [],
      resolvedMisconceptions: [],
    }, 1000);
    expect(profile.topic__theorem_condition_violation.status).toBe("tentative");
    expect(recommendation("Basic", history(24, "Basic"), "topic", profile).decision).toBe("advance");

    // Second distinct session promotes tentative to confirmed and blocks advancement
    profile = updateMisconceptionProfile(profile, {
      id: "s1",
      topicId: "topic",
      tentativeDiagnoses: ["theorem_condition_violation"],
      diagnosisSummary: [],
      selfCorrectedCategories: [],
      resolvedMisconceptions: [],
    }, 2000);
    expect(profile.topic__theorem_condition_violation.status).toBe("confirmed");
    expect(profile.topic__theorem_condition_violation.occurrences).toBe(2);
    expect(recommendation("Basic", history(24, "Basic"), "topic", profile).decision).toBe("maintain_mixed_evidence");

    // Independent self-correction resolves the misconception and unblocks advancement
    profile = updateMisconceptionProfile(profile, {
      id: "s2",
      topicId: "topic",
      tentativeDiagnoses: [],
      diagnosisSummary: [],
      selfCorrectedCategories: ["theorem_condition_violation"],
      resolvedMisconceptions: ["theorem_condition_violation"],
    }, 3000);
    expect(profile.topic__theorem_condition_violation.status).toBe("resolved");
    expect(recommendation("Basic", history(24, "Basic"), "topic", profile).decision).toBe("advance");

    const subMasteryRecurring = history(19, "Intermediate").map((s, idx) => ({
      ...s,
      diagnosisSummary: idx < 2 ? ["wrong_formula"] : [],
    }));
    const remediated = recommendation("Intermediate", subMasteryRecurring, "topic");
    expect(remediated.recommendedDifficulty).toBe("Basic");
    expect(remediated.decision).toBe("remediation");
  });
});
