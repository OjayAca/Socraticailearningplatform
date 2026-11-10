import { getAdminFirestore } from "../../../server/firebase";
import { getServerEnv } from "../../../server/config";

export const dynamic = "force-dynamic";
// Exposes only the non-secret identity needed to bind browser tests to the verified deployment.
export async function GET() {
  const verificationId = process.env.MINDGUIDE_STAGING_VERIFICATION_ID;
  if (!verificationId) return new Response(null,{status:404});
  try {
    const projectId = getServerEnv().FIREBASE_PROJECT_ID;
    const browserProjectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
    const db = getAdminFirestore();
    if (projectId === "socratic-ai-a7765" || projectId !== browserProjectId || !("projectId" in db) || db.projectId !== projectId) return new Response(null,{status:403});
    const marker = (await db.doc("system_settings/staging_verification").get()).data();
    if (marker?.classification !== "non-production" || marker.projectId !== projectId ||
      marker.database !== db.databaseId || marker.verificationId !== verificationId) return new Response(null,{status:403});
    return Response.json({projectId,browserProjectId,database:db.databaseId,verificationId,origin:marker.origin},{headers:{"Cache-Control":"no-store"}});
  } catch { return new Response(null,{status:503}); }
}
