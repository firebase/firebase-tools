import { expect } from "chai";
import * as sinon from "sinon";
import * as deploy from "./deploy";
import * as provision from "../../management/provisioning/provision";
import { Options } from "../../options";
import * as apps from "../../management/apps";
import { ProviderMode } from "../../management/provisioning/types";

describe("deploy/auth", () => {
  let sandbox: sinon.SinonSandbox;
  let provisionStub: sinon.SinonStub;

  beforeEach(() => {
    sandbox = sinon.createSandbox();
    provisionStub = sandbox.stub(provision, "provisionFirebaseApp").resolves();
  });

  afterEach(() => {
    sandbox.restore();
  });

  it("should skip if no auth config", async () => {
    const options = { config: { src: {} }, project: "test-project" } as unknown as Options;
    const context = { auth: { appId: "1:12345:web:abcdef" } };

    await deploy.deploy(context, options);

    expect(provisionStub).to.not.be.called;
  });

  it("should skip if no appId in context", async () => {
    const options = {
      config: {
        src: {
          auth: {
            providers: { anonymous: true },
          },
        },
      },
      project: "test-project",
    } as unknown as Options;
    const context = { auth: {} };

    await deploy.deploy(context, options);

    expect(provisionStub).to.not.be.called;
  });

  it("should provision auth providers", async () => {
    const options = {
      config: {
        src: {
          auth: {
            providers: {
              anonymous: true,
              emailPassword: true,
              googleSignIn: {
                oAuthBrandDisplayName: "Brand",
                supportEmail: "support@example.com",
                authorizedRedirectUris: ["https://example.com"],
              },
            },
          },
        },
      },
      project: "test-project",
    } as unknown as Options;
    const context = { auth: { appId: "1:12345:web:abcdef" } };

    await deploy.deploy(context, options);

    expect(provisionStub).to.be.calledOnce;
    const args = provisionStub.firstCall.args[0];
    expect(args.project).to.deep.equal({
      parent: { type: "existing_project", projectId: "test-project" },
    });
    expect(args.app).to.deep.equal({ platform: apps.AppPlatform.WEB, appId: "1:12345:web:abcdef" });

    const input = args.features?.firebaseAuthInput;
    expect(input?.anonymousAuthProviderMode).to.equal(ProviderMode.PROVIDER_ENABLED);
    expect(input?.emailAuthProviderMode).to.equal(ProviderMode.PROVIDER_ENABLED);
    expect(input?.googleSigninProviderMode).to.equal(ProviderMode.PROVIDER_ENABLED);
    expect(input?.googleSigninProviderConfig).to.deep.equal({
      publicDisplayName: "Brand",
      customerSupportEmail: "support@example.com",
      oauthRedirectUris: ["https://example.com"],
    });
  });

  it("should skip if no providers enabled", async () => {
    const options = {
      config: {
        src: {
          auth: {
            providers: {},
          },
        },
      },
      project: "test-project",
    } as unknown as Options;
    const context = { auth: { appId: "1:12345:web:abcdef" } };

    await deploy.deploy(context, options);

    expect(provisionStub).to.not.be.called;
  });
});
