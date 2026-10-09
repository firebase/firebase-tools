import { expect } from "chai";
import * as sinon from "sinon";
import * as computeEngine from "../../gcp/computeEngine";
import * as resourceManager from "../../gcp/resourceManager";
import * as runv2 from "../../gcp/runv2";
import * as getProjectNumber from "../../getProjectNumber";
import * as managementApps from "../../management/apps";
import { Options } from "../../options";
import * as utils from "../../utils";
import { Context, Payload, ServiceDeploy } from "./args";
import { BUILD_ENV_ANNOTATION } from "./buildEnv";
import { prepare } from "./prepare";
import * as prereqs from "./prereqs";
import { FIREBASE_APP_ANNOTATION } from "./util";

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
      {
        config: web,
        existing: undefined,
        baseImage: undefined,
        appId: undefined,
        firebaseConfig: undefined,
      },
    ]);
    expect(prereqsStub).to.have.been.calledWith("my-project");
    expect(getServiceStub).to.have.been.calledWith("my-project", "us-central1", "web");
  });

  it("reuses an existing service's base image", async () => {
    getServiceStub.resolves(liveWeb);
    expect(await prepareRun(web)).to.deep.equal([
      {
        config: web,
        existing: liveWeb,
        baseImage: nodejs22,
        appId: undefined,
        firebaseConfig: undefined,
      },
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

  describe("sdk autoinit", () => {
    const appId = "1:1:web:a";
    const defaultSa = "123-compute@developer.gserviceaccount.com";
    const adminSdkRole = "roles/firebase.sdkAdminServiceAgent";
    const webConfig = {
      projectId: "my-project",
      appId,
      apiKey: "k",
      storageBucket: "my-project.appspot.com",
    };
    // What the Admin SDK and the client SDK read to auto-initialize.
    const firebaseConfig = JSON.stringify({
      storageBucket: "my-project.appspot.com",
      projectId: "my-project",
    });
    const webappConfig = JSON.stringify(webConfig);
    /** The web service, linked to the Firebase Web App. */
    const linkedWeb = (overrides: Record<string, unknown> = {}): runv2.Service =>
      ({
        ...liveWeb,
        annotations: { [FIREBASE_APP_ANNOTATION]: appId },
        ...overrides,
      }) as unknown as runv2.Service;
    let getAppConfigStub: sinon.SinonStub;
    let hasRolesStub: sinon.SinonStub;
    let addRolesStub: sinon.SinonStub;

    beforeEach(() => {
      getAppConfigStub = sinon.stub(managementApps, "getAppConfig").resolves(webConfig);
      sinon.stub(getProjectNumber, "getProjectNumber").resolves("123");
      sinon.stub(computeEngine, "getDefaultServiceAccount").resolves(defaultSa);
      hasRolesStub = sinon.stub(resourceManager, "serviceAccountHasRoles").resolves(true);
      addRolesStub = sinon
        .stub(resourceManager, "addServiceAccountToRoles")
        .resolves({ bindings: [], etag: "", version: 3 });
    });

    it("reuses the service's linked app and resolves its build and runtime config", async () => {
      getServiceStub.resolves(linkedWeb());

      const [svc] = await prepareRun(web);

      expect(getAppConfigStub).to.have.been.calledWith(appId, managementApps.AppPlatform.WEB);
      expect(svc.appId).to.equal(appId);
      expect(svc.firebaseConfig).to.equal(firebaseConfig);
      expect(svc.buildEnv).to.deep.equal({
        FIREBASE_WEBAPP_CONFIG: webappConfig,
        FIREBASE_CONFIG: firebaseConfig,
      });
      expect(hasRolesStub).to.have.been.calledWith("my-project", defaultSa, [adminSdkRole], true);
      expect(addRolesStub).not.to.have.been.called;
    });

    it("grants the Admin SDK role to the default service account if it's missing", async () => {
      hasRolesStub.resolves(false);

      await prepareRun(web, { context: { appId } });

      expect(addRolesStub).to.have.been.calledOnceWithExactly(
        "my-project",
        defaultSa,
        [adminSdkRole],
        true,
      );
    });

    it("checks and grants the Admin SDK role on a custom service account", async () => {
      const customSa = "custom@my-project.iam.gserviceaccount.com";
      hasRolesStub.resolves(false);
      getServiceStub.resolves(
        linkedWeb({ template: { ...liveWeb.template, serviceAccount: customSa } }),
      );

      await prepareRun(web);

      expect(hasRolesStub).to.have.been.calledWith("my-project", customSa, [adminSdkRole], true);
      expect(addRolesStub).to.have.been.calledOnceWithExactly(
        "my-project",
        customSa,
        [adminSdkRole],
        true,
      );
    });

    it("warns and continues if it isn't allowed to grant the Admin SDK role", async () => {
      const warnStub = sinon.stub(utils, "logLabeledWarning");
      hasRolesStub.resolves(false);
      addRolesStub.rejects({ status: 403 });

      const [svc] = await prepareRun(web, { context: { appId } });

      expect(svc.appId).to.equal(appId);
      expect(warnStub).to.have.been.calledWithMatch("run", /or ask an admin to grant this role/);
    });

    it("lets the context set or clear the linked app", async () => {
      getServiceStub.resolves(linkedWeb({ annotations: { [FIREBASE_APP_ANNOTATION]: "old-app" } }));

      const [linked] = await prepareRun(web, { context: { appId } });
      expect(linked.appId).to.equal(appId);

      const [cleared] = await prepareRun(web, { context: { appId: null } });
      expect(cleared.appId).to.be.undefined;
      expect(cleared.firebaseConfig).to.be.undefined;
      expect(cleared.buildEnv).to.be.undefined;
    });

    it("always uses the linked app's current config, not the one on the container", async () => {
      const stale = [{ name: "FIREBASE_CONFIG", value: '{"projectId":"my-project"}' }];
      getServiceStub.resolves(
        linkedWeb({ template: { containers: [{ name: "web", image: "old-image", env: stale }] } }),
      );

      const [svc] = await prepareRun(web);

      expect(svc.firebaseConfig).to.equal(firebaseConfig);
      expect(svc.buildEnv).to.deep.equal({
        FIREBASE_WEBAPP_CONFIG: webappConfig,
        FIREBASE_CONFIG: firebaseConfig,
      });
    });

    it("lets the build env annotation override the app's config at build time only", async () => {
      const userBuildEnv = { FIREBASE_WEBAPP_CONFIG: "custom-webapp", FIREBASE_CONFIG: "custom" };
      getServiceStub.resolves(
        linkedWeb({
          annotations: {
            [FIREBASE_APP_ANNOTATION]: appId,
            [BUILD_ENV_ANNOTATION]: JSON.stringify(userBuildEnv),
          },
        }),
      );

      const [svc] = await prepareRun(web);

      expect(svc.buildEnv).to.deep.equal(userBuildEnv);
      expect(svc.firebaseConfig).to.equal(firebaseConfig);
    });

    it("fails if the linked app can't be looked up", async () => {
      getServiceStub.resolves(linkedWeb());
      getAppConfigStub.rejects(new Error("boom"));

      await expect(prepareRun(web)).to.be.rejectedWith(
        /Unable to look up Firebase Web App 1:1:web:a for service web in us-central1: boom\n.*firebase run:services:update web:us-central1 --app <appId>.*firebase run:services:update web:us-central1 --clear-app/,
      );
      expect(hasRolesStub).not.to.have.been.called;
    });

    it("fails if a newly linked app can't be looked up", async () => {
      getAppConfigStub.rejects(new Error("boom"));

      await expect(prepareRun(web, { context: { appId: "bad-app" } })).to.be.rejectedWith(
        "Unable to look up Firebase Web App bad-app for service web in us-central1: boom",
      );
      expect(hasRolesStub).not.to.have.been.called;
    });
  });

  it("only prepares the services that --only selects", async () => {
    const webEurope = { serviceId: "web", region: "europe-west1" };
    const services = await prepareRun([web, webEurope], { only: "run:web:europe-west1" });
    expect(services.map((svc) => svc.config)).to.deep.equal([webEurope]);
    expect(getServiceStub).to.have.been.calledOnceWith("my-project", "europe-west1", "web");
  });
});
