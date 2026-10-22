import { expect } from "chai";
import { Build } from "../../gcp/cloudbuild";
import nock from "../../test/helpers/nock";
import {
  BuildInput,
  parseBaseImage,
  rcsBuildConfig,
  releaseTags,
  secretVersionName,
} from "./buildConfig";

const IMAGE = "us-central1-docker.pkg.dev/my-project/cloud-run-source-deploy/web:1760000000000";
const STABLE_IMAGE = "us-central1-docker.pkg.dev/my-project/cloud-run-source-deploy/web:latest";
const IMAGES = "us-central1-docker.pkg.dev/serverless-runtimes";
const BUILDER = `${IMAGES}/google-22-full/builder/nodejs:nodejs_20260924a_RC00`;
const RUN_IMAGE = `${IMAGES}/google-22/scratch/nodejs22:nodejs22_20260915_22_23_2_RC00`;
const UNIVERSAL_BUILDER = `${IMAGES}/google-24-full/builder/universal:universal_builder_20260926_RC00`;
const UNIVERSAL_RUN_IMAGE = `${IMAGES}/google-24/run/universal:public-image-next`;

const INPUT: BuildInput = {
  region: "us-central1",
  imageUri: IMAGE,
  source: { bucket: "firebase-run-src-123456789-us-central1", object: "source.zip" },
  baseImage: `${IMAGES}/google-22/runtimes/nodejs22`,
  env: {
    API_URL: "https://api.example.com",
    X_GOOGLE_TARGET_PLATFORM: "fah",
    FIREBASE_OUTPUT_BUNDLE_DIR: "/workspace/.apphosting",
  },
  secrets: { NPM_TOKEN: "projects/my-project/secrets/npm-token/versions/latest" },
  release: {
    builder: "nodejs_20260924a_RC00",
    run: "nodejs22_20260915_22_23_2_RC00",
    version: "22.23.2",
  },
};

