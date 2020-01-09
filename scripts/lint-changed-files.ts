/*
 * lint-changed-files looks at the list of files that have changed from the
 * working branch and runs the linter on them. 
 */

import { execSync } from "child_process";
import { extname, resolve } from "path";

const root = resolve(__dirname, "..");

const deletedFileRegex = /^D\s.+$/;
const extensionsToCheck = [".js", ".ts"];

function main() {
  const files: string[] = [];
  const ignoredFiles: string[] = [];
  const gitOutput = execSync("git diff --name-status master", { cwd: root })
    .toString()
    .trim();

  for (const line of gitOutput.split("\n")) {
    const l = line.trim();
    if (deletedFileRegex.test(l)) {
      continue;
    }
    const entries = l.split(/\s/);
    const file = last(entries);
    if (extensionsToCheck.includes(extname(file))) {
      files.push(file);
    } else {
      ignoredFiles.push(file);
    }
  }

  if (ignoredFiles.length) {
    console.log("Ignoring changed files:");
    for (const f of ignoredFiles) {
      console.log(` - ${f}`);
    }
    console.log();
  }

  if (!files.length) {
    console.log("No changed files to lint.");
    return;
  }

  try {
    execSync(`eslint ${files.join(" ")}`, {
      cwd: root,
      stdio: ["pipe", process.stdout, process.stderr],
    });
  } catch (e) {
    console.error("eslint failed, see errors above.");
    console.error();
    process.exit(e.status);
  }
}

main();

function last<T>(arr: Array<T>): T {
  return arr[arr.length - 1];
}
