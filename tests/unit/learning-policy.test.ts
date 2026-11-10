// @vitest-environment node
import { describe, expect, it } from "vitest";
import { recommendation } from "../../server/gemini";
import { ADAPTIVE_POLICY } from "../../server/learning-policy";

const history = (score = 22, difficulty = "Basic", count = 3) => Array.from({length:count},(_,i)=>({
  id:`s${i}`,problemId:`q${i}`,topicId:"topic",difficulty,workflowVersion:6,status:"submitted",
  statsCommittedAt:new Date(i+1),submittedAt:new Date(i+1),supportHistory:[],gateEvaluations:{},
  scorecard:{criteria:Object.fromEntries(["accuracy","logicalValidity","methodSelection","explanationQuality"].map(k=>[k,{score}]))},
}));
describe("topic mastery policy",()=>{
  it("advances strong independent work with auditable evidence and thresholds",()=>{
    expect(recommendation("Basic",history(),"topic")).toMatchObject({recommendedDifficulty:"Intermediate",policyVersion:ADAPTIVE_POLICY.version,decision:"advance",evidence:{completedSessions:3,accuracy:88,independentSessions:3}});
  });
  it.each([0,1,2])("maintains a current level with %s completed sessions",count=>{
    expect(recommendation("Intermediate",history(25,"Intermediate",count)).recommendedDifficulty).toBe("Intermediate");
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
  it("maintains mixed evidence and does not let strong averages hide poor method selection",()=>{
    expect(recommendation("Basic",history(18)).decision).toBe("maintain_mixed_evidence");
    const records=history(25);records.forEach(s=>s.scorecard.criteria.methodSelection.score=12);
    expect(recommendation("Basic",records).recommendedDifficulty).toBe("Basic");
  });
  it("reduces for repeated low performance and clamps basic",()=>{
    expect(recommendation("Intermediate",history(10,"Intermediate")).recommendedDifficulty).toBe("Basic");
    expect(recommendation("Basic",history(10)).recommendedDifficulty).toBe("Basic");
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
  it("uses a rolling window and counts each session once",()=>{
    const records=history(25,"Basic",6);records[0].scorecard.criteria.accuracy.score=0;
    expect(recommendation("Basic",[...records,records[5]]).evidence).toMatchObject({completedSessions:5,accuracy:100});
  });
});
