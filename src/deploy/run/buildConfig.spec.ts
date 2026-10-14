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

// What RCS generates in prod for INPUT (with a base image), plus build secrets.
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
        "GOOGLE_RUNTIME=${_GOOGLE_RUNTIME}",
        "GOOGLE_LABEL_BUILDER_VERSION=${_GOOGLE_LABEL_BUILDER_VERSION}",
        "GOOGLE_LABEL_BUILDER_IMAGE=${_GOOGLE_LABEL_BUILDER_IMAGE}",
        "GOOGLE_LABEL_RUN_IMAGE=${_GOOGLE_LABEL_RUN_IMAGE}",
        "GOOGLE_LABEL_SOURCE=${_GOOGLE_LABEL_SOURCE}",
        "GOOGLE_USE_SERVERLESS_RUNTIMES_TARBALLS=${_GOOGLE_USE_SERVERLESS_RUNTIMES_TARBALLS}",
        "X_GOOGLE_USE_ZSTD_FOR_EXTRACTION=${_X_GOOGLE_USE_ZSTD_FOR_EXTRACTION}",
        "GOOGLE_RUNTIME_IMAGE_REGION=${_GOOGLE_RUNTIME_IMAGE_REGION}",
        "GOOGLE_RUNTIME_VERSION=${_GOOGLE_RUNTIME_VERSION}",
        "X_GOOGLE_SKIP_RUNTIME_LAUNCH=${_X_GOOGLE_SKIP_RUNTIME_LAUNCH}",
        "GOOGLE_BUILD_ENV=${_GOOGLE_BUILD_ENV}",
        "GOOGLE_BUILD_UNIVERSE=${_GOOGLE_BUILD_UNIVERSE}",
        "GOOGLE_TPC_TARBALL_PROJECT=${_GOOGLE_TPC_TARBALL_PROJECT}",
        "GOOGLE_TPC_HOSTNAME=${_GOOGLE_TPC_HOSTNAME}",
        "X_GOOGLE_SET_NODE_HEAP_SIZE=${_X_GOOGLE_SET_NODE_HEAP_SIZE}",
        "GOOGLE_LABEL_BUILD_ID=$BUILD_ID",
        "GOOGLE_LABEL_BASE_IMAGE=${_GOOGLE_LABEL_BASE_IMAGE}",
        "API_URL=${_API_URL}",
        "X_GOOGLE_TARGET_PLATFORM=${_X_GOOGLE_TARGET_PLATFORM}",
        "FIREBASE_OUTPUT_BUNDLE_DIR=${_FIREBASE_OUTPUT_BUNDLE_DIR}",
        `SHIM_PRE_ARGS=--phase=pre --app_image_unique=${IMAGE} --app_image_stable=${STABLE_IMAGE} ` +
          "--env_var_names=BUILDER_OUTPUT,GOOGLE_RUNTIME,GOOGLE_LABEL_BUILDER_VERSION," +
          "GOOGLE_LABEL_BUILDER_IMAGE,GOOGLE_LABEL_RUN_IMAGE,GOOGLE_LABEL_SOURCE," +
          "GOOGLE_USE_SERVERLESS_RUNTIMES_TARBALLS,X_GOOGLE_USE_ZSTD_FOR_EXTRACTION," +
          "GOOGLE_RUNTIME_IMAGE_REGION,GOOGLE_RUNTIME_VERSION,X_GOOGLE_SKIP_RUNTIME_LAUNCH," +
          "GOOGLE_BUILD_ENV,GOOGLE_BUILD_UNIVERSE,GOOGLE_TPC_TARBALL_PROJECT,GOOGLE_TPC_HOSTNAME," +
          "X_GOOGLE_SET_NODE_HEAP_SIZE,GOOGLE_LABEL_BUILD_ID,GOOGLE_LABEL_BASE_IMAGE,API_URL," +
          "X_GOOGLE_TARGET_PLATFORM,FIREBASE_OUTPUT_BUNDLE_DIR,NPM_TOKEN " +
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
  substitutions: {
    _GOOGLE_RUNTIME: "nodejs22",
    _GOOGLE_LABEL_BUILDER_VERSION: "nodejs_20260924a_RC00",
    _GOOGLE_LABEL_BUILDER_IMAGE: BUILDER,
    _GOOGLE_LABEL_RUN_IMAGE: RUN_IMAGE,
    _GOOGLE_LABEL_SOURCE: "gs://firebase-run-src-123456789-us-central1/source.zip#0",
    _GOOGLE_USE_SERVERLESS_RUNTIMES_TARBALLS: "true",
    _X_GOOGLE_USE_ZSTD_FOR_EXTRACTION: "true",
    _GOOGLE_RUNTIME_IMAGE_REGION: "us-central1",
    _GOOGLE_RUNTIME_VERSION: "22.23.2",
    _X_GOOGLE_SKIP_RUNTIME_LAUNCH: "true",
    _GOOGLE_BUILD_ENV: "prod",
    _GOOGLE_BUILD_UNIVERSE: "gdu",
    _GOOGLE_TPC_TARBALL_PROJECT: "",
    _GOOGLE_TPC_HOSTNAME: "",
    _X_GOOGLE_SET_NODE_HEAP_SIZE: "true",
    _GOOGLE_LABEL_BASE_IMAGE: `${IMAGES}/google-22/runtimes/nodejs22`,
    _API_URL: "https://api.example.com",
    _X_GOOGLE_TARGET_PLATFORM: "fah",
    _FIREBASE_OUTPUT_BUNDLE_DIR: "/workspace/.apphosting",
  },
  tags: ["p-run", "r-nodejs22", "v-nodejs22_20260915_22_23_2_RC00", "b-nodejs_20260924a_RC00"],
  timeout: "1800s",
  queueTtl: "360s",
};

