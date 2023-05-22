import { readFileSync, writeFileSync } from "fs";
import { resolve } from "path";

const tmpDir = process.argv[2];
const file = resolve(__dirname, "..", tmpDir, "npm-shrinkwrap.json");

const shrinkwrapStr = readFileSync(file, "utf8");
const shrinkwrap = JSON.parse(shrinkwrapStr);

shrinkwrap.packages[""].devDependencies = {};

const newPkgs: Record<string, any> = {};
for (const [pkg, info] of Object.entries<any>(shrinkwrap.packages)) {
  if (!info.dev) {
    newPkgs[pkg] = info;
  }
}
shrinkwrap.packages = newPkgs;

const newDependencies: Record<string, any> = {};
for (const [pkg, info] of Object.entries<any>(shrinkwrap.dependencies)) {
  if (!info.dev) {
    newDependencies[pkg] = info;
  }
}
shrinkwrap.dependencies = newDependencies;

writeFileSync(file, JSON.stringify(shrinkwrap, undefined, 2));
