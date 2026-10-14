import { Client } from "../../apiv2";
import { FirebaseError } from "../../error";
import { Build } from "../../gcp/cloudbuild";

/**
 * Prototype: generates the Cloud Build config that Cloud Run's build backend (RCS) generates for a
 * buildpacks build with a base image, plus build secrets, which Cloud Run's build API can't take.
 * Mirrors google3 cloud/serverless/boq/runtime/config/buildspec/generator.go.
 *
 * Build env vars and secrets reach the buildpacks the same way as on App Hosting, through
 * /platform/env: Cloud Build puts each secret in the env of the pre-buildpack step, and the shim in
 * that step writes every name in --env_var_names to /platform/env/<NAME>.
 */
export interface BuildInput {
  region: string;
  /** Where the built image goes, e.g. .../cloud-run-source-deploy/{serviceId}:{timestamp}. */
  imageUri: string;
  /** The uploaded source zip. */
  source: { bucket: string; object: string };
  /** {region}-docker.pkg.dev/serverless-runtimes/{stack}/runtimes/{runtime} */
  baseImage: string;
  /** Plain build env vars. */
  env: Record<string, string>;
  /** Build secrets: env var name -> projects/{p}/secrets/{s}/versions/{v}. */
  secrets: Record<string, string>;
  /** Builder and run image releases, from releaseTags(). */
  release: { builder: string; run: string; version: string };
}

/** Returns the Cloud Build config that RCS generates for a Cloud Run buildpacks build, plus secrets. */
export function rcsBuildConfig(i: BuildInput): Build {
  const [, , stack, , runtime] = i.baseImage.split("/"); // e.g. "google-22", "nodejs22"
  const images = `${i.region}-docker.pkg.dev/serverless-runtimes`;
  const builderStack = stack.endsWith("-full") ? stack : `${stack}-full`;
  const language = runtime.replace(/\d+$/, "");
  const builder = `${images}/${builderStack}/builder/${language}:${i.release.builder}`;
  const runImage = `${images}/${stack}/scratch/${runtime}:${i.release.run}`;
  const stableImage = i.imageUri.replace(/:[^:/]+$/, ":latest");

  // RCS's built-in build env, in RCS's order.
  const builtIns: [string, string][] = [
    ["BUILDER_OUTPUT", "$$BUILDER_OUTPUT"],
    ["GOOGLE_RUNTIME", runtime],
    ["GOOGLE_LABEL_BUILDER_VERSION", i.release.builder],
    ["GOOGLE_LABEL_BUILDER_IMAGE", builder],
    ["GOOGLE_LABEL_RUN_IMAGE", runImage],
    ["GOOGLE_LABEL_SOURCE", `gs://${i.source.bucket}/${i.source.object}#0`],
    ["GOOGLE_RUNTIME_IMAGE_REGION", i.region],
    ["GOOGLE_RUNTIME_VERSION", i.release.version],
    ["X_GOOGLE_SKIP_RUNTIME_LAUNCH", "true"], // RCS leaves this out for go* runtimes.
    ["GOOGLE_BUILD_ENV", "prod"],
    ["GOOGLE_BUILD_UNIVERSE", "gdu"],
    ["GOOGLE_TPC_TARBALL_PROJECT", ""],
    ["GOOGLE_TPC_HOSTNAME", ""],
    ["X_GOOGLE_SET_NODE_HEAP_SIZE", "true"],
    ["GOOGLE_LABEL_BUILD_ID", "$BUILD_ID"],
    ["GOOGLE_LABEL_BASE_IMAGE", `${images}/${stack}/runtimes/${runtime}`],
  ];
  const builtInNames = builtIns.map(([name]) => name);
  // Like RCS, ignore user values for built-in names.
  const userEnv = Object.entries(i.env).filter(([name]) => !builtInNames.includes(name));
  const env = [...builtIns, ...userEnv];

  const secretNames = Object.keys(i.secrets);
  for (const name of secretNames) {
    // Cloud Build silently prefers a plain env var over a secret with the same name.
    if (!/^[A-Z][A-Z0-9_]*$/.test(name) || env.some(([n]) => n === name)) {
      throw new FirebaseError(
        `Invalid build secret name ${name}: use UPPER_SNAKE_CASE and don't reuse a build env var name.`,
      );
    }
  }

  // Like RCS, pass values through substitutions so that Cloud Build doesn't expand "$" in them.
  const stepEnv: string[] = [];
  const substitutions: Record<string, string> = {};
  for (const [name, value] of env) {
    if (name === "BUILDER_OUTPUT") {
      continue; // Cloud Build sets it.
    }
    if (value === "$BUILD_ID") {
      stepEnv.push(`${name}=${value}`);
      continue;
    }
    stepEnv.push(`${name}=\${_${name}}`);
    substitutions[`_${name}`] = value;
  }
  const envVarNames = [...env.map(([name]) => name), ...secretNames].join(",");

  const build: Build = {
    steps: [
      {
        id: "fetch",
        name: `${images}/utilities/gcs-fetcher:base_20260522_18_04_RC00`, // RCS prod's pinned tag.
        args: [
          "--type=ZipArchive",
          `--location=gs://${i.source.bucket}/${i.source.object}`,
          "--dest_dir=/workspace",
          "--timeout_gcs=false",
        ],
      },
      {
        // The shim copies every name in --env_var_names to /platform/env for the buildpacks.
        id: "pre-buildpack",
        name: builder,
        entrypoint: "/bin/shim",
        args: [
          "--phase=pre",
          `--app_image_unique=${i.imageUri}`,
          `--app_image_stable=${stableImage}`,
          `--env_var_names=${envVarNames}`,
          "--experimental_skip_retag_cache",
        ],
        env: stepEnv,
        ...(secretNames.length ? { secretEnv: secretNames } : {}),
      },
      {
        id: "build",
        name: builder,
        entrypoint: "/bin/bash",
        args: [
          "-c",
          `/cnb/lifecycle/creator --tag="$$TAG" "$$IMAGE_URL" && /bin/shim $$SHIM_POST_ARGS`,
        ],
        env: [
          `CNB_RUN_IMAGE=${runImage}`,
          `TAG=${stableImage}`,
          `IMAGE_URL=${i.imageUri}`,
          "SHIM_POST_ARGS=--phase=post --oci_report=/workspace/report.toml --oci_output_dir=/workspace/oci_output/",
        ],
      },
    ],
    artifacts: {
      oci: [{ file: "/workspace/oci_output/", registryPath: i.imageUri, tags: ["latest"] }],
    },
    options: {
      env: [
        "CNB_APP_DIR=/workspace",
        "CNB_ANALYZED_PATH=/layers/analyzed.toml",
        "CNB_BUILDPACKS_DIR=/cnb/buildpacks",
        "CNB_GROUP_PATH=/layers/group.toml",
        "CNB_LAYERS_DIR=/layers",
        "CNB_PLAN_PATH=/layers/plan.toml",
        "CNB_PLATFORM_DIR=/platform",
        "CNB_PLATFORM_API=0.11",
        "CNB_NO_COLOR=true",
        "CNB_USER_ID=33",
        "CNB_GROUP_ID=33",
        "CNB_SKIP_RESTORE=true",
        "CNB_REPORT_PATH=/workspace/report.toml",
      ],
      volumes: [
        { name: "layers", path: "/layers" },
        { name: "platform", path: "/platform" },
      ],
      // Added by Cloud Run's control plane, not RCS.
      logStreamingOption: "STREAM_OFF",
      logging: "CLOUD_LOGGING_ONLY",
    },
    substitutions,
    tags: ["p-run", `r-${runtime}`, `v-${i.release.run}`, `b-${i.release.builder}`],
    // Added by Cloud Run's control plane, not RCS.
    timeout: "1800s",
    queueTtl: "360s",
  };
  if (secretNames.length) {
    build.availableSecrets = {
      secretManager: secretNames.map((name) => ({ versionName: i.secrets[name], env: name })),
    };
  }
  return build;
}

