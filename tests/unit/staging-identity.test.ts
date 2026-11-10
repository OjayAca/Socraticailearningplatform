// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { GET } from "../../app/api/staging-identity/route";
import verifyBrowserTarget from "../../scripts/staging-browser-setup";

const f=vi.hoisted(()=>({get:vi.fn(),project:"offline-unit"}));
vi.mock("../../server/firebase",()=>({getAdminFirestore:()=>({databaseId:"(default)",projectId:f.project,doc:()=>({get:f.get})})}));
vi.mock("../../server/config",()=>({getServerEnv:()=>({FIREBASE_PROJECT_ID:f.project})}));
vi.mock("../../scripts/lib/staging-target.ts",()=>({loadTarget:async()=>({projectId:"offline-unit",database:"(default)",origin:"https://unit.invalid",verificationId:"owner-id"})}));
const identity={projectId:"offline-unit",database:"(default)",origin:"https://unit.invalid",verificationId:"owner-id"};
beforeEach(()=>{
  f.project="offline-unit"; f.get.mockReset().mockResolvedValue({data:()=>({...identity,classification:"non-production"})});
  vi.stubEnv("MINDGUIDE_STAGING_VERIFICATION_ID","owner-id");
  vi.stubEnv("MINDGUIDE_E2E_BASE_URL",identity.origin);
  vi.stubEnv("NEXT_PUBLIC_FIREBASE_PROJECT_ID",f.project);
});
afterEach(()=>{vi.unstubAllGlobals();vi.unstubAllEnvs();});
it("checks the compiled browser project, actual backend client, marker and origin before browser tests",async()=>{
  const response=await GET(); expect(response.status).toBe(200);
  vi.stubGlobal("fetch",vi.fn().mockResolvedValue(response));
  await expect(verifyBrowserTarget()).resolves.toBeUndefined();
});
it.each(["disabled","production","browser mismatch","revoked marker"])("refuses an identity for %s",async reason=>{
  if(reason==="disabled") vi.stubEnv("MINDGUIDE_STAGING_VERIFICATION_ID","");
  if(reason==="production") {f.project="socratic-ai-a7765";vi.stubEnv("NEXT_PUBLIC_FIREBASE_PROJECT_ID",f.project);}
  if(reason==="browser mismatch") vi.stubEnv("NEXT_PUBLIC_FIREBASE_PROJECT_ID","other-project");
  if(reason==="revoked marker") f.get.mockResolvedValue({data:()=>undefined});
  const result=await GET(); expect(result.ok).toBe(false); expect(await result.text()).toBe("");
});
it.each(["production backend","foreign origin","wrong verification","wrong URL"])("halts browser setup on %s",async reason=>{
  const data={...identity,browserProjectId:identity.projectId};
  if(reason==="production backend") data.projectId="socratic-ai-a7765";
  if(reason==="foreign origin") data.origin="https://elsewhere.invalid";
  if(reason==="wrong verification") data.verificationId="revoked";
  if(reason==="wrong URL") vi.stubEnv("MINDGUIDE_E2E_BASE_URL","https://other.invalid");
  vi.stubGlobal("fetch",vi.fn().mockResolvedValue(Response.json(data)));
  await expect(verifyBrowserTarget()).rejects.toThrow();
});
