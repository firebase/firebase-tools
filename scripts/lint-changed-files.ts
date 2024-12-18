/*
 * lint-changed-files looks at the list of files that have changed from the
 * working branch and runs the linter on them.
 */

import { execSync } from "child_process";
import { extname, resolve } from "path";

const root = resolve(__dirname, "..");

const deletedFileRegex = /^D\s.+$/;
const extensionsToCheck = [".js", ".ts"];

/**
 * Returns the last element of an array.
 * @param arr any array.
 * @return the last element of the array.
 */
function last<T>(arr: Array<T>): T {
  return arr[arr.length - 1];
}

/**
 * Main function of the script.
 */
function main(): void {
  const files: string[] = [];
  const ignoredFiles: string[] = [];

  const otherArgs = process.argv.slice(2);

  let cmpBranch = "master";
  if (process.env.CI) {
    cmpBranch = "origin/master";
  }

  const gitOutput = execSync(`git diff --name-status ${cmpBranch}`, { cwd: root })
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
    execSync(`eslint ${otherArgs.join(" ")} ${files.join(" ")}`, {
      cwd: root,
      stdio: ["pipe", process.stdout, process.stderr],
    });
  } catch (e: any) {
    console.error("eslint failed, see errors above.");
    console.error();
    process.exit(e.status);
  }
}

main();
