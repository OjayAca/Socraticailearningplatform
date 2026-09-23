import nextEnv from "@next/env";
import { GeminiTutor } from "../server/gemini";
import type { Env } from "../server/platform";

// Explicit operator-only free-tier probe; no Firebase reads/writes or real student data.
nextEnv.loadEnvConfig(process.cwd());
const values = process.env;
if (!values.GEMINI_API_KEY) throw new Error("Configure server-only GEMINI_API_KEY. Never use VITE_GEMINI_API_KEY.");
if (!process.argv.includes("--free-tier-confirmed")) throw new Error("Confirm the key project is on the Free tier before using --free-tier-confirmed.");
const env = {GEMINI_API_KEY:values.GEMINI_API_KEY,GEMINI_MODEL:values.GEMINI_MODEL} as Env;
const begin=performance.now();
try {
  const result=await new GeminiTutor(env).generate({intent:"opening",session:{subject:"Quantitative Methods",topic:"Understanding a problem",difficulty:"Basic",originalQuestion:"Explain how to identify the goal and givens of a mathematical problem.",currentPhase:"problem_understanding"},reference:{expectedConcepts:["goal","givens"]},messages:[]});
  console.log(JSON.stringify({model:env.GEMINI_MODEL,elapsedMs:Math.round(performance.now()-begin),structuredResponseValid:true,result},null,2));
} catch (error) { console.error(error instanceof Error?error.message:"AI probe failed");process.exitCode=1; }
