import { collection, doc, getDoc, getDocs, query, where, type DocumentData } from "firebase/firestore";
import { auth, db, firebaseSetupMessage } from "./firebase";

export function database() {
  if (!db) throw new Error(firebaseSetupMessage);
  return db;
}
export function currentUser() {
  if (!auth?.currentUser) throw new Error("Your session has ended. Sign in again to continue.");
  return auth.currentUser;
}
export async function requireAdmin() {
  const user = currentUser();
  const [profile, token] = await Promise.all([getDoc(doc(database(), "users", user.uid)), user.getIdTokenResult()]);
  if (profile.get("role") !== "admin" || profile.get("status") !== "active" || token.claims.role !== "admin") throw new Error("Administrator access is required.");
  return user;
}
export async function ownSessions(): Promise<DocumentData[]> {
  const uid = currentUser().uid;
  const snapshot = await getDocs(query(collection(database(), "sessions"), where("studentId", "==", uid)));
  return snapshot.docs.map(item => ({ ...item.data(), id: item.id }));
}
export const millis = (value: any): number => value?.toMillis?.() ?? (typeof value === "number" ? value : 0);
export const topicKey = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