const EXPECTED_WITH_BASE_IMAGE: Build = {
  steps: [
    {
      id: "build",
      name: BUILDER,
      entrypoint: "/bin/bash",
      args: [
        "-c",
        '/bin/shim $$SHIM_FETCH_ARGS && /bin/shim $$SHIM_PRE_ARGS && /cnb/lifecycle/creator --tag="$$TAG" "$$IMAGE_URL" && /bin/shim $$SHIM_POST_ARGS',
      ],
      env: [
        `CNB_RUN_IMAGE=${RUN_IMAGE}`,
        `TAG=${STABLE_IMAGE}`,
        `IMAGE_URL=${IMAGE}`,
        "SHIM_FETCH_ARGS=--phase=fetch --type=ZipArchive --location=gs://firebase-run-src-123456789-us-central1/source.zip --dest_dir=/workspace --timeout_gcs=false",
        "GOOGLE_RUNTIME=nodejs22",
        "GOOGLE_LABEL_BUILDER_VERSION=nodejs_20260924a_RC00",
        `GOOGLE_LABEL_BUILDER_IMAGE=${BUILDER}`,
        `GOOGLE_LABEL_RUN_IMAGE=${RUN_IMAGE}`,
        "GOOGLE_LABEL_SOURCE=gs://firebase-run-src-123456789-us-central1/source.zip#0",
        "GOOGLE_USE_SERVERLESS_RUNTIMES_TARBALLS=true",
        "X_GOOGLE_USE_ZSTD_FOR_EXTRACTION=true",
        "GOOGLE_RUNTIME_IMAGE_REGION=us-central1",
        "GOOGLE_RUNTIME_VERSION=22.23.2",
        "X_GOOGLE_SKIP_RUNTIME_LAUNCH=true",
        "GOOGLE_BUILD_ENV=prod",
        "GOOGLE_BUILD_UNIVERSE=gdu",
        "GOOGLE_TPC_TARBALL_PROJECT=",
        "GOOGLE_TPC_HOSTNAME=",
        "X_GOOGLE_SET_NODE_HEAP_SIZE=true",
        "GOOGLE_LABEL_BUILD_ID=$BUILD_ID",
        `GOOGLE_LABEL_BASE_IMAGE=${IMAGES}/google-22/runtimes/nodejs22`,
        "API_URL=https://api.example.com",
        "X_GOOGLE_TARGET_PLATFORM=fah",
        "FIREBASE_OUTPUT_BUNDLE_DIR=/workspace/.apphosting",
        "GOOGLE_BUILD_SECRETS_TO_SCAN=NPM_TOKEN",
        `SHIM_PRE_ARGS=--phase=pre --app_image_unique=${IMAGE} --app_image_stable=${STABLE_IMAGE} ` +
          "--env_var_names=BUILDER_OUTPUT,GOOGLE_RUNTIME,GOOGLE_LABEL_BUILDER_VERSION," +
          "GOOGLE_LABEL_BUILDER_IMAGE,GOOGLE_LABEL_RUN_IMAGE,GOOGLE_LABEL_SOURCE," +
          "GOOGLE_USE_SERVERLESS_RUNTIMES_TARBALLS,X_GOOGLE_USE_ZSTD_FOR_EXTRACTION," +
          "GOOGLE_RUNTIME_IMAGE_REGION,GOOGLE_RUNTIME_VERSION,X_GOOGLE_SKIP_RUNTIME_LAUNCH," +
          "GOOGLE_BUILD_ENV,GOOGLE_BUILD_UNIVERSE,GOOGLE_TPC_TARBALL_PROJECT,GOOGLE_TPC_HOSTNAME," +
          "X_GOOGLE_SET_NODE_HEAP_SIZE,GOOGLE_LABEL_BUILD_ID,GOOGLE_LABEL_BASE_IMAGE,API_URL," +
          "X_GOOGLE_TARGET_PLATFORM,FIREBASE_OUTPUT_BUNDLE_DIR,GOOGLE_BUILD_SECRETS_TO_SCAN,NPM_TOKEN " +
          "--experimental_skip_retag_cache",
        "SHIM_POST_ARGS=--phase=post --oci_report=/workspace/report.toml --oci_output_dir=/workspace/oci_output/",
      ],
      secretEnv: ["NPM_TOKEN"],
    },
  ],
  availableSecrets: {
    secretManager: [
      { versionName: "projects/my-project/secrets/npm-token/versions/latest", env: "NPM_TOKEN" },
    ],
  },
  artifacts: { oci: [{ file: "/workspace/oci_output/", registryPath: IMAGE, tags: ["latest"] }] },
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
    logStreamingOption: "STREAM_OFF",
    logging: "CLOUD_LOGGING_ONLY",
    requestedVerifyOption: "VERIFIED",
  },
  tags: ["p-run", "r-nodejs22", "v-nodejs22_20260915_22_23_2_RC00", "b-nodejs_20260924a_RC00"],
  timeout: "1800s",
  queueTtl: "360s",
};

