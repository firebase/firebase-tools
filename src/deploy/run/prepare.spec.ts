import { expect } from "chai";
import * as sinon from "sinon";
import { webApps } from "../../apphosting/app";
import { FirebaseError } from "../../error";
import * as computeEngine from "../../gcp/computeEngine";
import * as resourceManager from "../../gcp/resourceManager";
import * as runv2 from "../../gcp/runv2";
import * as getProjectNumber from "../../getProjectNumber";
import * as managementApps from "../../management/apps";
import { Options } from "../../options";
import * as utils from "../../utils";
import { Context, Payload, ServiceDeploy } from "./args";
import { BUILD_ENV_ANNOTATION, BuildEnv } from "./buildEnv";
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
  /** The live web service, with this build env annotation. */
  const withBuildEnv = (env: BuildEnv): runv2.Service => ({
    ...liveWeb,
    annotations: { [BUILD_ENV_ANNOTATION]: JSON.stringify(env) },
  });
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
      const webWithoutBaseImage = {
        ...liveWeb,
        template: { containers: [{ name: "web", image: "old-image" }] },
      };
      getServiceStub.resolves(webWithoutBaseImage);

      await expect(prepareRun(localWeb)).to.be.rejectedWith(
        'Local builds require a base image. Set one for service web in us-central1 with "firebase run:services:update web --region us-central1 --base-image <baseImage>".',
      );
    });

    it("point new services to init, which sets a base image", async () => {
      await expect(prepareRun(localWeb)).to.be.rejectedWith(
        'Local builds require a base image. Set one for service web in us-central1 with "firebase init run".',
      );
    });
  });

  describe("build env", () => {
    it("reads the build env from the service's annotation", async () => {
      getServiceStub.resolves(withBuildEnv({ API_URL: "https://api.example.com" }));

      const [svc] = await prepareRun(web);

      expect(svc.buildEnv).to.deep.equal({ API_URL: "https://api.example.com" });
    });

    it("rejects build secrets on Cloud Build", async () => {
      getServiceStub.resolves(withBuildEnv({ NPM_TOKEN: { secret: "npm-token" } }));

      await expect(prepareRun(web)).to.be.rejectedWith(
        /Service web in us-central1 has build secrets \(NPM_TOKEN\).*"localBuild": true/,
      );
    });

    it("keeps build secrets for local builds", async () => {
      getServiceStub.resolves(withBuildEnv({ NPM_TOKEN: { secret: "npm-token" } }));

      const [svc] = await prepareRun(localWeb);

      expect(svc.buildEnv).to.deep.equal({ NPM_TOKEN: { secret: "npm-token" } });
    });
  });

  describe("sdk autoinit", () => {
    const appId = "1:123:web:abc";
    const webConfig = {
      projectId: "my-project",
      appId,
      apiKey: "api-key",
      storageBucket: "my-project.appspot.com",
    };
    const firebaseConfig = '{"storageBucket":"my-project.appspot.com","projectId":"my-project"}';
    const defaultSa = "123-compute@developer.gserviceaccount.com";
    const adminSdkRole = "roles/firebase.sdkAdminServiceAgent";
    /** The service, linked to the app. */
    const linked = (service: runv2.Service): runv2.Service => ({
      ...service,
      annotations: { ...service.annotations, [FIREBASE_APP_ANNOTATION]: appId },
    });
    let getAppConfigStub: sinon.SinonStub;
    let getWebAppStub: sinon.SinonStub;
    let hasRolesStub: sinon.SinonStub;
    let addRolesStub: sinon.SinonStub;

    beforeEach(() => {
      getAppConfigStub = sinon.stub(managementApps, "getAppConfig").resolves(webConfig);
      getWebAppStub = sinon.stub(webApps, "getOrCreateWebApp").resolves({ name: "web", id: appId });
      sinon.stub(getProjectNumber, "getProjectNumber").resolves("123");
      sinon.stub(computeEngine, "getDefaultServiceAccount").resolves(defaultSa);
      hasRolesStub = sinon.stub(resourceManager, "serviceAccountHasRoles").resolves(true);
      addRolesStub = sinon.stub(resourceManager, "addServiceAccountToRoles").resolves();
    });

    it("reuses the service's linked app and resolves its build and runtime config", async () => {
      getServiceStub.resolves(linked(liveWeb));

      const [svc] = await prepareRun(web);

      expect(getWebAppStub).to.have.been.calledWith("my-project", appId, "web");
      expect(getAppConfigStub).to.have.been.calledWith(appId, managementApps.AppPlatform.WEB);
      expect(svc).to.include({ appId, firebaseConfig });
      expect(svc.buildEnv).to.deep.equal({
        FIREBASE_WEBAPP_CONFIG: JSON.stringify(webConfig),
        FIREBASE_CONFIG: firebaseConfig,
      });
      // The default service account already has the role.
      expect(hasRolesStub).to.have.been.calledWith("my-project", defaultSa, [adminSdkRole]);
      expect(addRolesStub).not.to.have.been.called;
    });

    it("grants the Admin SDK role to the default service account if it's missing", async () => {
      hasRolesStub.resolves(false);

      await prepareRun(web, { context: { appId } });

      expect(addRolesStub).to.have.been.calledWith("my-project", defaultSa, [adminSdkRole]);
    });

    it("checks and grants the Admin SDK role on a custom service account", async () => {
      const customSa = "web@my-project.iam.gserviceaccount.com";
      getServiceStub.resolves(
        linked({ ...liveWeb, template: { ...liveWeb.template, serviceAccount: customSa } }),
      );
      hasRolesStub.resolves(false);

      await prepareRun(web);

      expect(hasRolesStub).to.have.been.calledWith("my-project", customSa, [adminSdkRole]);
      expect(addRolesStub).to.have.been.calledWith("my-project", customSa, [adminSdkRole]);
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
      getServiceStub.resolves(linked(liveWeb));

      const [withNewApp] = await prepareRun(web, { context: { appId: "1:123:web:def" } });
      expect(withNewApp.appId).to.equal("1:123:web:def");

      const [cleared] = await prepareRun(web, { context: { appId: null } });
      expect(cleared).not.to.have.any.keys("appId", "firebaseConfig", "buildEnv");
    });

    it("lets the build env annotation override the app's config at build time only", async () => {
      const override = '{"projectId":"my-other-project"}';
      getServiceStub.resolves(linked(withBuildEnv({ FIREBASE_CONFIG: override })));

      const [svc] = await prepareRun(web);

      expect(svc.buildEnv).to.include({ FIREBASE_CONFIG: override });
      expect(svc.firebaseConfig).to.equal(firebaseConfig);
    });

    it("fails if the linked app can't be looked up", async () => {
      getServiceStub.resolves(linked(liveWeb));
      getAppConfigStub.rejects(new Error("boom"));

      await expect(prepareRun(web)).to.be.rejectedWith(
        "Unable to look up Firebase Web App 1:123:web:abc for service web in us-central1: boom\n" +
          'To use a different app, run "firebase run:services:update web --region us-central1 --app <appId>". ' +
          'To deploy without Firebase SDK auto-initialization, run "firebase run:services:update web --region us-central1 --clear-app".',
      );
      expect(hasRolesStub).not.to.have.been.called;
    });

    it("fails, before building or saving anything, if the project has no app with that ID", async () => {
      getServiceStub.resolves(linked(liveWeb));
      getWebAppStub.rejects(
        new FirebaseError("The web app '1:123:web:typo' does not exist in project my-project"),
      );

      await expect(prepareRun(web, { context: { appId: "1:123:web:typo" } })).to.be.rejectedWith(
        "Unable to look up Firebase Web App 1:123:web:typo for service web in us-central1: " +
          "The web app '1:123:web:typo' does not exist in project my-project\n" +
          'To use a different app, run "firebase run:services:update web --region us-central1 --app <appId>". ' +
          'To deploy without Firebase SDK auto-initialization, run "firebase run:services:update web --region us-central1 --clear-app".',
      );
      expect(getAppConfigStub).not.to.have.been.called;
      expect(hasRolesStub).not.to.have.been.called;
    });

    it("rejects a service it can't build before looking up the app or touching IAM", async () => {
      getServiceStub.resolves(linked(withBuildEnv({ NPM_TOKEN: { secret: "npm-token" } })));

      await expect(prepareRun(web)).to.be.rejectedWith("has build secrets (NPM_TOKEN)");
      expect(getAppConfigStub).not.to.have.been.called;
      expect(hasRolesStub).not.to.have.been.called;
      expect(addRolesStub).not.to.have.been.called;
    });
  });

  it("only prepares the services that --only selects", async () => {
    const webEurope = { serviceId: "web", region: "europe-west1" };
    const services = await prepareRun([web, webEurope], { only: "run:web:europe-west1" });
    expect(services.map((svc) => svc.config)).to.deep.equal([webEurope]);
    expect(getServiceStub).to.have.been.calledOnceWith("my-project", "europe-west1", "web");
  });
});
