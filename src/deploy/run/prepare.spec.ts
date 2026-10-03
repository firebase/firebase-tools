import { expect } from "chai";
import * as sinon from "sinon";
import * as computeEngine from "../../gcp/computeEngine";
import * as resourceManager from "../../gcp/resourceManager";
import * as runv2 from "../../gcp/runv2";
import * as getProjectNumber from "../../getProjectNumber";
import * as managementApps from "../../management/apps";
import { Options } from "../../options";
import * as utils from "../../utils";
import { Context, Payload } from "./args";
import { BUILD_ENV_ANNOTATION } from "./buildEnv";
import { prepare } from "./prepare";
import * as prereqs from "./prereqs";
import { FIREBASE_APP_ANNOTATION } from "./util";

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

  describe("sdk autoinit", () => {
    const defaultSa = "123-compute@developer.gserviceaccount.com";
    const adminSdkRole = "roles/firebase.sdkAdminServiceAgent";
    const webConfig = {
      projectId: "p",
      appId: "1:1:web:a",
      apiKey: "k",
      storageBucket: "p.appspot.com",
    };
    const firebaseConfig = JSON.stringify({ storageBucket: "p.appspot.com", projectId: "p" });
    const webappConfig = JSON.stringify(webConfig);
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

    it("reuses the service's current appId and resolves build and runtime config", async () => {
      getServiceStub.resolves({
        ...existing,
        annotations: { [FIREBASE_APP_ANNOTATION]: "1:1:web:a" },
      });
      const svc = await prepareOne();
      expect(getAppConfigStub).to.have.been.calledWith("1:1:web:a", managementApps.AppPlatform.WEB);
      expect(svc.appId).to.equal("1:1:web:a");
      expect(svc.firebaseConfig).to.equal(firebaseConfig);
      expect(svc.buildEnv).to.deep.equal({
        FIREBASE_WEBAPP_CONFIG: webappConfig,
        FIREBASE_CONFIG: firebaseConfig,
      });
      expect(hasRolesStub).to.have.been.calledWith("p", defaultSa, [adminSdkRole], true);
      expect(addRolesStub).not.to.have.been.called;
    });

    it("grants roles/firebase.sdkAdminServiceAgent when missing on the service account", async () => {
      hasRolesStub.resolves(false);
      await prepareOne({}, { appId: "1:1:web:a" });
      expect(addRolesStub).to.have.been.calledOnceWithExactly("p", defaultSa, [adminSdkRole], true);
    });

    it("checks and grants roles/firebase.sdkAdminServiceAgent on a custom service account", async () => {
      hasRolesStub.resolves(false);
      getServiceStub.resolves({
        ...existing,
        annotations: { [FIREBASE_APP_ANNOTATION]: "1:1:web:a" },
        template: { ...existing.template, serviceAccount: "custom@p.iam.gserviceaccount.com" },
      });
      await prepareOne();
      expect(hasRolesStub).to.have.been.calledWith(
        "p",
        "custom@p.iam.gserviceaccount.com",
        [adminSdkRole],
        true,
      );
      expect(addRolesStub).to.have.been.calledOnceWithExactly(
        "p",
        "custom@p.iam.gserviceaccount.com",
        [adminSdkRole],
        true,
      );
    });

    it("warns and continues if granting roles/firebase.sdkAdminServiceAgent fails with 403", async () => {
      const warnStub = sinon.stub(utils, "logLabeledWarning");
      hasRolesStub.resolves(false);
      addRolesStub.rejects({ status: 403 });
      const svc = await prepareOne({}, { appId: "1:1:web:a" });
      expect(svc.appId).to.equal("1:1:web:a");
      expect(warnStub).to.have.been.calledWithMatch("run", /or ask an admin to grant this role/);
    });

    it("lets the context set or clear the appId", async () => {
      getServiceStub.resolves({
        ...existing,
        annotations: { [FIREBASE_APP_ANNOTATION]: "old-app" },
      });
      expect((await prepareOne({}, { appId: "1:1:web:a" })).appId).to.equal("1:1:web:a");
      const cleared = await prepareOne({}, { appId: null });
      expect(cleared.appId).to.be.undefined;
      expect(cleared.firebaseConfig).to.be.undefined;
      expect(cleared.buildEnv).to.be.undefined;
    });

    it("lets user buildEnv and container env override autoinit vars", async () => {
      getServiceStub.resolves({
        ...existing,
        annotations: {
          [FIREBASE_APP_ANNOTATION]: "1:1:web:a",
          [BUILD_ENV_ANNOTATION]: JSON.stringify({ FIREBASE_WEBAPP_CONFIG: "custom-webapp" }),
        },
        template: {
          containers: [
            {
              name: "s",
              image: "i",
              baseImageUri: nodejs22,
              env: [{ name: "FIREBASE_CONFIG", value: "custom-runtime" }],
            },
          ],
        },
      });
      const svc = await prepareOne({}, { appId: "1:1:web:a" });
      expect(svc.firebaseConfig).to.equal("custom-runtime");
      expect(svc.buildEnv).to.deep.equal({
        FIREBASE_WEBAPP_CONFIG: "custom-webapp",
        FIREBASE_CONFIG: "custom-runtime",
      });
    });

    it("preserves secret-backed FIREBASE_CONFIG on the container without overwriting it", async () => {
      getServiceStub.resolves({
        ...existing,
        annotations: { [FIREBASE_APP_ANNOTATION]: "1:1:web:a" },
        template: {
          containers: [
            {
              name: "s",
              image: "i",
              env: [
                {
                  name: "FIREBASE_CONFIG",
                  valueSource: { secretKeyRef: { secret: "sec", version: "1" } },
                },
              ],
            },
          ],
        },
      });
      const svc = await prepareOne();
      expect(svc.firebaseConfig).to.be.undefined;
      expect(svc.buildEnv).to.deep.equal({ FIREBASE_WEBAPP_CONFIG: webappConfig });
    });

    it("fails if the linked Firebase Web App can't be looked up", async () => {
      getServiceStub.resolves({
        ...existing,
        annotations: { [FIREBASE_APP_ANNOTATION]: "1:1:web:a" },
      });
      getAppConfigStub.rejects(new Error("boom"));
      await expect(prepareOne()).to.be.rejectedWith(
        "Unable to look up Firebase Web App 1:1:web:a for service s: boom",
      );
      expect(hasRolesStub).not.to.have.been.called;
    });

    it("fails if a newly linked Firebase Web App can't be looked up", async () => {
      getAppConfigStub.rejects(new Error("boom"));
      await expect(prepareOne({}, { appId: "bad-app" })).to.be.rejectedWith(
        "Unable to look up Firebase Web App bad-app for service s: boom",
      );
      expect(hasRolesStub).not.to.have.been.called;
    });
  });
});
