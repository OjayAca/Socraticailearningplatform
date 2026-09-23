import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { extname, join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const dist = join(root, ".next", "static");
const problemBank = join(root, "src", "data", "mindguide-problems.ts");

if (!existsSync(dist)) {
  console.error("Browser bundle scan failed: .next/static does not exist. Run npm run build first.");
  process.exit(1);
}

const forbiddenMarkers = ["GEMINI_API_KEY", "FIREBASE_PRIVATE_KEY", "generativelanguage.googleapis.com", "You are a Socratic mathematics tutor", "VITE_AI_PROVIDER", "VITE_OLLAMA", "GoogleGenAI", "firebase-admin", "httpsCallable", "cloudfunctions.net", "BEGIN PRIVATE KEY", "PRIVATE_CANONICAL_ANSWER"];

const knownPrivateStrings = existsSync(problemBank)
  ? extractPrivateStrings(readFileSync(problemBank, "utf8"))
  : [];
const pilotBank = join(root, "docs", "mindguide-secure-release", "PILOT_REVIEW_BANK.json");
if (existsSync(pilotBank)) {
  const collect = value => {
    if (typeof value === "string" && value.trim().length >= 16) knownPrivateStrings.push(value.trim());
    else if (Array.isArray(value)) value.forEach(collect);
    else if (value && typeof value === "object") Object.values(value).forEach(collect);
  };
  for (const problem of JSON.parse(readFileSync(pilotBank,"utf8")).problems) {
    for (const field of ["solutionSteps", "finalAnswer", "interpretation", "requiredFormula", "requiredTheorem"]) collect(problem.privateSolution[field]);
  }
}
const files = walk(dist).filter((file) => [".js", ".mjs", ".html", ".css", ".map"].includes(extname(file)));
const failures = [];

for (const file of files) {
  const content = readFileSync(file, "utf8");
  for (const marker of forbiddenMarkers) {
    if (content.includes(marker)) failures.push({ file, kind: `forbidden marker ${marker}` });
  }
  if (knownPrivateStrings.some((privateValue) => content.includes(privateValue))) {
    failures.push({ file, kind: "known curated answer, solution step, or private prompt" });
  }
}

if (failures.length) {
  console.error("Browser bundle scan failed. Private server material was detected:");
  for (const failure of failures) {
    console.error(`- ${failure.file.slice(root.length + 1)}: ${failure.kind}`);
  }
  process.exit(1);
}

console.log(`Browser bundle scan passed: ${files.length} assets checked against ${forbiddenMarkers.length} markers and ${knownPrivateStrings.length} curated private strings.`);

function walk(directory) {
  return readdirSync(directory).flatMap((name) => {
    const path = join(directory, name);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}

function extractPrivateStrings(source) {
  const values = new Set();
  const privateSections = [
    ...source.matchAll(/(?:solutionSteps|socraticPrompts)\s*:\s*(\[[\s\S]*?\]|\{[\s\S]*?\n\s*\})\s*,/g),
    ...source.matchAll(/(?:finalAnswer|interpretation|requiredFormula|requiredTheorem)\s*:\s*("(?:\\.|[^"\\])*")/g),
  ];
  for (const match of privateSections) {
    for (const literal of String(match[1]).matchAll(/"((?:\\.|[^"\\])*)"/g)) {
      try {
        const decoded = JSON.parse(`"${literal[1]}"`).trim();
        if (decoded.length >= 16) values.add(decoded);
      } catch {
        // Invalid source literals are ignored; fixed markers still prevent private object bundling.
      }
    }
  }
  return [...values];
}