/**
 * Returns the builder and run image releases for a base image: the ones tagged public-image-next
 * in the public serverless-runtimes repos. That's what RCS's prod config pointed at on 2026-10-14.
 */
export async function releaseTags(
  region: string,
  baseImage: string,
): Promise<BuildInput["release"]> {
  const [, , stack, , runtime] = baseImage.split("/");
  const builderStack = stack.endsWith("-full") ? stack : `${stack}-full`;
  const language = runtime.replace(/\d+$/, "");
  const repos = new Client({ urlPrefix: `https://${region}-docker.pkg.dev`, auth: false });
  const builder = await tagNextTo(
    repos,
    `/v2/serverless-runtimes/${builderStack}/builder/${language}`,
    /^[a-z]+_\d{8}[a-z]?_RC\d+$/,
  );
  const run = await tagNextTo(
    repos,
    `/v2/serverless-runtimes/${stack}/scratch/${runtime}`,
    /^[a-z]+\d*_\d{8}[a-z]?_[\d_]+_RC\d+$/,
  );
  // nodejs22_20261005_22_23_3_RC00 -> 22.23.3
  const version = run.split("_").slice(2, -1).join(".");
  return { builder, run, version };
}

async function tagNextTo(repos: Client, repo: string, release: RegExp): Promise<string> {
  const res = await repos.get<{ manifest?: Record<string, { tag?: string[] }> }>(
    `${repo}/tags/list`,
  );
  const manifests = Object.values(res.body.manifest || {});
  const tags = manifests.find((m) => m.tag?.includes("public-image-next"))?.tag || [];
  const tag = tags.find((t) => release.test(t));
  if (!tag) {
    throw new FirebaseError(`No release is tagged public-image-next in ${repo}.`);
  }
  return tag;
}

/**
 * Turns a build env secret reference, written the way apphosting.yaml writes one ("name",
 * "name@3", or "projects/p/secrets/s[/versions/v]"), into a full secret version name.
 */
export function secretVersionName(projectId: string, ref: string): string {
  const full = /^projects\/([^/]+)\/secrets\/([^/]+)(?:\/versions\/(latest|\d+))?$/.exec(ref);
  if (full) {
    return `projects/${full[1]}/secrets/${full[2]}/versions/${full[3] || "latest"}`;
  }
  const short = /^([^/@]+)(?:@(latest|\d+))?$/.exec(ref);
  if (short) {
    return `projects/${projectId}/secrets/${short[1]}/versions/${short[2] || "latest"}`;
  }
  throw new FirebaseError(`Invalid secret reference ${ref}.`);
}
