import * as fs from "fs-extra";
import * as path from "path";
import * as yaml from "js-yaml";
import { DelegateContext, RuntimeDelegate } from "./index";
import * as discovery from "./discovery";

/**
 *
 */
export async function tryCreateDelegate(
  context: DelegateContext,
): Promise<RuntimeDelegate | undefined> {
  const yamlPath = path.join(context.sourceDir, "functions.yaml");
  if (!(await fs.pathExists(yamlPath))) {
    return undefined;
  }

  // If runtime is specified, use it. Otherwise default to "dart3".
  // "dart" is often used as a generic alias, map it to "dart3"
  let runtime = context.runtime || "dart3";
  if ((runtime as string) === "dart") {
    runtime = "dart3" as any;
  }

  return {
    language: "dart",
    runtime: runtime,
    bin: "", // No bin needed for no-build
    validate: async () => {
      // Basic validation that the file is parseable
      try {
        const content = await fs.readFile(yamlPath, "utf8");
        yaml.load(content);
      } catch (e: any) {
        throw new Error(`Failed to parse functions.yaml: ${e.message}`);
      }
    },
    build: async () => {
      // No-op for no-build
      return Promise.resolve();
    },
    watch: async () => {
      return Promise.resolve(async () => {
        // No-op
      });
    },
    discoverBuild: async () => {
      const build = await discovery.detectFromYaml(context.sourceDir, context.projectId, runtime);
      if (!build) {
        // This should not happen because we checked for existence in tryCreateDelegate
        throw new Error("Could not find functions.yaml");
      }
      return build;
    },
  };
}
