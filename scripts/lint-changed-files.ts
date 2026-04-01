/*
 * lint-changed-files looks at the list of files that have changed from the
 * working branch and runs the linter on them.
 */

import { execSync, spawn } from "child_process";
import { extname, relative, resolve } from "path";
import * as readline from "readline";

interface EslintInstance {
  lintFiles(files: string[]): Promise<EslintResult[]>;
  loadFormatter(name?: string): Promise<{
    format(results: EslintResult[]): string;
  }>;
}

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { ESLint } = require("eslint") as {
  ESLint: {
    new (options?: { fix?: boolean }): EslintInstance;
    outputFixes(results: EslintResult[]): Promise<void>;
  };
};

const root = resolve(__dirname, "..");

class LintError extends Error {
  constructor(public mode: "filtered" | "unfiltered") {
    super(`Lint errors found (${mode})`);
    this.name = "LintError";
  }
}

interface EslintMessage {
  ruleId: string;
  severity: number;
  message: string;
  line: number;
  column: number;
}

interface EslintResult {
  filePath: string;
  messages: EslintMessage[];
  errorCount: number;
  warningCount: number;
}

function getChangedFiles(cmpBranch: string): { files: string[]; ignored: string[] } {
  const files: string[] = [];
  const ignoredFiles: string[] = [];
  const extensionsToCheck = [".js", ".ts"];

  const gitOutput = execSync(`git diff --diff-filter=d --name-only ${cmpBranch}`, { cwd: root })
    .toString()
    .trim();

  if (!gitOutput) {
    return { files, ignored: ignoredFiles };
  }

  for (const line of gitOutput.split("\n")) {
    const file = line.trim();
    if (!file) continue;
    if (extensionsToCheck.includes(extname(file))) {
      files.push(file);
    } else {
      ignoredFiles.push(file);
    }
  }
  return { files, ignored: ignoredFiles };
}

async function getChangedLines(
  cmpBranch: string,
  files: string[],
): Promise<Record<string, Set<number>>> {
  const args = ["diff", "-U0", cmpBranch];
  if (files.length > 0) {
    args.push("--", ...files);
  }

  const git = spawn("git", args, { cwd: root });
  const rl = readline.createInterface({
    input: git.stdout,
    terminal: false,
  });

  const changedLinesByFile: Record<string, Set<number>> = {};
  let currentFile = "";

  for await (const line of rl) {
    if (line.startsWith("diff --git")) {
      currentFile = "";
    } else if (line.startsWith("+++ b/")) {
      currentFile = line.substring(6);
      changedLinesByFile[currentFile] = new Set<number>();
    } else if (line.startsWith("@@ ")) {
      const match = /^@@\s+-\d+(?:,\d+)?\s+\+(\d+)(?:,(\d+))?\s+@@/.exec(line);
      if (match && currentFile) {
        const start = parseInt(match[1], 10);
        const length = match[2] ? parseInt(match[2], 10) : 1;
        for (let i = 0; i < length; i++) {
          changedLinesByFile[currentFile].add(start + i);
        }
      }
    }
  }

  return new Promise((resolvePromise, reject) => {
    git.on("close", (code) => {
      if (code === 0) {
        resolvePromise(changedLinesByFile);
      } else {
        reject(new Error(`git diff failed with code ${code ?? "unknown"}`));
      }
    });
  });
}

async function runLint(
  files: string[],
  otherArgs: string[],
): Promise<{ results: EslintResult[]; eslint: EslintInstance }> {
  const fix = otherArgs.includes("--fix");
  const eslint = new ESLint({ fix });
  const results = await eslint.lintFiles(files);

  if (fix) {
    await ESLint.outputFixes(results);
  }
  return { results, eslint };
}

