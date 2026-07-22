import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { extname, join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const dist = join(root, "dist");
const problemBank = join(root, "src", "data", "mindguide-problems.ts");

if (!existsSync(dist)) {
  console.error("Browser bundle scan failed: dist does not exist. Run npm run build first.");
  process.exit(1);
}

const forbiddenMarkers = [
  "VITE_GEMINI_API_KEY",
  "VITE_AI_PROVIDER",
  "VITE_OLLAMA",
  "GoogleGenAI",
  "solutionSteps",
  "socraticPrompts",
  "referenceAnswer",
  "PRIVATE_PROBLEM_REFERENCE",
  "INTERNAL_RUBRIC",
];

const knownPrivateStrings = existsSync(problemBank)
  ? extractPrivateStrings(readFileSync(problemBank, "utf8"))
  : [];
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
