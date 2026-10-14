import { Client } from "../../apiv2";
import { FirebaseError } from "../../error";
import { Build } from "../../gcp/cloudbuild";

/** Runtimes in serverless-runtimes/google-24; earlier runtimes live in google-22. */
const GOOGLE_24_RUNTIMES = new Set([
  "dotnet10",
  "go126",
  "go127",
  "java25",
  "nodejs24",
  "nodejs26",
  "osonly24",
  "python314",
  "python315",
  "ruby35",
  "ruby40",
  "ruby41",
  "static24",
]);

const CNB_OPTIONS_ENV = [
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
];

/**
 * Prototype: generates the Cloud Build config that Cloud Run's build backend (RCS) generates for a
 * buildpacks build (both with a base image and without one), plus build secrets, which Cloud Run's
 * build API can't take.
 *
 * Build env vars and secrets reach the buildpacks the same way as on App Hosting, through
 * /platform/env: Cloud Build puts each secret in the env of the step running /bin/shim --phase=pre,
 * and the shim writes every name in --env_var_names to /platform/env/<NAME>.
 */
export interface BuildInput {
  region: string;
  /** Where the built image goes, e.g. .../cloud-run-source-deploy/{serviceId}:{timestamp}. */
  imageUri: string;
  /** The uploaded source zip. */
  source: { bucket: string; object: string };
  /**
   * Short runtime ID (e.g. "nodejs22") or full URI
   * ({region}-docker.pkg.dev/serverless-runtimes/{stack}/runtimes/{runtime}).
   * Omit when the service has no base image (automatic base image updates off).
   */
  baseImage?: string;
  /** Plain build env vars. */
  env: Record<string, string>;
  /** Build secrets: env var name -> projects/{p}/secrets/{s}/versions/{v}. */
  secrets: Record<string, string>;
  /** Builder and run image releases, from releaseTags(). */
  release: { builder: string; run?: string; version?: string };
}

/**
 * Parses a short runtime name (e.g. "nodejs22") or a full base image URI into its stack, runtime,
 * and canonical Artifact Registry URI.
 */
export function parseBaseImage(
  region: string,
  baseImage: string,
): { stack: string; runtime: string; baseImageUri: string } {
  if (!baseImage.includes("/")) {
    const runtime = baseImage.split(":")[0];
    if (!/^[a-z]+\d+$/.test(runtime)) {
      throw new FirebaseError(`Invalid base image ${baseImage}.`);
    }
    const stack = GOOGLE_24_RUNTIMES.has(runtime) ? "google-24" : "google-22";
    return {
      stack,
      runtime,
      baseImageUri: `${region}-docker.pkg.dev/serverless-runtimes/${stack}/runtimes/${runtime}`,
    };
  }
  const parts = baseImage.split("/");
  if (
    parts.length !== 5 ||
    parts[1] !== "serverless-runtimes" ||
    parts[3] !== "runtimes" ||
    !parts[2] ||
    !parts[4]
  ) {
    throw new FirebaseError(`Invalid base image ${baseImage}.`);
  }
  const stack = parts[2];
  const runtime = parts[4].split(":")[0];
  return {
    stack,
    runtime,
    baseImageUri: `${region}-docker.pkg.dev/serverless-runtimes/${stack}/runtimes/${runtime}`,
  };
}

