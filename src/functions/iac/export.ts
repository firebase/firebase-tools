import { FirebaseError } from "../../error";
import * as runtimes from "../../deploy/functions/runtimes";
import * as supported from "../../deploy/functions/runtimes/supported";
import * as backend from "../../deploy/functions/backend";
import { logger } from "../../logger";
import * as yaml from "js-yaml";
import * as tf from "./terraform";
import * as gcfv1 from "../../gcp/cloudfunctions";

const STANDARD_TF_VARS: tf.Block[] = [
  {
    type: "variable",
    labels: ["project"],
    attributes: {
      description: "The ID of the project to deploy to.",
    },
  },
  {
    type: "variable",
    labels: ["location"],
    attributes: {
      description: "The location to deploy to. Default us-central1 (deprecated)",
      default: "us-central1",
    }
  },
  {
    type: "variable",
    labels: ["gcf_bucket"],
    attributes: {
      description: "The name of the bucket to deploy to.",
    },
  },
  {
    type: "variable",
    labels: ["gcf_archive"],
    attributes: {
      description: "The name of the archive to deploy to.",
    },
  },
];

// N.B. ProjectId needs to be a variable, not a string here.
export async function getFunctionsManifest(
  sourceDir: string,
  projectDir: string,
  projectId: string,
  runtime: string | undefined,
  envs: backend.EnvironmentVariables,
  format: "internal" | "terraform" | "designcenter",
): Promise<Record<string, string>> {
  if (format === "designcenter") {
    throw new FirebaseError("The designcenter format export is not yet supported");
  }

  const delegateContext: runtimes.DelegateContext = {
    projectId,
    sourceDir,
    projectDir,
    runtime: (runtime || supported.latest("nodejs")) as supported.Runtime, // runtimes.getRuntimeDelegate handles validating runtime
  };

  const runtimeDelegate = await runtimes.getRuntimeDelegate(delegateContext);
  logger.debug(`Validating ${runtimeDelegate.language} source`);
  supported.guardVersionSupport(runtimeDelegate.runtime);
  await runtimeDelegate.validate();

  logger.debug(`Building ${runtimeDelegate.language} source`);
  await runtimeDelegate.build();

  logger.debug(`Discovering ${runtimeDelegate.language} source`);
  const build = await runtimeDelegate.discoverBuild(
    {}, // Assume empty runtimeConfig
    envs,
  );

  if (format === "internal") {
    return {
      "functions.yaml": yaml.dump(build),
    };
  }

  const blocks: tf.Block[] = [];
  for (const [name, ep] of Object.entries(build.endpoints)) {
    if (ep.platform === "gcfv1") {
      blocks.push(...gcfv1.terraformFromEndpoint(name, ep, tf.expr("var.gcf_bucket"), tf.expr("var.gcf_archive")));
    } else {
      logger.debug(`Skipping ${name} because it is not a GCFv1 function`);
    }
  }

  blocks.sort((left, right) => {
    if (left.type != right.type) {
      return left.type.localeCompare(right.type);
    }
    for (let i = 0; i < (left.labels || []).length; i++) {
      if (i > (right.labels?.length ?? -1)) {
        return 1;
      }
      const leftLabel = left.labels![i];
      const rightLabel = right.labels![i];
      if (leftLabel != rightLabel) {
        return leftLabel.localeCompare(rightLabel);
      }
    }
    if ((right.labels || []).length > (left.labels || []).length) {
      return -1;
    }

    logger.warn("Unexpected: two blocks with identical types and labels");
    return 0;
  });

  return {
    "variables.tf": STANDARD_TF_VARS.map(tf.blockToString).join("\n\n"),
    "main.tf": blocks.map(tf.blockToString).join("\n\n"),
  }
}
