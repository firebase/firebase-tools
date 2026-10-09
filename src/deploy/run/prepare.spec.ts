import { expect } from "chai";
import * as sinon from "sinon";
import * as runv2 from "../../gcp/runv2";
import { Options } from "../../options";
import { Context, Payload, ServiceDeploy } from "./args";
import { BUILD_ENV_ANNOTATION } from "./buildEnv";
import { prepare } from "./prepare";
import * as prereqs from "./prereqs";

describe("run prepare", () => {
  const nodejs22 = "us-central1-docker.pkg.dev/serverless-runtimes/google-22/runtimes/nodejs22";
  const web = { serviceId: "web", region: "us-central1" };
  const localWeb = { ...web, localBuild: true };
  const liveWeb = {
    name: "projects/my-project/locations/us-central1/services/web",
    template: { containers: [{ name: "web", image: "old-image", baseImageUri: nodejs22 }] },
  } as unknown as runv2.Service;
  let prereqsStub: sinon.SinonStub;
  let getServiceStub: sinon.SinonStub;

  /** Runs prepare on a firebase.json "run" config and returns the services it will deploy. */
  async function prepareRun(
    run: unknown,
    { context = {}, only }: { context?: Partial<Context>; only?: string } = {},
  ): Promise<ServiceDeploy[]> {
    const options = {
      config: { src: { run }, projectDir: "/project" },
      only,
    } as unknown as Options;
    const payload: Payload = {};
    await prepare({ projectId: "my-project", ...context }, options, payload);
    return payload.run?.services ?? [];
  }

  beforeEach(() => {
    prereqsStub = sinon.stub(prereqs, "prereqs").resolves();
    getServiceStub = sinon.stub(runv2, "getService").rejects({ status: 404 });
  });

  afterEach(() => sinon.restore());

  it("does nothing if firebase.json has no Cloud Run services", async () => {
    expect(await prepareRun(undefined)).to.deep.equal([]);
    expect(prereqsStub).not.to.have.been.called;
  });

  it("checks the APIs and finds that a new service doesn't exist yet", async () => {
    expect(await prepareRun(web)).to.deep.equal([
      { config: web, existing: undefined, baseImage: undefined },
    ]);
    expect(prereqsStub).to.have.been.calledWith("my-project");
    expect(getServiceStub).to.have.been.calledWith("my-project", "us-central1", "web");
  });

  it("reuses an existing service's base image", async () => {
    getServiceStub.resolves(liveWeb);
    expect(await prepareRun(web)).to.deep.equal([
      { config: web, existing: liveWeb, baseImage: nodejs22 },
    ]);
  });

  it("lets the context set or clear the base image", async () => {
    getServiceStub.resolves(liveWeb);
    const [withNewImage] = await prepareRun(web, { context: { baseImage: "nodejs24" } });
    expect(withNewImage.baseImage).to.equal("nodejs24");
    const [cleared] = await prepareRun(web, { context: { baseImage: null } });
    expect(cleared.baseImage).to.be.undefined;
  });

  describe("local builds", () => {
    it("require a base image", async () => {
      getServiceStub.resolves({
        ...liveWeb,
        template: { containers: [{ name: "web", image: "old-image" }] },
      });
      await expect(prepareRun(localWeb)).to.be.rejectedWith(
        /Local builds require a base image.*firebase run:services:update web:us-central1 --base-image/,
      );
    });

    it("point new services to init, which sets a base image", async () => {
      await expect(prepareRun(localWeb)).to.be.rejectedWith(
        /doesn't exist in us-central1 yet.*which also sets the base image/,
      );
    });

    it("are left to the deploy step", async () => {
      getServiceStub.resolves(liveWeb);
      const [svc] = await prepareRun(localWeb);
      expect(svc.baseImage).to.equal(nodejs22);
      expect(svc).not.to.have.property("localBuild");
    });
  });

  describe("build env", () => {
    const withBuildEnv = (env: Record<string, unknown>): runv2.Service =>
      ({
        ...liveWeb,
        annotations: { [BUILD_ENV_ANNOTATION]: JSON.stringify(env) },
      }) as unknown as runv2.Service;

    it("passes plain build env to Cloud Build", async () => {
      getServiceStub.resolves(withBuildEnv({ API_URL: "https://api.example.com" }));
      const [svc] = await prepareRun(web);
      expect(svc.buildEnv).to.deep.equal({ API_URL: "https://api.example.com" });
    });

    it("leaves build env unset without the annotation", async () => {
      getServiceStub.resolves(liveWeb);
      const [svc] = await prepareRun(web);
      expect(svc).not.to.have.property("buildEnv");
    });

    it("rejects build secrets on Cloud Build", async () => {
      getServiceStub.resolves(withBuildEnv({ TOKEN: { secret: "t" } }));
      await expect(prepareRun(web)).to.be.rejectedWith(
        /Service web in us-central1 has build secrets \(TOKEN\).*"localBuild": true/,
      );
    });

    it("keeps build secrets for local builds", async () => {
      getServiceStub.resolves(withBuildEnv({ TOKEN: { secret: "t", version: "2" } }));
      const [svc] = await prepareRun(localWeb);
      expect(svc.buildEnv).to.deep.equal({ TOKEN: { secret: "t", version: "2" } });
    });
  });

  it("only prepares the services that --only selects", async () => {
    const webEurope = { serviceId: "web", region: "europe-west1" };
    const services = await prepareRun([web, webEurope], { only: "run:web:europe-west1" });
    expect(services.map((svc) => svc.config)).to.deep.equal([webEurope]);
    expect(getServiceStub).to.have.been.calledOnceWith("my-project", "europe-west1", "web");
  });
});
