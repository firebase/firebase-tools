import { Runtime, FileSystem, FrameworkSpec } from "./types";
import { NodejsRuntime } from "./runtimes/NodejsRuntime";
import * as fs from "fs";
import * as yaml from "js-yaml";
import * as path from "path";
import { AppSpec } from "../interfaces";

/**
 * Discover framework in the given project directory
 */
export function discover(): AppSpec {
  return {
    baseImage: "us-docker.pkg.dev/firestack-build/test/run:latest",
    environmentVariables: {
      NODE_ENV: "PRODUCTION",
    },
    installCommand: "npm install",
    buildCommand: "npm run build",
    startCommand: "npm run start",

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    afterInstall: (b) => {
      console.log("HOOK: AFTER INSTALL");
      return { ...b, version: "v1alpha", notes: "afterInstall" };
    },

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    afterBuild(b) {
      console.log("HOOK: AFTER BUILD");
      return { ...b, version: "v1alpha", notes: "afterBuild" };
    },
  };
}

const allRuntimes: Runtime[] = [new NodejsRuntime()];

/**
 * Read the project folder to detect the Runtime environment.
 */
export async function findRuntime(fs: FileSystem): Promise<Runtime> {
  let runtimeMatch: Runtime | null = null;
  for (const runtime of allRuntimes) {
    const isMatched = await runtime.match(fs);
    if (isMatched && !runtimeMatch) {
      runtimeMatch = runtime;
    } else {
      throw new Error("More than one runtime matched the codebase");
    }
  }
  if (!runtimeMatch) {
    throw new Error("No runtime matched the codebase");
  }
  return runtimeMatch;
}

// /**
//  * Discovers the framework of the codebase and returns required commands to run the codebase.
//  */
// export async function discover(fs: FileSystem): Promise<RuntimeSpec | null> {
//   try {
//     const runtimeMatch: Runtime = await findRuntime(fs);
//     const allFrameworkSpecs = await readYAMLFile("frameworkSpecTest.yml");
//     return runtimeMatch.analyseCodebase(fs, allFrameworkSpecs);
//   } catch {
//     throw new Error("Can't indetify the framework for the given codebase");
//   }
// }

/**
 * Read the YAML file.
 */
export async function readYAMLFile(file: string): Promise<FrameworkSpec[]> {
  const frameworkSpecs: FrameworkSpec[] = [];
  try {
    const filePath = path.join(__dirname, file);
    const fileContents = fs.readFileSync(filePath, "utf-8");
    const documents = yaml.loadAll(fileContents);
    documents.forEach((document) => {
      const spec: FrameworkSpec = document as FrameworkSpec;
      frameworkSpecs.push(spec);
    });
  } catch (error) {
    console.error("Error:", error);
    throw new Error("No such file or directory exists.");
  }
  return Promise.resolve(frameworkSpecs);
}
