import { promisify } from "node:util";
import { Command } from "../command";
import * as childProcess from "node:child_process";
import * as fs from "node:fs/promises";
import { logBullet, logWarning } from "../utils";
interface Dependencies {
  [name: string]: {
    version: string;
    resolved: string;
    overridden: boolean;
    dependencies: Dependencies;
    problems: string[];
    invalid?: string;
  };
}
interface NpmOutput {
  version: string;
  name: string;
  problems: string[];
  dependencies: Dependencies;
}

const exec = promisify(childProcess.exec);
const DESCRIPTION = `Automatically detect potential issues related to your web app's configuration`;
interface StdOutErr {
  stdout: string;
}
export const command = new Command("doctor").description(DESCRIPTION).action(doctorAction);
/**
 * doctor command action
 */
export async function doctorAction(): Promise<void> {
  // Note: This command requires nodejs installation and will not work with firepit users that don't have node installed.
  try {
    await fs.access("node_modules", fs.constants.F_OK);
  } catch {
    console.log('Install your dependencies before running "firebase doctor"');
    return;
  }
  try {
    await fs.access("package.json", fs.constants.F_OK);
  } catch {
    console.log('Run "firebase doctor" from a path with a valid package.json');
    return;
  }

  try {
    const { stdout } = await exec("npm ls firebase --json");
    if (parse(JSON.parse(stdout) as NpmOutput)) {
      console.log("No problems found in your configuration.");
    }
  } catch (e) {
    if ("stdout" in (e as Object)) {
      const parsedOutput: NpmOutput = JSON.parse((e as StdOutErr)?.stdout);
      if (parse(parsedOutput as NpmOutput)) {
        console.log("No problems found in your configuration.");
      }
    }
  }
}
function parse(parsedOutput: NpmOutput) {
  if (!parsedOutput.dependencies || Object.keys(parsedOutput).length === 0) {
    return true;
  }
  const versionsOfFirebase: string[] = [];
  const overallProblems = Object.keys(parsedOutput.dependencies)
    .map((key: string) => {
      const curDep = parsedOutput.dependencies[key];
      if (curDep.dependencies && curDep.dependencies["firebase"]) {
        const firebaseDep = curDep.dependencies["firebase"];
        if (!versionsOfFirebase.includes(firebaseDep.version)) {
          versionsOfFirebase.push(firebaseDep.version);
        }
      }
      if (key === "firebase") {
        if (!versionsOfFirebase.includes(curDep.version)) {
          versionsOfFirebase.push(curDep.version);
        }
      }
      return {
        dep: key,
        problems: parsedOutput.dependencies[key].problems,
        invalid: parsedOutput.dependencies[key].invalid,
      };
    })
    .filter((res) => res.problems);
  let success = true;
  if (overallProblems.length > 0) {
    logWarning("Issues detected with your firebase app:");
    success = false;
  }
  overallProblems.map((problem) => logBullet(`${problem.dep} is invalid: ${problem.invalid}`));
  if (versionsOfFirebase.length > 1) {
    logWarning("You have multiple versions of firebase installed:");
    versionsOfFirebase.map((version) => logBullet(version));
    success = false;
  }
  return success;
}
