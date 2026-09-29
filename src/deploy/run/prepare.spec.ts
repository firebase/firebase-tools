import { expect } from "chai";
import * as sinon from "sinon";
import * as runv2 from "../../gcp/runv2";
import { Options } from "../../options";
import { Context, Payload } from "./args";
import { BUILD_ENV_ANNOTATION } from "./buildEnv";
import { prepare } from "./prepare";
import * as prereqs from "./prereqs";

describe("run prepare", () => {
  const nodejs22 = "us-central1-docker.pkg.dev/serverless-runtimes/google-22/runtimes/nodejs22";
  const existing = {
    name: "projects/p/locations/us-central1/services/s",
    template: { containers: [{ name: "s", image: "i", baseImageUri: nodejs22 }] },
  } as unknown as runv2.Service;
  let prereqsStub: sinon.SinonStub;
  let getServiceStub: sinon.SinonStub;

  const options = (run: Record<string, unknown>): Options =>
    ({
      config: { src: { run: { serviceId: "s", region: "us-central1", ...run } }, projectDir: "/p" },
    }) as unknown as Options;

  async function prepareOne(run: Record<string, unknown> = {}, context: Partial<Context> = {}) {
    const payload: Payload = {};
    await prepare({ projectId: "p", ...context }, options(run), payload);
    return payload.run!.services[0];
  }

  beforeEach(() => {
    prereqsStub = sinon.stub(prereqs, "prereqs").resolves();
    getServiceStub = sinon.stub(runv2, "getService").rejects({ status: 404 });
  });

  afterEach(() => sinon.restore());

  it("does nothing if no services are being deployed", async () => {
    const payload: Payload = {};
    await prepare({ projectId: "p" }, { config: { src: {} } } as unknown as Options, payload);
    expect(prereqsStub).not.to.have.been.called;
    expect(payload.run).to.be.undefined;
  });

  it("requires a region", async () => {
    await expect(prepareOne({ region: undefined })).to.be.rejectedWith(
      "Cloud Run service s is missing a region in firebase.json.",
    );
  });

  it("reads the service", async () => {
    const svc = await prepareOne();
    expect(prereqsStub).to.have.been.calledWith("p");
    expect(getServiceStub).to.have.been.calledWith("p", "us-central1", "s");
    expect(svc.existing).to.be.undefined;
    expect(svc.baseImage).to.be.undefined;
  });

  it("reuses the service's current base image", async () => {
    getServiceStub.resolves(existing);
    const svc = await prepareOne();
    expect(svc.existing).to.equal(existing);
    expect(svc.baseImage).to.equal(nodejs22);
  });

  it("lets the context set or clear the base image", async () => {
    getServiceStub.resolves(existing);
    expect((await prepareOne({}, { baseImage: "nodejs20" })).baseImage).to.equal("nodejs20");
    expect((await prepareOne({}, { baseImage: null })).baseImage).to.be.undefined;
  });

  it("requires a base image for local builds", async () => {
    getServiceStub.resolves({ ...existing, template: { containers: [{ name: "s", image: "i" }] } });
    await expect(prepareOne({ localBuild: true })).to.be.rejectedWith(
      "Local builds require a base image",
    );
  });

  it("points new local build services to init, which sets a base image", async () => {
    await expect(prepareOne({ localBuild: true })).to.be.rejectedWith(
      /doesn't exist in us-central1 yet.*which also sets the base image/,
    );
  });

  it("doesn't build locally", async () => {
    getServiceStub.resolves(existing);
    const svc = await prepareOne({ localBuild: true });
    expect(svc.baseImage).to.equal(nodejs22);
    expect(svc).not.to.have.property("localBuild");
  });

  describe("build env", () => {
    const withBuildEnv = (env: Record<string, unknown>): runv2.Service =>
      ({
        ...existing,
        annotations: { [BUILD_ENV_ANNOTATION]: JSON.stringify(env) },
      }) as unknown as runv2.Service;

    it("passes plain build env to Cloud Build", async () => {
      getServiceStub.resolves(withBuildEnv({ A: "1" }));
      expect((await prepareOne()).buildEnv).to.deep.equal({ A: "1" });
    });

    it("leaves build env unset without the annotation", async () => {
      getServiceStub.resolves(existing);
      expect(await prepareOne()).not.to.have.property("buildEnv");
    });

    it("rejects build secrets on Cloud Build", async () => {
      getServiceStub.resolves(withBuildEnv({ A: "1", TOKEN: { secret: "t" } }));
      await expect(prepareOne()).to.be.rejectedWith(
        /Service s has build secrets \(TOKEN\).*"localBuild": true/,
      );
    });

    it("keeps build secrets for local builds", async () => {
      getServiceStub.resolves(withBuildEnv({ A: "1", TOKEN: { secret: "t", version: "2" } }));
      const svc = await prepareOne({ localBuild: true });
      expect(svc.buildEnv).to.deep.equal({ A: "1", TOKEN: { secret: "t", version: "2" } });
    });
  });
});
