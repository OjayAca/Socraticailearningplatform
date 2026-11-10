// @vitest-environment node
import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { GeminiTutor, educationalContext, SYSTEM_PROMPT, type TutorContext } from "../../server/gemini";
import type { Env } from "../../server/platform";

// Actual DM-06-B01 browser correction/hint sequence; identity removed and message
// IDs anonymized. No learner record or achievement is created by these tests.
const captured: TutorContext = JSON.parse(readFileSync(new URL("../fixtures/corrected-probability-scoring.json", import.meta.url), "utf8"));
const env = { GEMINI_API_KEY:"unit-test-only", GEMINI_MODEL:"test-model" } as Env;

describe("scoring context after corrected reasoning", () => {
  it("fits the real corrected session into the unchanged budget without losing evidence", async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json({candidates:[{finishReason:"MAX_TOKENS"}]}));
    vi.stubGlobal("fetch", fetchMock);
    try {
      // Reaching the provider boundary distinguishes this from the old local
      // context-too-long rejection; the response is deliberately not a score.
      await expect(new GeminiTutor(env).generate(captured)).rejects.toThrow("incomplete");
      expect(fetchMock).toHaveBeenCalledOnce();
      const body = JSON.parse(fetchMock.mock.calls[0][1].body);
      const serialized = body.contents[0].parts[0].text;
      const sent = JSON.parse(serialized);
      expect(SYSTEM_PROMPT.length + serialized.length + JSON.stringify(body.generationConfig.responseJsonSchema).length + 4096).toBeLessThanOrEqual(32000);
      expect(sent.learnerEvidence).toEqual(captured.messages.filter(m=>m.role==="student").map(({id,phase,text})=>({id,phase,text})));
      expect(sent.assessedResponses).toEqual(captured.assessedResponses!.map(({messageId,phase,status})=>({messageId,phase,status})));
      expect(sent.assessedResponses.some((r:any)=>r.status==="needs_revision")).toBe(true);
      expect(sent.assessedResponses.filter((r:any)=>r.status==="accepted")).toHaveLength(4);
      const acceptedId = (phase: string) => captured.assessedResponses!.find(r => r.phase === phase && r.status === "accepted")!.messageId;
      expect(sent.requiredEvidenceOptions.accuracy).toEqual([acceptedId("guided_computation_or_proof")]);
      expect(sent.requiredEvidenceOptions.methodSelection).toEqual([acceptedId("method_selection")]);
      expect(sent.requiredEvidenceOptions.explanationQuality).toEqual([acceptedId("result_interpretation")]);
      expect(sent.requiredEvidenceOptions.logicalValidity).toContain(acceptedId("guided_computation_or_proof"));
      expect(sent.assistance).toEqual(captured.session.supportHistory);
      expect(sent.reference.sourceGuidance).toEqual(captured.reference.sourceGuidance);
      expect(sent.reference.finalAnswer).toBe(captured.reference.finalAnswer);
      expect(sent.conversation).toEqual(captured.messages.slice(-12).filter(m=>m.role!=="student").map(({id,role,phase,text})=>({id,role,phase,text})));
    } finally { vi.unstubAllGlobals(); }
  });

  it("keeps separate mathematical notation in scoring evidence and preserves normal tutoring context", () => {
    const context = structuredClone(captured);
    context.messages[0] = {id:"notation",role:"student",phase:"guided_computation_or_proof",text:"My corrected calculation\n\\frac{1}{4}+\\frac{1}{4}=\\frac{1}{2}"};
    expect(educationalContext(context).learnerEvidence).toContainEqual({id:"notation",phase:"guided_computation_or_proof",text:context.messages[0].text});
    const tutoring = educationalContext({...context,intent:"answer"});
    expect(tutoring.stageEvidence).toEqual(context.session.gateEvaluations);
    expect(tutoring.conversation.some(m=>m.role==="student")).toBe(true);
  });

  it("still rejects genuinely oversized evidence before a provider request", async () => {
    const fetchMock = vi.fn(); vi.stubGlobal("fetch",fetchMock);
    try {
      const context = structuredClone(captured);
      context.messages.push({id:"oversize",role:"student",phase:"result_interpretation",text:"x".repeat(32000)});
      await expect(new GeminiTutor(env).generate(context)).rejects.toThrow("too long");
      expect(fetchMock).not.toHaveBeenCalled();
    } finally { vi.unstubAllGlobals(); }
  });
});
