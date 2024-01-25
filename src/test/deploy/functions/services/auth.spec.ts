import * as auth from "../../../../deploy/functions/services/auth";
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

const authBlockingService = new auth.AuthBlockingService();

describe("authBlocking", () => {
  let getConfig: sinon.SinonStub;
  let setConfig: sinon.SinonStub;

  beforeEach(() => {
    getConfig = sinon
      .stub(identityPlatform, "getBlockingFunctionsConfig")
      .rejects(new Error("Unexpected call to getBlockingFunctionsConfig"));
    setConfig = sinon
      .stub(identityPlatform, "setBlockingFunctionsConfig")
      .rejects(new Error("Unexpected call to setBlockingFunctionsConfig"));
  });

  afterEach(() => {
    sinon.verifyAndRestore();
  });

  describe("validateBlockingTrigger", () => {
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

      expect(() => authBlockingService.validateTrigger(ep1, backend.of(ep1, ep2))).to.throw(
        `Can only create at most one Auth Blocking Trigger for ${BEFORE_CREATE_EVENT} events`,
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

      expect(() => authBlockingService.validateTrigger(ep1, backend.of(ep1, ep2))).to.throw(
        `Can only create at most one Auth Blocking Trigger for ${BEFORE_SIGN_IN_EVENT} events`,
      );
    });

    it("should not throw on valid blocking endpoints", () => {
      const ep1: backend.Endpoint = {
        ...BASE_EP,
        platform: "gcfv1",
        id: "id1",
        entryPoint: "func1",
        blockingTrigger: {
          eventType: BEFORE_CREATE_EVENT,
          options: {
            accessToken: false,
            idToken: true,
          },
        },
      };
      const ep2: backend.Endpoint = {
        ...BASE_EP,
        platform: "gcfv1",
        id: "id2",
        entryPoint: "func2",
        blockingTrigger: {
          eventType: BEFORE_SIGN_IN_EVENT,
          options: {
            accessToken: true,
          },
        },
      };
      const want: backend.Backend = {
        ...backend.of(ep1, ep2),
      };

      expect(() => authBlockingService.validateTrigger(ep1, want)).to.not.throw();
    });
  });

  describe("registerBlockingTrigger", () => {
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
          options: {
            accessToken: false,
            idToken: true,
            refreshToken: false,
          },
        },
      };
      getConfig.resolves(blockingConfig);
      setConfig.resolves(newBlockingConfig);

      await authBlockingService.registerTrigger(ep);

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
          options: {
            accessToken: false,
            idToken: true,
            refreshToken: false,
          },
        },
      };
      getConfig.resolves(blockingConfig);
      setConfig.resolves(newBlockingConfig);

      await authBlockingService.registerTrigger(ep);

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
          options: {
            accessToken: false,
            idToken: true,
            refreshToken: false,
          },
        },
      };
      getConfig.resolves(blockingConfig);
      setConfig.resolves(newBlockingConfig);

      await authBlockingService.registerTrigger(ep);

      expect(setConfig).to.have.been.calledWith("project", newBlockingConfig);
    });

    it("should do not set the config if the config is unchanged", async () => {
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
      const ep: backend.Endpoint = {
        ...BASE_EP,
        platform: "gcfv1",
        uri: "somethingnew.url",
        blockingTrigger: {
          eventType: BEFORE_CREATE_EVENT,
          options: {
            accessToken: true,
          },
        },
      };
      getConfig.resolves(blockingConfig);

      await authBlockingService.registerTrigger(ep);

      expect(setConfig).to.not.have.been.called;
    });
  });

  describe("unregisterBlockingTrigger", () => {
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
          options: {
            accessToken: false,
            idToken: true,
            refreshToken: false,
          },
        },
      };
      getConfig.resolves(blockingConfig);

      await authBlockingService.unregisterTrigger(ep);

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
          options: {
            accessToken: false,
            idToken: true,
            refreshToken: false,
          },
        },
      };
      getConfig.resolves(blockingConfig);

      await authBlockingService.unregisterTrigger(ep);

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
          options: {
            accessToken: false,
            idToken: true,
            refreshToken: false,
          },
        },
      };
      getConfig.resolves(blockingConfig);
      setConfig.resolves(newBlockingConfig);

      await authBlockingService.unregisterTrigger(ep);

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
          options: {
            accessToken: false,
            idToken: true,
            refreshToken: false,
          },
        },
      };
      getConfig.resolves(blockingConfig);
      setConfig.resolves(newBlockingConfig);

      await authBlockingService.unregisterTrigger(ep);

      expect(setConfig).to.have.been.calledWith("project", newBlockingConfig);
    });

    it("should unregister a beforeSignIn endpoint that was registered to both event types", async () => {
      const blockingConfig: identityPlatform.BlockingFunctionsConfig = {
        triggers: {
          beforeCreate: {
            functionUri: "somethingnew.url",
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
        triggers: {},
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
          options: {
            accessToken: false,
            idToken: true,
            refreshToken: false,
          },
        },
      };
      getConfig.resolves(blockingConfig);
      setConfig.resolves(newBlockingConfig);

      await authBlockingService.unregisterTrigger(ep);

      expect(setConfig).to.have.been.calledWith("project", newBlockingConfig);
    });
  });
});
