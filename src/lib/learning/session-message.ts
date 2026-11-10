/** scorecard is read from the saved session, never inferred from status. */
export function closedSessionMessage(status: string, scorecard: unknown): string {
  const record = status === "expired"
    ? "This session expired. Your saved reasoning history is preserved."
    : status === "abandoned"
      ? "This session was abandoned. Your saved reasoning history is preserved."
      : status === "returned"
        ? "Your session was returned for review. Your saved reasoning history is preserved."
        : "Your saved reasoning history is preserved. Administrator feedback appears in your history.";
  return `${record} ${scorecard ? "Your saved scorecard is available in learning history." : "No saved scorecard is available for this session."}`;
}
