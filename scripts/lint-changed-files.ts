/*
 * lint-changed-files looks at the list of files that have changed from the
 * working branch and runs the linter on them.
 */

import { execSync } from "child_process";
import { extname, relative, resolve } from "path";

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
  const deletedFileRegex = /^D\s.+$/;
  const extensionsToCheck = [".js", ".ts"];

  const gitOutput = execSync(`git diff --name-status ${cmpBranch}`, { cwd: root })
    .toString()
    .trim();

  for (const line of gitOutput.split("\n")) {
    const l = line.trim();
    if (!l) continue;
    if (deletedFileRegex.test(l)) {
      continue;
    }
    const entries = l.split(/\s/);
    const file = entries[entries.length - 1];
    if (extensionsToCheck.includes(extname(file))) {
      files.push(file);
    } else {
      ignoredFiles.push(file);
    }
  }
  return { files, ignored: ignoredFiles };
}

function getChangedLines(cmpBranch: string): Record<string, Set<number>> {
  const diffOutput = execSync(`git diff -U0 ${cmpBranch}`, { cwd: root }).toString();
  const changedLinesByFile: Record<string, Set<number>> = {};
  let currentFile = "";

  for (const line of diffOutput.split("\n")) {
    if (line.startsWith("+++ b/")) {
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
  return changedLinesByFile;
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

async function reportStandard(results: EslintResult[], eslint: EslintInstance): Promise<void> {
  const formatter = await eslint.loadFormatter("stylish");
  const resultText = formatter.format(results);
  console.log(resultText);

  const errorCount = results.reduce((acc: number, r: EslintResult) => acc + r.errorCount, 0);
  if (errorCount > 0) {
    throw new LintError("unfiltered");
  }
}

function reportFiltered(
  results: EslintResult[],
  changedLinesByFile: Record<string, Set<number>>,
): void {
  let errorCount = 0;

  for (const result of results) {
    const relPath = relative(root, result.filePath);
    const changedLines = changedLinesByFile[relPath] || new Set<number>();

    const filteredMessages = result.messages.filter((msg: EslintMessage) =>
      changedLines.has(msg.line),
    );

    if (filteredMessages.length > 0) {
      console.log(`\n${relPath}`);
      for (const msg of filteredMessages) {
        const severity = msg.severity === 2 ? "error" : "warning";
        console.log(`  ${msg.line}:${msg.column}  ${severity}  ${msg.message}  ${msg.ruleId}`);
        if (msg.severity === 2) {
          errorCount++;
        }
      }
    }
  }

  if (errorCount > 0) {
    console.error(`\nFound ${errorCount} errors on changed lines.`);
    throw new LintError("filtered");
  } else {
    console.log("\nNo errors found on changed lines.");
  }
}

/**
 * Main function of the script.
 */
async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const onlyChangedLines = args.includes("--only-changed-lines");
  const otherArgs = args.filter((a) => a !== "--only-changed-lines");

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
    const changedLines = getChangedLines(cmpBranch);
    reportFiltered(results, changedLines);
  } else {
    await reportStandard(results, eslint);
  }
}

main().catch((e) => {
  if (e instanceof LintError) {
    process.exit(1);
  }
  console.error("Script failed:", e);
  process.exit(1);
});
