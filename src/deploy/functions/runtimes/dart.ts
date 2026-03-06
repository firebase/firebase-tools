import * as fs from "fs-extra";
import * as path from "path";
import * as yaml from "js-yaml";
import { DelegateContext, RuntimeDelegate } from "./index";
import * as discovery from "./discovery";

// TODO: Temporary file for testing no build deploy. Remove this file after Invertase prepare phase is merged
/**
 * Create a runtime delegate for the Dart runtime, if applicable.
 * @param context runtimes.DelegateContext
 * @return Delegate Dart runtime delegate
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
  const runtime = context.runtime || "dart3";

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
