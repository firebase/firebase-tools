import * as fs from "fs-extra";
import * as path from "path";
import * as yaml from "js-yaml";
import { DelegateContext, RuntimeDelegate } from "./index";
import { buildFromV1Alpha1 } from "./discovery/v1alpha1";

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
    language: "dart" as any, // "dart" is not yet in supported.Language union, but we added it to types?
    runtime: runtime as any,
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
    discoverBuild: async (config, envs) => {
      const content = await fs.readFile(yamlPath, "utf8");
      const parsed = yaml.load(content);
      // We pass stub values for project/region as they are often overridden or unused in Build object
      // until resolveBackend.
      // However, buildFromV1Alpha1 might use them for defaults.
      // Using context.projectId.
      return buildFromV1Alpha1(parsed, context.projectId, "us-central1", runtime as any);
    },
  };
}
