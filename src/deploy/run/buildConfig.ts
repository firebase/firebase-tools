import { Client } from "../../apiv2";
import { FirebaseError } from "../../error";
import { Build } from "../../gcp/cloudbuild";

/** Runtimes in serverless-runtimes/google-24; earlier runtimes live in google-22. */
const GOOGLE_24_RUNTIMES = new Set(
  "dotnet10,go126,go127,java25,nodejs24,nodejs26,osonly24,python314,python315,ruby35,ruby40,ruby41,static24".split(
    ",",
  ),
);

const BASE_IMAGE_URI_REGEX = /^[^/]+\/serverless-runtimes\/([^/]+)\/runtimes\/([a-z]+\d+)(?::.*)?$/;

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

const postBuildpackScript = (imageUri: string): string =>
  [
    'text="$$(cat /workspace/report.toml)"',
    `app="${imageUri}"`,
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
  ].join("\n");

export interface BuildInput {
  region: string;
  imageUri: string;
  source: { bucket: string; object: string };
  /** Short runtime ID (e.g. "nodejs22") or full serverless-runtimes URI; omit when ABIU is off. */
  baseImage?: string;
  env: Record<string, string>;
  /** Build secrets: env var name -> projects/{p}/secrets/{s}/versions/{v}. */
  secrets: Record<string, string>;
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
  const uriMatch = BASE_IMAGE_URI_REGEX.exec(baseImage);
  const runtime = uriMatch ? uriMatch[2] : baseImage.split(":")[0];
  if (!uriMatch && !/^[a-z]+\d+$/.test(runtime)) {
    throw new FirebaseError(`Invalid base image ${baseImage}.`);
  }
  const stack = uriMatch
    ? uriMatch[1]
    : GOOGLE_24_RUNTIMES.has(runtime)
      ? "google-24"
      : "google-22";
  return {
    stack,
    runtime,
    baseImageUri: `${region}-docker.pkg.dev/serverless-runtimes/${stack}/runtimes/${runtime}`,
  };
}

/**
 * Generates the Cloud Build config that Cloud Run's build backend (RCS) generates for a buildpacks
 * build (both with a base image and without one), plus build secrets.
 */
