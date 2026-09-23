const requiredVariables = [
  "MINDGUIDE_E2E_BASE_URL",
  "MINDGUIDE_E2E_STUDENT_EMAIL",
  "MINDGUIDE_E2E_STUDENT_PASSWORD",
  "MINDGUIDE_E2E_ADMIN_EMAIL",
  "MINDGUIDE_E2E_ADMIN_PASSWORD",
];

const missing = requiredVariables.filter((name) => !process.env[name]?.trim());

if (missing.length > 0) {
  console.error(
    `Staging verification requires: ${missing.join(", ")}. ` +
      "Provide dedicated staging credentials through environment secrets."
  );
  process.exit(1);
}

let baseURL;
try {
  baseURL = new URL(process.env.MINDGUIDE_E2E_BASE_URL);
} catch {
  console.error("MINDGUIDE_E2E_BASE_URL must be a valid absolute URL.");
  process.exit(1);
}

if (!["http:", "https:"].includes(baseURL.protocol)) {
  console.error("MINDGUIDE_E2E_BASE_URL must use HTTP or HTTPS.");
  process.exit(1);
}

if (
  process.env.MINDGUIDE_E2E_STUDENT_EMAIL.trim().toLowerCase() ===
  process.env.MINDGUIDE_E2E_ADMIN_EMAIL.trim().toLowerCase()
) {
  console.error("Student and administrator staging accounts must be different.");
  process.exit(1);
}

if (baseURL.hostname.toLowerCase().includes("socratic-ai-a7765")) {
  console.error(
    "Refusing to run mutating staging checks against socratic-ai-a7765. " +
      "Use a dedicated staging deployment."
  );
  process.exit(1);
}

console.log(`Staging E2E preflight passed for ${baseURL.origin}.`);
