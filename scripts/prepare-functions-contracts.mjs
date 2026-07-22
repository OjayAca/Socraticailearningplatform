import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const source = resolve(root, "packages", "contracts", "dist");
const target = resolve(root, "functions", "vendor", "contracts", "dist");

await mkdir(target, { recursive: true });
await Promise.all([
  copyFile(resolve(source, "index.js"), resolve(target, "index.js")),
  copyFile(resolve(source, "index.d.ts"), resolve(target, "index.d.ts")),
]);

const sourcePackage = JSON.parse(await readFile(resolve(root, "packages", "contracts", "package.json"), "utf8"));
const vendorPackagePath = resolve(root, "functions", "vendor", "contracts", "package.json");
const vendorPackage = JSON.parse(await readFile(vendorPackagePath, "utf8"));
vendorPackage.version = sourcePackage.version;
await writeFile(vendorPackagePath, `${JSON.stringify(vendorPackage, null, 2)}\n`, "utf8");

console.log("Prepared canonical contracts for the Firebase Functions deployment source.");
