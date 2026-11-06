import { expect } from "chai";
import * as sinon from "sinon";

import { SingleBuildCoordinator, CodebaseBuildConfig } from "./singleBuildCoordinator";
import * as runv2 from "../../../gcp/runv2";
import * as artifactregistry from "../../../gcp/artifactregistry";

describe("SingleBuildCoordinator", () => {
  let coordinator: SingleBuildCoordinator;
  let ensureDockerRepoStub: sinon.SinonStub;
  let submitBuildStub: sinon.SinonStub;

  const PROJECT_ID = "test-project";
  const REGION = "us-central1";
  const CODEBASE = "default";
  const STORAGE_SOURCE: runv2.StorageSource = {
    bucket: "staging.test-project.appspot.com",
    object: "source-archive.zip",
    generation: "1234567890",
  };

  const DEFAULT_CONFIG: CodebaseBuildConfig = {
    projectId: PROJECT_ID,
    region: REGION,
    codebase: CODEBASE,
    storageSource: STORAGE_SOURCE,
    runtime: "nodejs22",
  };

  beforeEach(() => {
    coordinator = new SingleBuildCoordinator();
    ensureDockerRepoStub = sinon.stub(artifactregistry, "ensureDockerRepository").resolves();
    submitBuildStub = sinon.stub(runv2, "submitBuild").resolves();
  });

  afterEach(() => {
    sinon.restore();
  });

  it("submits a single build and returns the constructed imageUri", async () => {
    const imageUri = await coordinator.buildCodebase(DEFAULT_CONFIG);

    expect(ensureDockerRepoStub).to.have.been.calledOnceWith(PROJECT_ID, REGION, "gcf-artifacts");
    expect(submitBuildStub).to.have.been.calledOnce;

    const [calledProject, calledRegion, buildPayload] = submitBuildStub.firstCall.args as [
      string,
      string,
      runv2.Build,
    ];
    expect(calledProject).to.equal(PROJECT_ID);
    expect(calledRegion).to.equal(REGION);
    expect(buildPayload.storageSource).to.deep.equal(STORAGE_SOURCE);
    expect(buildPayload.imageUri).to.equal(imageUri);
    expect(buildPayload.imageUri).to.match(
      new RegExp(`^${REGION}-docker\\.pkg\\.dev/${PROJECT_ID}/gcf-artifacts/${CODEBASE}:\\d+$`),
    );
    expect(buildPayload.buildpackBuild.runtime).to.equal("nodejs22");
    expect(buildPayload.buildpackBuild.environmentVariables).to.deep.equal({
      GOOGLE_FUNCTION_TARGET: "default",
      GOOGLE_FUNCTION_SIGNATURE_TYPE: "http",
    });
  });

  it("deduplicates concurrent build requests for the same codebase and region", async () => {
    // 5 concurrent requests from different endpoints in the same codebase & region
    const promises = [
      coordinator.buildCodebase(DEFAULT_CONFIG),
      coordinator.buildCodebase(DEFAULT_CONFIG),
      coordinator.buildCodebase(DEFAULT_CONFIG),
      coordinator.buildCodebase(DEFAULT_CONFIG),
      coordinator.buildCodebase(DEFAULT_CONFIG),
    ];

    const results = await Promise.all(promises);

    // Cloud Build was submitted only once
    expect(submitBuildStub).to.have.been.calledOnce;
    expect(ensureDockerRepoStub).to.have.been.calledOnce;

    // All endpoints received the exact same imageUri
    const firstImage = results[0];
    for (const image of results) {
      expect(image).to.equal(firstImage);
    }
  });

  it("returns cached imageUri for sequential calls to the same codebase and region", async () => {
    const firstImage = await coordinator.buildCodebase(DEFAULT_CONFIG);
    const secondImage = await coordinator.buildCodebase(DEFAULT_CONFIG);

    expect(submitBuildStub).to.have.been.calledOnce;
    expect(firstImage).to.equal(secondImage);
  });

  it("submits separate builds for different regions", async () => {
    const configUsEast1: CodebaseBuildConfig = {
      ...DEFAULT_CONFIG,
      region: "us-east1",
    };

    const [imageUsCentral, imageUsEast] = await Promise.all([
      coordinator.buildCodebase(DEFAULT_CONFIG),
      coordinator.buildCodebase(configUsEast1),
    ]);

    expect(submitBuildStub).to.have.been.calledTwice;
    expect(imageUsCentral).to.include("us-central1-docker.pkg.dev");
    expect(imageUsEast).to.include("us-east1-docker.pkg.dev");
  });

  it("submits separate builds for different codebases in the same region", async () => {
    const configOtherCodebase: CodebaseBuildConfig = {
      ...DEFAULT_CONFIG,
      codebase: "secondary",
    };

    const [imageDefault, imageSecondary] = await Promise.all([
      coordinator.buildCodebase(DEFAULT_CONFIG),
      coordinator.buildCodebase(configOtherCodebase),
    ]);

    expect(submitBuildStub).to.have.been.calledTwice;
    expect(imageDefault).to.include("/default:");
    expect(imageSecondary).to.include("/secondary:");
  });

  it("clears cache and propagates error when submitBuild fails", async () => {
    const buildError = new Error("Cloud Build quota exceeded");
    submitBuildStub.rejects(buildError);

    // Concurrent callers all receive the rejection
    const p1 = coordinator.buildCodebase(DEFAULT_CONFIG);
    const p2 = coordinator.buildCodebase(DEFAULT_CONFIG);

    await expect(p1).to.be.rejectedWith("Cloud Build quota exceeded");
    await expect(p2).to.be.rejectedWith("Cloud Build quota exceeded");

    // After failure, cache is cleared so a subsequent attempt can re-try
    submitBuildStub.resolves();
    const retryImage = await coordinator.buildCodebase(DEFAULT_CONFIG);
    expect(retryImage).to.be.a("string");
    expect(submitBuildStub).to.have.been.calledTwice;
  });

  it("respects custom repository, baseImage, and environment variables", async () => {
    const customConfig: CodebaseBuildConfig = {
      ...DEFAULT_CONFIG,
      repository: "custom-repo",
      imageName: "custom-image",
      baseImage: "us-docker.pkg.dev/serverless-runtimes/google-22-full/runtimes/nodejs22",
      env: { CUSTOM_VAR: "true" },
    };

    const imageUri = await coordinator.buildCodebase(customConfig);

    expect(ensureDockerRepoStub).to.have.been.calledWith(PROJECT_ID, REGION, "custom-repo");
    const buildPayload = submitBuildStub.firstCall.args[2] as runv2.Build;
    expect(imageUri).to.include("/custom-repo/custom-image:");
    expect(buildPayload.buildpackBuild.baseImage).to.equal(customConfig.baseImage);
    expect(buildPayload.buildpackBuild.enableAutomaticUpdates).to.be.true;
    expect(buildPayload.buildpackBuild.environmentVariables).to.deep.equal({
      CUSTOM_VAR: "true",
      GOOGLE_FUNCTION_TARGET: "default",
      GOOGLE_FUNCTION_SIGNATURE_TYPE: "http",
    });
  });
});
