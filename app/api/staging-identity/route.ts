import { getAdminFirestore } from "../../../server/firebase";
import { getServerEnv } from "../../../server/config";
import { API_SECURITY_HEADERS } from "../../../server/http-security";

export const dynamic = "force-dynamic";
// Exposes only the non-secret identity needed to bind browser tests to the verified deployment.
export async function GET() {
  const verificationId = process.env.MINDGUIDE_STAGING_VERIFICATION_ID;
  if (!verificationId) return new Response(null,{status:404,headers:API_SECURITY_HEADERS});
  try {
    const projectId = getServerEnv().FIREBASE_PROJECT_ID;
    const browserProjectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
    const db = getAdminFirestore();
    if (projectId === "socratic-ai-a7765" || projectId !== browserProjectId || !("projectId" in db) || db.projectId !== projectId) return new Response(null,{status:403,headers:API_SECURITY_HEADERS});
    const marker = (await db.doc("system_settings/staging_verification").get()).data();
    if (marker?.classification !== "non-production" || marker.projectId !== projectId ||
      marker.database !== db.databaseId || marker.verificationId !== verificationId) return new Response(null,{status:403,headers:API_SECURITY_HEADERS});
    return Response.json({projectId,browserProjectId,database:db.databaseId,verificationId,origin:marker.origin},{headers:API_SECURITY_HEADERS});
  } catch { return new Response(null,{status:503,headers:API_SECURITY_HEADERS}); }
}