describe("buildConfig", () => {
  describe("parseBaseImage", () => {
    it("resolves short runtime names to their stack and full URI", () => {
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
    });

    it("parses full Artifact Registry base image URIs", () => {
      expect(parseBaseImage("us-central1", `${IMAGES}/google-22/runtimes/nodejs20`)).to.deep.equal({
        stack: "google-22",
        runtime: "nodejs20",
        baseImageUri: `${IMAGES}/google-22/runtimes/nodejs20`,
      });
    });

    it("rejects malformed base image strings", () => {
      expect(() => parseBaseImage("us-central1", "not-a-runtime")).to.throw("Invalid base image");
      expect(() => parseBaseImage("us-central1", "foo/bar")).to.throw("Invalid base image");
    });
  });

  describe("rcsBuildConfig", () => {
    it("generates the config RCS generates for a service with a base image, plus build secrets", () => {
      expect(rcsBuildConfig(INPUT)).to.deep.equal(EXPECTED_WITH_BASE_IMAGE);
    });

    it("accepts a short base image name like nodejs22 and produces the exact same config", () => {
      expect(rcsBuildConfig({ ...INPUT, baseImage: "nodejs22" })).to.deep.equal(
        EXPECTED_WITH_BASE_IMAGE,
      );
    });

    it("only adds availableSecrets, secretEnv, and the secret names for build secrets", () => {
      const withoutSecrets = rcsBuildConfig({ ...INPUT, secrets: {} });

      const expected = JSON.parse(JSON.stringify(EXPECTED_WITH_BASE_IMAGE)) as Build;
      delete expected.availableSecrets;
      const step = expected.steps[0];
      delete step.secretEnv;
      step.env = step.env?.map((e) => e.replace(",NPM_TOKEN", ""));
      expect(withoutSecrets).to.deep.equal(expected);
    });

    it("generates the universal builder config when the service has no base image, including secrets", () => {
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
      expect(build.steps[0].name).to.equal(
        `${IMAGES}/utilities/buildpack-shim:base_20260522_18_04_RC00`,
      );
      expect(build.steps[0].secretEnv).to.deep.equal(["NPM_TOKEN"]);
      expect(build.steps[0].args).to.include(
        "--env_var_names=BUILDER_OUTPUT,GOOGLE_LABEL_BUILDER_VERSION,GOOGLE_LABEL_BUILDER_IMAGE," +
          "GOOGLE_LABEL_RUN_IMAGE,GOOGLE_LABEL_SOURCE,GOOGLE_USE_SERVERLESS_RUNTIMES_TARBALLS," +
          "X_GOOGLE_USE_ZSTD_FOR_EXTRACTION,GOOGLE_RUNTIME_IMAGE_REGION,GOOGLE_BUILD_ENV," +
          "GOOGLE_BUILD_UNIVERSE,GOOGLE_TPC_TARBALL_PROJECT,GOOGLE_TPC_HOSTNAME," +
          "X_GOOGLE_SET_NODE_HEAP_SIZE,GOOGLE_LABEL_BUILD_ID,GOOGLE_LABEL_BASE_IMAGE,API_URL," +
          "X_GOOGLE_TARGET_PLATFORM,FIREBASE_OUTPUT_BUNDLE_DIR,NPM_TOKEN",
      );
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

    it("ignores user values for RCS's built-in env vars, like RCS", () => {
      const build = rcsBuildConfig({ ...INPUT, env: { GOOGLE_RUNTIME_VERSION: "18.0.0" } });

      expect(build.substitutions?._GOOGLE_RUNTIME_VERSION).to.equal("22.23.2");
    });

    it("rejects a secret that reuses a build env var name", () => {
      const secrets = { API_URL: "projects/my-project/secrets/api-url/versions/1" };

      expect(() => rcsBuildConfig({ ...INPUT, secrets })).to.throw(
        "Invalid build secret name API_URL",
      );
    });
  });

  describe("releaseTags", () => {
    const REPOS = "https://us-central1-docker.pkg.dev";

    afterEach(() => nock.cleanAll());

    it("returns the releases tagged public-image-current for a base image (short or full)", async () => {
      nock(REPOS)
        .get("/v2/serverless-runtimes/google-22-full/builder/nodejs/tags/list")
        .reply(200, {
          manifest: {
            "sha256:1": { tag: ["nodejs_20260924a_RC00", "latest", "public-image-current"] },
            "sha256:2": { tag: ["nodejs_20261008_RC00", "public-image-next"] },
          },
        });
      nock(REPOS)
        .get("/v2/serverless-runtimes/google-22/scratch/nodejs22/tags/list")
        .reply(200, {
          manifest: {
            "sha256:4": {
              tag: ["latest", "nodejs22_20260915_22_23_2_RC00", "public-image-current"],
            },
            "sha256:5": { tag: ["public-image-next", "nodejs22_20261005_22_23_3_RC00"] },
          },
        });

      expect(await releaseTags("us-central1", "nodejs22")).to.deep.equal(INPUT.release);
      expect(nock.isDone()).to.be.true;
    });

    it("returns the universal builder release when baseImage is undefined", async () => {
      nock(REPOS)
        .get("/v2/serverless-runtimes/google-24-full/builder/universal/tags/list")
        .reply(200, {
          manifest: {
            "sha256:1": {
              tag: ["latest", "public-image-current", "universal_builder_20260926_RC00"],
            },
            "sha256:2": { tag: ["public-image-next", "universal_builder_20261004_RC00"] },
          },
        });

      expect(await releaseTags("us-central1", undefined)).to.deep.equal({
        builder: "universal_builder_20260926_RC00",
      });
      expect(nock.isDone()).to.be.true;
    });
  });

  describe("secretVersionName", () => {
    it("turns build env secret references into secret version names", () => {
      expect(secretVersionName("my-project", "npm-token")).to.equal(
        "projects/my-project/secrets/npm-token/versions/latest",
      );
      expect(secretVersionName("my-project", "npm-token@3")).to.equal(
        "projects/my-project/secrets/npm-token/versions/3",
      );
      expect(secretVersionName("my-project", "projects/shared/secrets/npm-token")).to.equal(
        "projects/shared/secrets/npm-token/versions/latest",
      );
      expect(
        secretVersionName("my-project", "projects/shared/secrets/npm-token/versions/7"),
      ).to.equal("projects/shared/secrets/npm-token/versions/7");
      expect(() => secretVersionName("my-project", "not/a/secret")).to.throw(
        "Invalid secret reference",
      );
    });
  });
});
