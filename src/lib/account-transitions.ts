export type AccountAction = "activate" | "suspend" | "deactivate";

const transitions: Record<string, readonly AccountAction[]> = {
  active: ["suspend", "deactivate"],
  suspended: ["activate", "deactivate"],
  deactivated: ["activate"],
};

export function accountActions(status: unknown, role: unknown): readonly AccountAction[] {
  return role === "student" && typeof status === "string" ? transitions[status] ?? [] : [];
}
