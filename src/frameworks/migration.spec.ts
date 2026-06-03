import { expect } from "chai";
import * as sinon from "sinon";
import { handleWebFrameworkMigration } from "./migration";
import * as frameworksIndex from "./index";
import * as prompt from "../prompt";
import * as apphostingBackend from "../apphosting/backend";
import * as apphostingGcp from "../gcp/apphosting";
import * as ensureApi from "../ensureApiEnabled";
import { Config } from "../config";
import * as detectProjectRootModule from "../detectProjectRoot";

describe("WebFrameworks Migration", () => {
  let options: any;
  let targetNames: string[];
  let context: any;

  let discoverStub: sinon.SinonStub;
  let confirmStub: sinon.SinonStub;
  let doSetupSourceDeployStub: sinon.SinonStub;
  let listBackendsStub: sinon.SinonStub;

  beforeEach(() => {
    targetNames = ["hosting"];
    context = {};
    options = {
      projectId: "my-project",
      projectRoot: "/test-root",
      config: new Config({
        hosting: {
          site: "my-site",
          source: "src",
        },
      }),
    };

    // Stubs
    discoverStub = sinon.stub(frameworksIndex, "discover").throws("Unexpected discover call");
    confirmStub = sinon.stub(prompt, "confirm").throws("Unexpected confirm call");
    doSetupSourceDeployStub = sinon
      .stub(apphostingBackend, "doSetupSourceDeploy")
      .throws("Unexpected doSetupSourceDeploy call");
    listBackendsStub = sinon
      .stub(apphostingGcp, "listBackends")
      .throws("Unexpected listBackends call");

    // API ensure mocking
    sinon.stub(ensureApi, "ensure").resolves();
    sinon.stub(apphostingBackend, "ensureRequiredApisEnabled").resolves();
    sinon.stub(apphostingBackend, "ensureAppHostingComputeServiceAccount").resolves();

    sinon.stub(detectProjectRootModule, "detectProjectRoot").returns("/test-root");
    sinon.stub(options.config, "writeProjectFile").returns(undefined);
  });

  afterEach(() => {
    sinon.verifyAndRestore();
  });

  it("should migrate an SSR framework to App Hosting when user accepts", async () => {
    // Discover returns NextJS (SSR)
    discoverStub.resolves({ framework: "next", mayWantBackend: true });

    // User accepts migration prompt
    confirmStub.resolves(true);

    // Backend does not exist, so it creates it
    listBackendsStub.resolves({ backends: [] });
    doSetupSourceDeployStub.resolves({ backend: { name: "my-backend" }, location: "us-central1" });

    await handleWebFrameworkMigration(targetNames, context, options);

    // Target names should swap hosting to apphosting
    expect(targetNames).to.deep.equal(["apphosting"]);

    // Config should have apphosting block set
    expect(options.config.get("apphosting")).to.deep.equal({
      backendId: "my-site",
      localBuild: true,
    });

    // Hosting config public directory should point to .apphosting/public
    const hostingConfig = options.config.get("hosting");
    expect(hostingConfig.public).to.equal(".apphosting/public");
    expect(hostingConfig.source).to.be.undefined;
  });

  it("should migrate a static framework to standard Hosting with predeploy hook when user accepts", async () => {
    // Discover returns Vite React (Static)
    discoverStub.resolves({ framework: "react", mayWantBackend: false });

    // User accepts migration prompt
    confirmStub.resolves(true);

    await handleWebFrameworkMigration(targetNames, context, options);

    // Target names should remain hosting
    expect(targetNames).to.deep.equal(["hosting"]);

    // Hosting config should have predeploy hook and public dir dist
    const hostingConfig = options.config.get("hosting");
    expect(hostingConfig.public).to.equal("dist");
    expect(hostingConfig.predeploy).to.equal("npm run build");
    expect(hostingConfig.source).to.be.undefined;
  });
});
