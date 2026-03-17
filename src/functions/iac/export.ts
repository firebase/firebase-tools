import * as runtimes from "../../deploy/functions/runtimes";
import * as supported from "../../deploy/functions/runtimes/supported";
import * as functionsConfig from "../../functionsConfig";
import * as projectConfig from "../projectConfig";
import * as functionsEnv from "../../functions/env";
import { logger } from "../../logger";
import * as yaml from "js-yaml";
import * as tf from "./terraform";
import * as gcfv1 from "../../gcp/cloudfunctions";
import { needProjectId } from "../../projectUtils";

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
    },
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
  {
    type: "variable",
    labels: ["extension_id"],
    attributes: {
      description:
        "The extension ID. Used for reverse compatibility when extensions ahve been ported. Injects an env var and adds a function name prefix",
      default: null,
    },
  },
];

export type Exporter = (
  options: any,
  codebase: projectConfig.ValidatedSingle,
) => Promise<Record<string, string>>;

/**
 *
 */
export async function getInternalIac(
  options: any,
  codebase: projectConfig.ValidatedSingle,
): Promise<Record<string, string>> {
  const projectId = needProjectId(options);

  const firebaseConfig = await functionsConfig.getFirebaseConfig(options);
  const firebaseEnvs = functionsEnv.loadFirebaseEnvs(firebaseConfig, projectId);

  const delegateContext: runtimes.DelegateContext = {
    projectId,
    sourceDir: options.config.path(codebase.source!),
    projectDir: options.config.projectDir,
    runtime: codebase.runtime,
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
    firebaseEnvs,
  );

  return {
    "functions.yaml": yaml.dump(build),
  };
}

/**
 *
 */
export async function getTerraformIac(
  options: any,
  codebase: projectConfig.ValidatedSingle,
): Promise<Record<string, string>> {
  // HACK HACK HACK. This is the cheap way to convince existing code to use/parse
  // the terraform interpolated values instead of trying to resolve them at build time.
  // Need to create an extension to the contanier contract to support this properly
  // (Would replace the FIREBASE_CONFIG and GCLOUD_PROEJCT env vars with a list of
  // terraform vars possibly?)
  const firebaseConfig = {
    authDomain: "${var.project}.firebaseapp.com",
    // TOTALLY WRONG. THIS IS ONLY FOR OLD FORMATS.
    databaseURL: "https://REALTIME_DATABASE_URLS_ARE_HARD_TO_INJECT.firebaseio.com",
    storageBucket: "${var.project}.appspot.com",
  };
  const firebaseEnvs = {
    FIREBASE_CONFIG: JSON.stringify(firebaseConfig),
    GCLOUD_PROJECT: "${var.project}",
  };

  const delegateContext: runtimes.DelegateContext = {
    // This is a hack to get the functions SDK to use terraform interpolation
    // instead of trying to resolve the project ID at build time.
    // TODO: do the same for region.
    projectId: "${var.project}",
    sourceDir: options.config.path(codebase.source!),
    projectDir: options.config.projectDir,
    runtime: codebase.runtime,
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
    firebaseEnvs,
  );

  // Defining as a local here. Wil eventually be a copy from a data type that fetches
  // the local firebase config.
  const blocks: tf.Block[] = [
    {
      type: "locals",
      attributes: { firebaseConfig },
    },
  ];

  for (const [name, ep] of Object.entries(build.endpoints)) {
    if (ep.platform === "gcfv1") {
      blocks.push(
        ...gcfv1.terraformFromEndpoint(
          name,
          ep,
          tf.expr("var.gcf_bucket"),
          tf.expr("var.gcf_archive"),
        ),
      );
    } else {
      logger.debug(`Skipping ${name} because it is not a GCFv1 function`);
    }
  }

  blocks.sort((left, right) => {
    if (left.type !== right.type) {
      return left.type.localeCompare(right.type);
    }
    for (let i = 0; i < (left.labels || []).length; i++) {
      if (i >= (right.labels?.length ?? 0)) {
        return 1;
      }
      const leftLabel = left.labels![i];
      const rightLabel = right.labels![i];
      if (leftLabel !== rightLabel) {
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
  };
}