/** Returns the Cloud Build config that RCS generates for a Cloud Run buildpacks build, plus secrets. */
export function rcsBuildConfig(i: BuildInput): Build {
  if (!i.baseImage) {
    return universalBuildConfig(i);
  }
  const { stack, runtime, baseImageUri } = parseBaseImage(i.region, i.baseImage);
  if (!i.release.run || !i.release.version) {
    throw new FirebaseError(`Missing run image release for base image ${i.baseImage}.`);
  }
  const images = `${i.region}-docker.pkg.dev/serverless-runtimes`;
  const builderStack = stack.endsWith("-full") ? stack : `${stack}-full`;
  const language = runtime.replace(/\d+$/, "");
  const builder = `${images}/${builderStack}/builder/${language}:${i.release.builder}`;
  const runImage = `${images}/${stack}/scratch/${runtime}:${i.release.run}`;
  const stableImage = i.imageUri.replace(/:[^:/]+$/, ":latest");

  // RCS's built-in build env for base-image builds, in RCS's order.
  const builtIns: [string, string][] = [
    ["BUILDER_OUTPUT", "$$BUILDER_OUTPUT"],
    ["GOOGLE_RUNTIME", runtime],
    ["GOOGLE_LABEL_BUILDER_VERSION", i.release.builder],
    ["GOOGLE_LABEL_BUILDER_IMAGE", builder],
    ["GOOGLE_LABEL_RUN_IMAGE", runImage],
    ["GOOGLE_LABEL_SOURCE", `gs://${i.source.bucket}/${i.source.object}#0`],
    ["GOOGLE_USE_SERVERLESS_RUNTIMES_TARBALLS", "true"],
    ["X_GOOGLE_USE_ZSTD_FOR_EXTRACTION", "true"],
    ["GOOGLE_RUNTIME_IMAGE_REGION", i.region],
    ["GOOGLE_RUNTIME_VERSION", i.release.version],
    ["X_GOOGLE_SKIP_RUNTIME_LAUNCH", "true"], // RCS leaves this out for go* runtimes.
    ["GOOGLE_BUILD_ENV", "prod"],
    ["GOOGLE_BUILD_UNIVERSE", "gdu"],
    ["GOOGLE_TPC_TARBALL_PROJECT", ""],
    ["GOOGLE_TPC_HOSTNAME", ""],
    ["X_GOOGLE_SET_NODE_HEAP_SIZE", "true"],
    ["GOOGLE_LABEL_BUILD_ID", "$BUILD_ID"],
    ["GOOGLE_LABEL_BASE_IMAGE", baseImageUri],
  ];
  const { stepEnv, substitutions, envVarNames, secretNames } = prepareEnvAndSecrets(
    builtIns,
    i.env,
    i.secrets,
  );

  const build: Build = {
    steps: [
      {
        id: "build",
        name: builder,
        entrypoint: "/bin/bash",
        args: [
          "-c",
          '/bin/shim $$SHIM_FETCH_ARGS && /bin/shim $$SHIM_PRE_ARGS && /cnb/lifecycle/creator --tag="$$TAG" "$$IMAGE_URL" && /bin/shim $$SHIM_POST_ARGS',
        ],
        env: [
          `CNB_RUN_IMAGE=${runImage}`,
          `TAG=${stableImage}`,
          `IMAGE_URL=${i.imageUri}`,
          `SHIM_FETCH_ARGS=--phase=fetch --type=ZipArchive --location=gs://${i.source.bucket}/${i.source.object} --dest_dir=/workspace --timeout_gcs=false`,
          ...stepEnv,
          `SHIM_PRE_ARGS=--phase=pre --app_image_unique=${i.imageUri} --app_image_stable=${stableImage} --env_var_names=${envVarNames} --experimental_skip_retag_cache`,
          "SHIM_POST_ARGS=--phase=post --oci_report=/workspace/report.toml --oci_output_dir=/workspace/oci_output/",
        ],
        ...(secretNames.length ? { secretEnv: secretNames } : {}),
      },
    ],
    artifacts: {
      oci: [{ file: "/workspace/oci_output/", registryPath: i.imageUri, tags: ["latest"] }],
    },
    options: {
      env: [...CNB_OPTIONS_ENV],
      logStreamingOption: "STREAM_OFF",
      logging: "CLOUD_LOGGING_ONLY",
      requestedVerifyOption: "VERIFIED",
    },
    substitutions,
    tags: ["p-run", `r-${runtime}`, `v-${i.release.run}`, `b-${i.release.builder}`],
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
 * Returns the Cloud Build config that RCS generates when a service has no base image (universal
 * builder, automatic base image updates off), plus build secrets.
 */
function universalBuildConfig(i: BuildInput): Build {
  const images = `${i.region}-docker.pkg.dev/serverless-runtimes`;
  const builder = `${images}/google-24-full/builder/universal:${i.release.builder}`;
  const runImage = `${images}/google-24/run/universal:public-image-next`;
  const stableImage = i.imageUri.replace(/:[^:/]+$/, ":latest");

  const builtIns: [string, string][] = [
    ["BUILDER_OUTPUT", "$$BUILDER_OUTPUT"],
    ["GOOGLE_LABEL_BUILDER_VERSION", i.release.builder],
    ["GOOGLE_LABEL_BUILDER_IMAGE", builder],
    ["GOOGLE_LABEL_RUN_IMAGE", runImage],
    ["GOOGLE_LABEL_SOURCE", `gs://${i.source.bucket}/${i.source.object}#0`],
    ["GOOGLE_USE_SERVERLESS_RUNTIMES_TARBALLS", "true"],
    ["X_GOOGLE_USE_ZSTD_FOR_EXTRACTION", "true"],
    ["GOOGLE_RUNTIME_IMAGE_REGION", i.region],
    ["GOOGLE_BUILD_ENV", "prod"],
    ["GOOGLE_BUILD_UNIVERSE", "gdu"],
    ["GOOGLE_TPC_TARBALL_PROJECT", ""],
    ["GOOGLE_TPC_HOSTNAME", ""],
    ["X_GOOGLE_SET_NODE_HEAP_SIZE", "true"],
    ["GOOGLE_LABEL_BUILD_ID", "$BUILD_ID"],
    ["GOOGLE_LABEL_BASE_IMAGE", runImage],
  ];
  const { stepEnv, substitutions, envVarNames, secretNames } = prepareEnvAndSecrets(
    builtIns,
    i.env,
    i.secrets,
  );

  const build: Build = {
    source: { storageSource: { bucket: i.source.bucket, object: i.source.object } },
    steps: [
      {
        id: "pre-buildpack",
        name: `${images}/utilities/buildpack-shim:base_20260522_18_04_RC00`,
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
        entrypoint: "/cnb/lifecycle/creator",
        args: [`--tag=${stableImage}`, i.imageUri],
        env: [`CNB_RUN_IMAGE=${runImage}`],
      },
      {
        id: "post-buildpack",
        name: "gcr.io/cloud-builders/docker",
        entrypoint: "bash",
        args: [
          "-c",
          [
            'text="$$(cat /workspace/report.toml)"',
            `app="${i.imageUri}"`,
            'regex="digest\\s*=\\s*\\"([^\\"]+)\\""',
            'if [[ "$$text" =~ $$regex ]]',
            "then",
            '\tdigest="@$${BASH_REMATCH[1]}"',
            '\tdigestImage="$${app/:latest/$$digest}"',
            "\tdocker pull $$digestImage",
            "\tdocker tag $$digestImage $$app",
            "else",
            '\techo "failed to detect image digest"',
            "\texit 1",
            "fi",
          ].join("\n"),
        ],
      },
    ],
    images: [i.imageUri],
    options: {
      env: [...CNB_OPTIONS_ENV],
      volumes: [
        { name: "layers", path: "/layers" },
        { name: "platform", path: "/platform" },
      ],
      logStreamingOption: "STREAM_OFF",
      logging: "CLOUD_LOGGING_ONLY",
      requestedVerifyOption: "VERIFIED",
    },
    substitutions,
    tags: ["p-run", "r-buildpacks", `b-${i.release.builder}`, "bt-LIFECYCLE"],
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

function prepareEnvAndSecrets(
  builtIns: [string, string][],
  userEnvMap: Record<string, string>,
  secrets: Record<string, string>,
): {
  stepEnv: string[];
  substitutions: Record<string, string>;
  envVarNames: string;
  secretNames: string[];
} {
  const builtInNames = builtIns.map(([name]) => name);
  // Like RCS, ignore user values for built-in names.
  const userEnv = Object.entries(userEnvMap).filter(([name]) => !builtInNames.includes(name));
  const env = [...builtIns, ...userEnv];

  const secretNames = Object.keys(secrets);
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
  return { stepEnv, substitutions, envVarNames, secretNames };
}

/**
 * Returns the builder and run image releases that RCS uses: the ones tagged public-image-current
 * (or public-image-next if public-image-current is absent) in the public serverless-runtimes repos.
 */
export async function releaseTags(
  region: string,
  baseImage?: string,
): Promise<BuildInput["release"]> {
  const repos = new Client({ urlPrefix: `https://${region}-docker.pkg.dev`, auth: false });
  if (!baseImage) {
    const builder = await currentReleaseTag(
      repos,
      "/v2/serverless-runtimes/google-24-full/builder/universal",
      /^universal_builder_\d{8}[a-z]?_RC\d+$/,
    );
    return { builder };
  }
  const { stack, runtime } = parseBaseImage(region, baseImage);
  const builderStack = stack.endsWith("-full") ? stack : `${stack}-full`;
  const language = runtime.replace(/\d+$/, "");
  const builder = await currentReleaseTag(
    repos,
    `/v2/serverless-runtimes/${builderStack}/builder/${language}`,
    /^[a-z]+_\d{8}[a-z]?_RC\d+$/,
  );
  const run = await currentReleaseTag(
    repos,
    `/v2/serverless-runtimes/${stack}/scratch/${runtime}`,
    /^[a-z]+\d*_\d{8}[a-z]?_[\d_]+_RC\d+$/,
  );
  // nodejs22_20260915_22_23_2_RC00 -> 22.23.2
  const version = run.split("_").slice(2, -1).join(".");
  return { builder, run, version };
}

async function currentReleaseTag(repos: Client, repo: string, release: RegExp): Promise<string> {
  const res = await repos.get<{ manifest?: Record<string, { tag?: string[] }> }>(
    `${repo}/tags/list`,
  );
  const manifests = Object.values(res.body.manifest || {});
  const current = manifests.find((m) => m.tag?.includes("public-image-current"))?.tag;
  const next = manifests.find((m) => m.tag?.includes("public-image-next"))?.tag;
  const tags = current || next || [];
  const tag = tags.find((t) => release.test(t));
  if (!tag) {
    throw new FirebaseError(`No release is tagged public-image-current in ${repo}.`);
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