async function reportStandard(
  results: EslintResult[],
  eslint: EslintInstance,
  quiet: boolean,
  maxWarnings: number,
): Promise<void> {
  let processedResults = results;
  if (quiet) {
    processedResults = results
      .map((r) => ({
        ...r,
        messages: r.messages.filter((m) => m.severity === 2),
        errorCount: r.messages.filter((m) => m.severity === 2).length,
        warningCount: 0,
      }))
      .filter((r) => r.messages.length > 0 || r.errorCount > 0);
  }

  const formatter = await eslint.loadFormatter("stylish");
  const resultText = formatter.format(processedResults);
  console.log(resultText);

  const errorCount = processedResults.reduce(
    (acc: number, r: EslintResult) => acc + r.errorCount,
    0,
  );
  const warningCount = processedResults.reduce(
    (acc: number, r: EslintResult) => acc + r.warningCount,
    0,
  );

  if (errorCount > 0) {
    throw new LintError("unfiltered");
  }

  if (maxWarnings >= 0 && warningCount > maxWarnings) {
    console.error(
      `\nFound ${warningCount} warnings, which exceeds the max-warnings limit of ${maxWarnings}.`,
    );
    throw new LintError("unfiltered");
  }
}

function reportFiltered(
  results: EslintResult[],
  changedLinesByFile: Record<string, Set<number>>,
  quiet: boolean,
  maxWarnings: number,
): void {
  let errorCount = 0;
  let warningCount = 0;
  let filesWithIssues = 0;

  for (const result of results) {
    const relPath = relative(root, result.filePath);
    const changedLines = changedLinesByFile[relPath] || new Set<number>();

    const filteredMessages = result.messages.filter((msg: EslintMessage) => {
      const lineMatch = changedLines.has(msg.line);
      const quietMatch = !quiet || msg.severity === 2;
      return lineMatch && quietMatch;
    });

    if (filteredMessages.length > 0) {
      filesWithIssues++;
      console.log(`\n${relPath}`);
      for (const msg of filteredMessages) {
        const severity = msg.severity === 2 ? "error" : "warning";
        console.log(`  ${msg.line}:${msg.column}  ${severity}  ${msg.message}  ${msg.ruleId}`);
        if (msg.severity === 2) {
          errorCount++;
        } else {
          warningCount++;
        }
      }
    }
  }

  if (errorCount > 0) {
    console.error(`\nFound ${errorCount} errors on changed lines.`);
    throw new LintError("filtered");
  } else if (maxWarnings >= 0 && warningCount > maxWarnings) {
    console.error(
      `\nFound ${warningCount} warnings on changed lines, which exceeds the max-warnings limit of ${maxWarnings}.`,
    );
    throw new LintError("filtered");
  } else if (filesWithIssues > 0) {
    console.log(`\nNo errors found on changed lines (found ${warningCount} warnings).`);
  } else {
    console.log("\nClean on changed lines.");
  }
}

/**
 * Main function of the script.
 */
async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const onlyChangedLines = args.includes("--only-changed-lines");

  let quiet = false;
  let maxWarnings = -1;
  const otherArgs: string[] = [];

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--only-changed-lines") {
      continue;
    } else if (arg === "--quiet") {
      quiet = true;
    } else if (arg === "--max-warnings") {
      maxWarnings = parseInt(args[++i], 10);
    } else {
      otherArgs.push(arg);
    }
  }

  const cmpBranch = process.env.CI ? "origin/main" : "main";

  const { files, ignored } = getChangedFiles(cmpBranch);

  if (ignored.length) {
    console.log("Ignoring changed files:");
    for (const f of ignored) {
      console.log(` - ${f}`);
    }
    console.log();
  }

  if (!files.length) {
    console.log("No changed files to lint.");
    return;
  }

  const { results, eslint } = await runLint(files, otherArgs);

  if (onlyChangedLines) {
    const changedLines = await getChangedLines(cmpBranch, files);
    reportFiltered(results, changedLines, quiet, maxWarnings);
  } else {
    await reportStandard(results, eslint, quiet, maxWarnings);
  }
}

main().catch((e) => {
  if (e instanceof LintError) {
    process.exit(1);
  }
  console.error("Script failed:", e);
  process.exit(1);
});