export function rcsBuildConfig(i: BuildInput): Build {
  const parsed = i.baseImage ? parseBaseImage(i.region, i.baseImage) : undefined;
  const runRelease = i.release.run;
  const runtimeVersion = i.release.version;
  if (parsed && (!runRelease || !runtimeVersion)) {
    throw new FirebaseError(`Missing run image release for base image ${i.baseImage || ""}.`);
  }

  const images = `${i.region}-docker.pkg.dev/serverless-runtimes`;
  const builderStack = parsed
    ? parsed.stack.endsWith("-full")
      ? parsed.stack
      : `${parsed.stack}-full`
    : "google-24-full";
  const language = parsed ? parsed.runtime.replace(/\d+$/, "") : "universal";
  const builder = `${images}/${builderStack}/builder/${language}:${i.release.builder}`;
  const runImage =
    parsed && runRelease
      ? `${images}/${parsed.stack}/scratch/${parsed.runtime}:${runRelease}`
      : `${images}/google-24/run/universal:public-image-next`;
  const stableImage = i.imageUri.replace(/:[^:/]+$/, ":latest");
  const sourceUri = `gs://${i.source.bucket}/${i.source.object}`;

  const builtIns: Record<string, string> = {
    ...(parsed ? { GOOGLE_RUNTIME: parsed.runtime } : {}),
    GOOGLE_LABEL_BUILDER_VERSION: i.release.builder,
    GOOGLE_LABEL_BUILDER_IMAGE: builder,
    GOOGLE_LABEL_RUN_IMAGE: runImage,
    GOOGLE_LABEL_SOURCE: `${sourceUri}#0`,
    GOOGLE_USE_SERVERLESS_RUNTIMES_TARBALLS: "true",
    X_GOOGLE_USE_ZSTD_FOR_EXTRACTION: "true",
    GOOGLE_RUNTIME_IMAGE_REGION: i.region,
    ...(parsed && runtimeVersion
      ? {
          GOOGLE_RUNTIME_VERSION: runtimeVersion,
          X_GOOGLE_SKIP_RUNTIME_LAUNCH: "true",
        }
      : {}),
    GOOGLE_BUILD_ENV: "prod",
    GOOGLE_BUILD_UNIVERSE: "gdu",
    GOOGLE_TPC_TARBALL_PROJECT: "",
    GOOGLE_TPC_HOSTNAME: "",
    X_GOOGLE_SET_NODE_HEAP_SIZE: "true",
    GOOGLE_LABEL_BUILD_ID: "$BUILD_ID",
    GOOGLE_LABEL_BASE_IMAGE: parsed ? parsed.baseImageUri : runImage,
  };

  // Like RCS, ignore user values that collide with built-in env var names.
  const allEnv: Record<string, string> = { ...builtIns };
  for (const [k, v] of Object.entries(i.env)) {
    if (!(k in builtIns)) {
      allEnv[k] = v;
    }
  }

  const secretNames = Object.keys(i.secrets);
  for (const name of secretNames) {
    if (!/^[A-Z][A-Z0-9_]*$/.test(name) || name in allEnv || name === "BUILDER_OUTPUT") {
      throw new FirebaseError(
        `Invalid build secret name ${name}: use UPPER_SNAKE_CASE and don't reuse a build env var name.`,
      );
    }
  }
  // Names only: the google.utils.secret-scan buildpack fails the build if these values are in its output.
  if (secretNames.length) {
    allEnv.GOOGLE_BUILD_SECRETS_TO_SCAN = secretNames.join(",");
  }

  // Escape literal "$" as "$$" so Cloud Build doesn't treat user env values as substitutions.
  const stepEnv = Object.entries(allEnv).map(([k, v]) =>
    v === "$BUILD_ID" ? `${k}=${v}` : `${k}=${v.replace(/\$/g, "$$$$")}`,
  );
  const envVarNames = ["BUILDER_OUTPUT", ...Object.keys(allEnv), ...secretNames].join(",");
  const secretStepField = secretNames.length ? { secretEnv: secretNames } : {};
  const baseOptions = {
    env: [...CNB_OPTIONS_ENV],
    logStreamingOption: "STREAM_OFF",
    logging: "CLOUD_LOGGING_ONLY",
    requestedVerifyOption: "VERIFIED",
  };
  const common = {
    ...(secretNames.length
      ? {
          availableSecrets: {
            secretManager: secretNames.map((name) => ({ versionName: i.secrets[name], env: name })),
          },
        }
      : {}),
    timeout: "1800s",
    queueTtl: "360s",
  };

  if (parsed && runRelease) {
    return {
      ...common,
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
            `SHIM_FETCH_ARGS=--phase=fetch --type=ZipArchive --location=${sourceUri} --dest_dir=/workspace --timeout_gcs=false`,
            ...stepEnv,
            `SHIM_PRE_ARGS=--phase=pre --app_image_unique=${i.imageUri} --app_image_stable=${stableImage} --env_var_names=${envVarNames} --experimental_skip_retag_cache`,
            "SHIM_POST_ARGS=--phase=post --oci_report=/workspace/report.toml --oci_output_dir=/workspace/oci_output/",
          ],
          ...secretStepField,
        },
      ],
      artifacts: {
        oci: [{ file: "/workspace/oci_output/", registryPath: i.imageUri, tags: ["latest"] }],
      },
      options: baseOptions,
      tags: ["p-run", `r-${parsed.runtime}`, `v-${runRelease}`, `b-${i.release.builder}`],
    };
  }

  return {
    ...common,
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
        ...secretStepField,
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
        args: ["-c", postBuildpackScript(i.imageUri)],
      },
    ],
    images: [i.imageUri],
    options: {
      ...baseOptions,
      volumes: [
        { name: "layers", path: "/layers" },
        { name: "platform", path: "/platform" },
      ],
    },
    tags: ["p-run", "r-buildpacks", `b-${i.release.builder}`, "bt-LIFECYCLE"],
  };
}

/** Looks up the current builder and run image release tags in the serverless-runtimes repos. */
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
  const [builder, run] = await Promise.all([
    currentReleaseTag(
      repos,
      `/v2/serverless-runtimes/${builderStack}/builder/${language}`,
      /^[a-z]+_\d{8}[a-z]?_RC\d+$/,
    ),
    currentReleaseTag(
      repos,
      `/v2/serverless-runtimes/${stack}/scratch/${runtime}`,
      /^[a-z]+\d*_\d{8}[a-z]?_[\d_]+_RC\d+$/,
    ),
  ]);
  return { builder, run, version: run.split("_").slice(2, -1).join(".") };
}

async function currentReleaseTag(repos: Client, repo: string, release: RegExp): Promise<string> {
  const res = await repos.get<{ manifest?: Record<string, { tag?: string[] }> }>(
    `${repo}/tags/list`,
  );
  const manifests = Object.values(res.body.manifest || {});
  const tags =
    manifests.find((m) => m.tag?.includes("public-image-current"))?.tag ||
    manifests.find((m) => m.tag?.includes("public-image-next"))?.tag ||
    [];
  const tag = tags.find((t) => release.test(t));
  if (!tag) {
    throw new FirebaseError(`No release is tagged public-image-current in ${repo}.`);
  }
  return tag;
}

/** Converts a secret ref ("name", "name@3", or "projects/p/secrets/s[/versions/v]") to a full version resource name. */
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
