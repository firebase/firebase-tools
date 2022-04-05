import * as authBlocking from "../../../../deploy/functions/services/authBlocking";
import * as backend from "../../../../deploy/functions/backend";
import * as identityPlatform from "../../../../gcp/identityPlatform";
import * as sinon from "sinon";
import { expect } from "chai";
import { BEFORE_CREATE_EVENT, BEFORE_SIGN_IN_EVENT } from "../../../../functions/events/v1";

const BASE_EP = {
  id: "id",
  region: "us-east1",
  project: "project",
  entryPoint: "func",
  runtime: "nodejs16",
};

describe("authBlocking", () => {
  let getConfig: sinon.SinonStub;
  let setConfig: sinon.SinonStub;

  beforeEach(() => {
    getConfig = sinon
      .stub(identityPlatform, "getBlockingFunctionsConfig")
      .throws("Unexpected call to getBlockingFunctionsConfig");
    setConfig = sinon
      .stub(identityPlatform, "setBlockingFunctionsConfig")
      .throws("Unexpected call to setBlockingFunctionsConfig");
  });

  afterEach(() => {
    sinon.verifyAndRestore();
  });

  describe("validateAuthBlockingTrigger", () => {
    it("should throw an error if more than one beforeCreate blocking endpoint", () => {
      const ep1: backend.Endpoint = {
        ...BASE_EP,
        platform: "gcfv1",
        id: "id1",
        entryPoint: "func1",
        blockingTrigger: {
          eventType: BEFORE_CREATE_EVENT,
        },
      };
      const ep2: backend.Endpoint = {
        ...BASE_EP,
        platform: "gcfv1",
        id: "id2",
        entryPoint: "func2",
        blockingTrigger: {
          eventType: BEFORE_CREATE_EVENT,
        },
      };

      expect(() => authBlocking.validateAuthBlockingTrigger(ep1, backend.of(ep1, ep2))).to.throw(
        `Can only create at most one Auth Blocking Trigger for ${BEFORE_CREATE_EVENT} events`
      );
    });

    it("should throw an error if more than one beforeSignIn blocking endpoint", () => {
      const ep1: backend.Endpoint = {
        ...BASE_EP,
        platform: "gcfv1",
        id: "id1",
        entryPoint: "func1",
        blockingTrigger: {
          eventType: BEFORE_SIGN_IN_EVENT,
        },
      };
      const ep2: backend.Endpoint = {
        ...BASE_EP,
        platform: "gcfv1",
        id: "id2",
        entryPoint: "func2",
        blockingTrigger: {
          eventType: BEFORE_SIGN_IN_EVENT,
        },
      };

      expect(() => authBlocking.validateAuthBlockingTrigger(ep1, backend.of(ep1, ep2))).to.throw(
        `Can only create at most one Auth Blocking Trigger for ${BEFORE_SIGN_IN_EVENT} events`
      );
    });

    it("should create the identity platform options on the backend and default them", () => {
      const ep1: backend.Endpoint = {
        ...BASE_EP,
        platform: "gcfv1",
        id: "id1",
        entryPoint: "func1",
        blockingTrigger: {
          eventType: BEFORE_CREATE_EVENT,
          accessToken: false,
          idToken: true,
        },
      };
      const ep2: backend.Endpoint = {
        ...BASE_EP,
        platform: "gcfv1",
        id: "id2",
        entryPoint: "func2",
        blockingTrigger: {
          eventType: BEFORE_SIGN_IN_EVENT,
          accessToken: true,
        },
      };
      const want: backend.Backend = {
        ...backend.of(ep1, ep2),
      };

      authBlocking.validateAuthBlockingTrigger(ep1, want);

      expect(want.resourceOptions.identityPlatform).to.deep.equal({
        accessToken: false,
        idToken: true,
        refreshToken: false,
      });
    });

    it("should correctly OR the identity platform options on the backend", () => {
      const ep1: backend.Endpoint = {
        ...BASE_EP,
        platform: "gcfv1",
        id: "id1",
        entryPoint: "func1",
        blockingTrigger: {
          eventType: BEFORE_CREATE_EVENT,
          accessToken: false,
          idToken: true,
        },
      };
      const ep2: backend.Endpoint = {
        ...BASE_EP,
        platform: "gcfv1",
        id: "id2",
        entryPoint: "func2",
        blockingTrigger: {
          eventType: BEFORE_SIGN_IN_EVENT,
          accessToken: true,
        },
      };
      const want: backend.Backend = {
        ...backend.of(ep1, ep2),
        resourceOptions: {
          identityPlatform: {
            accessToken: false,
            idToken: true,
            refreshToken: false,
          },
        },
      };

      authBlocking.validateAuthBlockingTrigger(ep2, want);

      expect(want.resourceOptions.identityPlatform).to.deep.equal({
        accessToken: true,
        idToken: true,
        refreshToken: false,
      });
    });
  });

  describe("copyIdentityPlatformOptionsToEndpoint", () => {
    it("should copy the backend options to the endpoint", () => {
      const ep1: backend.Endpoint = {
        ...BASE_EP,
        platform: "gcfv1",
        id: "id1",
        entryPoint: "func1",
        blockingTrigger: {
          eventType: BEFORE_CREATE_EVENT,
          accessToken: false,
          idToken: true,
        },
      };
      const ep2: backend.Endpoint = {
        ...BASE_EP,
        platform: "gcfv1",
        id: "id2",
        entryPoint: "func2",
        blockingTrigger: {
          eventType: BEFORE_SIGN_IN_EVENT,
          accessToken: true,
        },
      };
      const want: backend.Backend = {
        ...backend.of(ep1, ep2),
        resourceOptions: {
          identityPlatform: {
            accessToken: true,
            idToken: true,
            refreshToken: false,
          },
        },
      };

      authBlocking.copyIdentityPlatformOptionsToEndpoint(ep1, want);

      expect(ep1.blockingTrigger.accessToken).to.be.true;
      expect(ep1.blockingTrigger.idToken).to.be.true;
      expect(ep1.blockingTrigger.refreshToken).to.be.false;
    });
  });

  describe("registerTrigger", () => {
    it("should handle an empty config", async () => {
      const blockingConfig = {};
      const newBlockingConfig: identityPlatform.BlockingFunctionsConfig = {
        triggers: {
          beforeCreate: {
            functionUri: "somethingnew.url",
          },
        },
        forwardInboundCredentials: {
          accessToken: false,
          idToken: true,
          refreshToken: false,
        },
      };
      const ep: backend.Endpoint = {
        ...BASE_EP,
        platform: "gcfv1",
        uri: "somethingnew.url",
        blockingTrigger: {
          eventType: BEFORE_CREATE_EVENT,
          accessToken: false,
          idToken: true,
          refreshToken: false,
        },
      };
      getConfig.resolves(blockingConfig);
      setConfig.resolves(newBlockingConfig);

      await authBlocking.registerTrigger(ep, false);

      expect(blockingConfig).to.deep.equal(newBlockingConfig);
      expect(setConfig).to.have.been.calledWith("project", newBlockingConfig);
    });

    it("should register on a new beforeCreate endpoint", async () => {
      const blockingConfig: identityPlatform.BlockingFunctionsConfig = {
        triggers: {
          beforeCreate: {
            functionUri: "beforecreate.url",
          },
          beforeSignIn: {
            functionUri: "beforesignin.url",
          },
        },
        forwardInboundCredentials: {
          accessToken: true,
        },
      };
      const newBlockingConfig: identityPlatform.BlockingFunctionsConfig = {
        triggers: {
          beforeCreate: {
            functionUri: "somethingnew.url",
          },
          beforeSignIn: {
            functionUri: "beforesignin.url",
          },
        },
        forwardInboundCredentials: {
          accessToken: false,
          idToken: true,
          refreshToken: false,
        },
      };
      const ep: backend.Endpoint = {
        ...BASE_EP,
        platform: "gcfv1",
        uri: "somethingnew.url",
        blockingTrigger: {
          eventType: BEFORE_CREATE_EVENT,
          accessToken: false,
          idToken: true,
          refreshToken: false,
        },
      };
      getConfig.resolves(blockingConfig);
      setConfig.resolves(newBlockingConfig);

      await authBlocking.registerTrigger(ep, false);

      expect(blockingConfig).to.deep.equal(newBlockingConfig);
      expect(setConfig).to.have.been.calledWith("project", newBlockingConfig);
    });

    it("should register on a new beforeSignIn endpoint", async () => {
      const blockingConfig: identityPlatform.BlockingFunctionsConfig = {
        triggers: {
          beforeCreate: {
            functionUri: "beforecreate.url",
          },
          beforeSignIn: {
            functionUri: "beforesignin.url",
          },
        },
        forwardInboundCredentials: {
          accessToken: true,
        },
      };
      const newBlockingConfig: identityPlatform.BlockingFunctionsConfig = {
        triggers: {
          beforeCreate: {
            functionUri: "beforecreate.url",
          },
          beforeSignIn: {
            functionUri: "somethingnew.url",
          },
        },
        forwardInboundCredentials: {
          accessToken: false,
          idToken: true,
          refreshToken: false,
        },
      };
      const ep: backend.Endpoint = {
        ...BASE_EP,
        platform: "gcfv1",
        uri: "somethingnew.url",
        blockingTrigger: {
          eventType: BEFORE_SIGN_IN_EVENT,
          accessToken: false,
          idToken: true,
          refreshToken: false,
        },
      };
      getConfig.resolves(blockingConfig);
      setConfig.resolves(newBlockingConfig);

      await authBlocking.registerTrigger(ep, false);

      expect(blockingConfig).to.deep.equal(newBlockingConfig);
      expect(setConfig).to.have.been.calledWith("project", newBlockingConfig);
    });

    it("should register on an update to a beforeCreate endpoint", async () => {
      const blockingConfig: identityPlatform.BlockingFunctionsConfig = {
        triggers: {
          beforeCreate: {
            functionUri: "beforecreate.url",
          },
          beforeSignIn: {
            functionUri: "beforesignin.url",
          },
        },
        forwardInboundCredentials: {
          accessToken: true,
        },
      };
      const newBlockingConfig: identityPlatform.BlockingFunctionsConfig = {
        triggers: {
          beforeCreate: {
            functionUri: "somethingnew.url",
          },
          beforeSignIn: {
            functionUri: "beforesignin.url",
          },
        },
        forwardInboundCredentials: {
          accessToken: true,
        },
      };
      const ep: backend.Endpoint = {
        ...BASE_EP,
        platform: "gcfv1",
        uri: "somethingnew.url",
        blockingTrigger: {
          eventType: BEFORE_CREATE_EVENT,
          accessToken: false,
          idToken: true,
          refreshToken: false,
        },
      };
      getConfig.resolves(blockingConfig);
      setConfig.resolves(newBlockingConfig);

      await authBlocking.registerTrigger(ep, true);

      expect(blockingConfig).to.deep.equal(newBlockingConfig);
      expect(setConfig).to.have.been.calledWith("project", newBlockingConfig);
    });

    it("should register on an update to a beforeSignIn endpoint", async () => {
      const blockingConfig: identityPlatform.BlockingFunctionsConfig = {
        triggers: {
          beforeCreate: {
            functionUri: "beforecreate.url",
          },
          beforeSignIn: {
            functionUri: "beforesignin.url",
          },
        },
        forwardInboundCredentials: {
          accessToken: true,
        },
      };
      const newBlockingConfig: identityPlatform.BlockingFunctionsConfig = {
        triggers: {
          beforeCreate: {
            functionUri: "beforecreate.url",
          },
          beforeSignIn: {
            functionUri: "somethingnew.url",
          },
        },
        forwardInboundCredentials: {
          accessToken: true,
        },
      };
      const ep: backend.Endpoint = {
        ...BASE_EP,
        platform: "gcfv1",
        uri: "somethingnew.url",
        blockingTrigger: {
          eventType: BEFORE_SIGN_IN_EVENT,
          accessToken: false,
          idToken: true,
          refreshToken: false,
        },
      };
      getConfig.resolves(blockingConfig);
      setConfig.resolves(newBlockingConfig);

      await authBlocking.registerTrigger(ep, true);

      expect(blockingConfig).to.deep.equal(newBlockingConfig);
      expect(setConfig).to.have.been.calledWith("project", newBlockingConfig);
    });
  });

  describe("unregisterAuthBlockingTriggerFromIdentityPlatform", () => {
    it("should not unregister a beforeCreate endpoint if uri does not match", async () => {
      const blockingConfig: identityPlatform.BlockingFunctionsConfig = {
        triggers: {
          beforeCreate: {
            functionUri: "beforecreate.url",
          },
          beforeSignIn: {
            functionUri: "beforesignin.url",
          },
        },
        forwardInboundCredentials: {
          accessToken: true,
        },
      };
      const ep: backend.Endpoint = {
        ...BASE_EP,
        platform: "gcfv1",
        uri: "somethingnew.url",
        blockingTrigger: {
          eventType: BEFORE_CREATE_EVENT,
          accessToken: false,
          idToken: true,
          refreshToken: false,
        },
      };
      getConfig.resolves(blockingConfig);

      await authBlocking.unregisterTrigger(ep);

      expect(setConfig).to.not.have.been.called;
    });

    it("should not unregister a beforeSignIn endpoint if the uri does not match", async () => {
      const blockingConfig: identityPlatform.BlockingFunctionsConfig = {
        triggers: {
          beforeCreate: {
            functionUri: "beforecreate.url",
          },
          beforeSignIn: {
            functionUri: "beforesignin.url",
          },
        },
        forwardInboundCredentials: {
          accessToken: true,
        },
      };
      const ep: backend.Endpoint = {
        ...BASE_EP,
        platform: "gcfv1",
        uri: "somethingnew.url",
        blockingTrigger: {
          eventType: BEFORE_SIGN_IN_EVENT,
          accessToken: false,
          idToken: true,
          refreshToken: false,
        },
      };
      getConfig.resolves(blockingConfig);

      await authBlocking.unregisterTrigger(ep);

      expect(setConfig).to.not.have.been.called;
    });

    it("should unregister a beforeCreate endpoint", async () => {
      const blockingConfig: identityPlatform.BlockingFunctionsConfig = {
        triggers: {
          beforeCreate: {
            functionUri: "somethingnew.url",
          },
          beforeSignIn: {
            functionUri: "beforesignin.url",
          },
        },
        forwardInboundCredentials: {
          accessToken: true,
        },
      };
      const newBlockingConfig: identityPlatform.BlockingFunctionsConfig = {
        triggers: {
          beforeCreate: {},
          beforeSignIn: {
            functionUri: "beforesignin.url",
          },
        },
        forwardInboundCredentials: {
          accessToken: true,
        },
      };
      const ep: backend.Endpoint = {
        ...BASE_EP,
        platform: "gcfv1",
        uri: "somethingnew.url",
        blockingTrigger: {
          eventType: BEFORE_CREATE_EVENT,
          accessToken: false,
          idToken: true,
          refreshToken: false,
        },
      };
      getConfig.resolves(blockingConfig);
      setConfig.resolves(newBlockingConfig);

      await authBlocking.unregisterTrigger(ep);

      expect(blockingConfig).to.deep.equal(newBlockingConfig);
      expect(setConfig).to.have.been.calledWith("project", newBlockingConfig);
    });

    it("should unregister a beforeSignIn endpoint", async () => {
      const blockingConfig: identityPlatform.BlockingFunctionsConfig = {
        triggers: {
          beforeCreate: {
            functionUri: "beforecreate.url",
          },
          beforeSignIn: {
            functionUri: "somethingnew.url",
          },
        },
        forwardInboundCredentials: {
          accessToken: true,
        },
      };
      const newBlockingConfig: identityPlatform.BlockingFunctionsConfig = {
        triggers: {
          beforeCreate: {
            functionUri: "beforecreate.url",
          },
          beforeSignIn: {},
        },
        forwardInboundCredentials: {
          accessToken: true,
        },
      };
      const ep: backend.Endpoint = {
        ...BASE_EP,
        platform: "gcfv1",
        uri: "somethingnew.url",
        blockingTrigger: {
          eventType: BEFORE_SIGN_IN_EVENT,
          accessToken: false,
          idToken: true,
          refreshToken: false,
        },
      };
      getConfig.resolves(blockingConfig);
      setConfig.resolves(newBlockingConfig);

      await authBlocking.unregisterTrigger(ep);

      expect(blockingConfig).to.deep.equal(newBlockingConfig);
      expect(setConfig).to.have.been.calledWith("project", newBlockingConfig);
    });
  });
});