describe("buildConfig", () => {
  it("parses short runtime names and full base image URIs", () => {
    expect(parseBaseImage("us-central1", "nodejs22")).to.deep.equal({
      stack: "google-22",
      runtime: "nodejs22",
      baseImageUri: `${IMAGES}/google-22/runtimes/nodejs22`,
    });
    expect(parseBaseImage("us-central1", "nodejs24")).to.deep.equal({
      stack: "google-24",
      runtime: "nodejs24",
      baseImageUri: `${IMAGES}/google-24/runtimes/nodejs24`,
    });
    expect(parseBaseImage("us-central1", `${IMAGES}/google-22/runtimes/nodejs20`)).to.deep.equal({
      stack: "google-22",
      runtime: "nodejs20",
      baseImageUri: `${IMAGES}/google-22/runtimes/nodejs20`,
    });
    expect(() => parseBaseImage("us-central1", "not-a-runtime")).to.throw("Invalid base image");
    expect(() => parseBaseImage("us-central1", "foo/bar")).to.throw("Invalid base image");
  });

  it("generates the RCS base-image config for both full URIs and short names", () => {
    expect(rcsBuildConfig(INPUT)).to.deep.equal(EXPECTED_WITH_BASE_IMAGE);
    expect(rcsBuildConfig({ ...INPUT, baseImage: "nodejs22" })).to.deep.equal(
      EXPECTED_WITH_BASE_IMAGE,
    );
  });

  it("omits secret fields when no build secrets are present", () => {
    const withoutSecrets = rcsBuildConfig({ ...INPUT, secrets: {} });
    expect(withoutSecrets.availableSecrets).to.be.undefined;
    expect(withoutSecrets.steps[0].secretEnv).to.be.undefined;
    expect(withoutSecrets.steps[0].env?.join("\n")).not.to.include("NPM_TOKEN");
    expect(withoutSecrets.steps[0].env?.join("\n")).not.to.include("GOOGLE_BUILD_SECRETS_TO_SCAN");
  });

  it("generates the 3-step universal builder config when baseImage is unset", () => {
    const build = rcsBuildConfig({
      ...INPUT,
      baseImage: undefined,
      release: { builder: "universal_builder_20260926_RC00" },
    });

    expect(build.source).to.deep.equal({ storageSource: INPUT.source });
    expect(build.images).to.deep.equal([IMAGE]);
    expect(build.steps.map((s) => s.id)).to.deep.equal([
      "pre-buildpack",
      "build",
      "post-buildpack",
    ]);
    expect(build.steps[0].secretEnv).to.deep.equal(["NPM_TOKEN"]);
    expect(build.steps[1]).to.deep.equal({
      id: "build",
      name: UNIVERSAL_BUILDER,
      entrypoint: "/cnb/lifecycle/creator",
      args: [`--tag=${STABLE_IMAGE}`, IMAGE],
      env: [`CNB_RUN_IMAGE=${UNIVERSAL_RUN_IMAGE}`],
    });
    expect(build.availableSecrets).to.deep.equal(EXPECTED_WITH_BASE_IMAGE.availableSecrets);
    expect(build.tags).to.deep.equal([
      "p-run",
      "r-buildpacks",
      "b-universal_builder_20260926_RC00",
      "bt-LIFECYCLE",
    ]);
  });

  it("ignores user overrides of built-in env vars, escapes '$', and rejects colliding secret names", () => {
    const build = rcsBuildConfig({
      ...INPUT,
      env: { GOOGLE_RUNTIME_VERSION: "18.0.0", PRICE: "$5" },
    });
    expect(build.steps[0].env).to.include("GOOGLE_RUNTIME_VERSION=22.23.2");
    expect(build.steps[0].env).to.include("PRICE=$$5");

    const secrets = { API_URL: "projects/my-project/secrets/api-url/versions/1" };
    expect(() => rcsBuildConfig({ ...INPUT, secrets })).to.throw(
      "Invalid build secret name API_URL",
    );
  });

  it("fetches release tags for base-image and universal builds", async () => {
    const repos = "https://us-central1-docker.pkg.dev";
    nock(repos)
      .get("/v2/serverless-runtimes/google-22-full/builder/nodejs/tags/list")
      .reply(200, {
        manifest: {
          "sha256:1": { tag: ["nodejs_20260924a_RC00", "latest", "public-image-current"] },
        },
      });
    nock(repos)
      .get("/v2/serverless-runtimes/google-22/scratch/nodejs22/tags/list")
      .reply(200, {
        manifest: {
          "sha256:2": { tag: ["nodejs22_20260915_22_23_2_RC00", "public-image-current"] },
        },
      });
    nock(repos)
      .get("/v2/serverless-runtimes/google-24-full/builder/universal/tags/list")
      .reply(200, {
        manifest: {
          "sha256:3": { tag: ["universal_builder_20260926_RC00", "public-image-current"] },
        },
      });

    expect(await releaseTags("us-central1", "nodejs22")).to.deep.equal(INPUT.release);
    expect(await releaseTags("us-central1", undefined)).to.deep.equal({
      builder: "universal_builder_20260926_RC00",
    });
    expect(nock.isDone()).to.be.true;
    nock.cleanAll();
  });

  it("turns secret references into full secret version resource names", () => {
    expect(secretVersionName("my-project", "npm-token")).to.equal(
      "projects/my-project/secrets/npm-token/versions/latest",
    );
    expect(secretVersionName("my-project", "npm-token@3")).to.equal(
      "projects/my-project/secrets/npm-token/versions/3",
    );
    expect(secretVersionName("my-project", "projects/shared/secrets/npm-token")).to.equal(
      "projects/shared/secrets/npm-token/versions/latest",
    );
    expect(() => secretVersionName("my-project", "not/a/secret")).to.throw(
      "Invalid secret reference",
    );
  });
});
