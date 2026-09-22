import { readFile } from "node:fs/promises";
import { GeminiTutor } from "../worker/src/tutor";
import type { Env } from "../worker/src/platform";

// Explicit operator-only free-tier probe; no Firebase reads/writes or real student data.
const values = Object.fromEntries((await readFile(".env","utf8")).split(/\r?\n/).filter(line=>/^\w+=/.test(line)).map(line=>{const i=line.indexOf("=");return[line.slice(0,i),line.slice(i+1).trim().replace(/^["']|["']$/g,"")];}));
if (!values.GEMINI_API_KEY) throw new Error("Configure server-only GEMINI_API_KEY. Never use VITE_GEMINI_API_KEY.");
if (!process.argv.includes("--free-tier-confirmed")) throw new Error("Confirm the key project is on the Free tier before using --free-tier-confirmed.");
const env = {GEMINI_API_KEY:values.GEMINI_API_KEY,GEMINI_MODEL:process.env.GEMINI_MODEL ?? "gemini-3.6-flash"} as Env;
const begin=performance.now();
try {
  const result=await new GeminiTutor(env).generate({intent:"opening",session:{subject:"Quantitative Methods",topic:"Understanding a problem",difficulty:"Basic",originalQuestion:"Explain how to identify the goal and givens of a mathematical problem.",currentPhase:"problem_understanding"},reference:{expectedConcepts:["goal","givens"]},messages:[]});
  console.log(JSON.stringify({model:env.GEMINI_MODEL,elapsedMs:Math.round(performance.now()-begin),structuredResponseValid:true,result},null,2));
} catch (error) { console.error(error instanceof Error?error.message:"AI probe failed");process.exitCode=1; }
