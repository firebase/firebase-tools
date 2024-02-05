import { expect } from "chai";
import * as sinon from "sinon";

import { FirebaseError } from "../../../error";
import * as args from "../../../deploy/functions/args";
import * as backend from "../../../deploy/functions/backend";
import * as gcf from "../../../gcp/cloudfunctions";
import * as gcfV2 from "../../../gcp/cloudfunctionsv2";
import * as utils from "../../../utils";
import * as projectConfig from "../../../functions/projectConfig";

describe("Backend", () => {
  const FUNCTION_NAME: backend.TargetIds = {
    id: "id",
    region: "region",
    project: "project",
  };

  const ENDPOINT: Omit<backend.Endpoint, "httpsTrigger"> = {
    platform: "gcfv1",
    ...FUNCTION_NAME,
    entryPoint: "function",
    runtime: "nodejs16",
    codebase: projectConfig.DEFAULT_CODEBASE,
  };

  const CLOUD_FUNCTION: Omit<gcf.CloudFunction, gcf.OutputOnlyFields> = {
    name: "projects/project/locations/region/functions/id",
    entryPoint: "function",
    runtime: "nodejs16",
  };

  const CLOUD_FUNCTION_V2_SOURCE: gcfV2.StorageSource = {
    bucket: "sample",
    object: "source.zip",
    generation: 42,
  };

  const CLOUD_FUNCTION_V2: gcfV2.InputCloudFunction = {
    name: "projects/project/locations/region/functions/id",
    buildConfig: {
      entryPoint: "function",
      runtime: "nodejs16",
      source: {
        storageSource: CLOUD_FUNCTION_V2_SOURCE,
      },
      environmentVariables: {},
    },
    serviceConfig: {
      service: "projects/project/locations/region/services/service",
      availableCpu: "1",
      maxInstanceRequestConcurrency: 80,
    },
  };
  const RUN_URI = "https://id-nonce-region-project.run.app";
  const HAVE_CLOUD_FUNCTION_V2: gcfV2.OutputCloudFunction = {
    ...CLOUD_FUNCTION_V2,
    serviceConfig: {
      service: "service",
      uri: RUN_URI,
      availableCpu: "1",
      maxInstanceRequestConcurrency: 80,
    },
    state: "ACTIVE",
    updateTime: new Date(),
  };

  const HAVE_CLOUD_FUNCTION: gcf.CloudFunction = {
    ...CLOUD_FUNCTION,
    buildId: "buildId",
    versionId: 1,
    updateTime: new Date(),
    status: "ACTIVE",
  };

  describe("Helper functions", () => {
    it("isEmptyBackend", () => {
      expect(backend.isEmptyBackend(backend.empty())).to.be.true;
      expect(
        backend.isEmptyBackend({
          ...backend.empty(),
          requiredAPIs: [{ api: "foo.googleapis.com", reason: "foo" }],
        }),
      ).to.be.false;
      expect(backend.isEmptyBackend(backend.of({ ...ENDPOINT, httpsTrigger: {} })));
    });

    it("names", () => {
      expect(backend.functionName(ENDPOINT)).to.equal(
        "projects/project/locations/region/functions/id",
      );
    });

    it("merge", () => {
      const BASE_ENDPOINT = { ...ENDPOINT, httpsTrigger: {} };
      const e1 = { ...BASE_ENDPOINT, id: "1" };
      const e21 = { ...BASE_ENDPOINT, id: "2.1" };
      const e22 = { ...BASE_ENDPOINT, id: "2.2" };
      const e3 = { ...BASE_ENDPOINT, id: "3" };

      const b1 = backend.of(e1);
      b1.environmentVariables = { foo: "bar" };
      b1.requiredAPIs = [
        { reason: "a", api: "a.com" },
        { reason: "b", api: "b.com" },
      ];

      const b2 = backend.of(e21, e22);
      b2.environmentVariables = { bar: "foo" };

      const b3 = backend.of(e3);
      b3.requiredAPIs = [{ reason: "a", api: "a.com" }];

      const got = backend.merge(b3, b2, b1);
      expect(backend.allEndpoints(got)).to.have.deep.members([e1, e21, e22, e3]);
      expect(got.environmentVariables).to.deep.equal({ foo: "bar", bar: "foo" });
      expect(got.requiredAPIs).to.have.deep.members([
        { reason: "a", api: "a.com" },
        { reason: "b", api: "b.com" },
      ]);
    });
  });

  describe("existing backend", () => {
    let listAllFunctions: sinon.SinonStub;
    let listAllFunctionsV2: sinon.SinonStub;
    let logLabeledWarning: sinon.SinonSpy;

    beforeEach(() => {
      listAllFunctions = sinon.stub(gcf, "listAllFunctions").rejects("Unexpected call");
      listAllFunctionsV2 = sinon.stub(gcfV2, "listAllFunctions").rejects("Unexpected v2 call");
      logLabeledWarning = sinon.spy(utils, "logLabeledWarning");
    });

    afterEach(() => {
      listAllFunctions.restore();
      listAllFunctionsV2.restore();
      logLabeledWarning.restore();
    });

    function newContext(): args.Context {
      return {} as args.Context;
    }

    describe("existingBackend", () => {
      it("should throw error when functions list fails", async () => {
        const context = newContext();
        listAllFunctions.rejects(new FirebaseError("Failed to list functions"));

        await expect(backend.existingBackend(context)).to.be.rejected;
      });

      it("should cache", async () => {
        const context = newContext();
        listAllFunctions.onFirstCall().resolves({
          functions: [
            {
              ...HAVE_CLOUD_FUNCTION,
              httpsTrigger: {},
            },
          ],
          unreachable: ["region"],
        });
        listAllFunctionsV2.onFirstCall().resolves({
          functions: [],
          unreachable: [],
        });
        const firstBackend = await backend.existingBackend(context);

        const secondBackend = await backend.existingBackend(context);
        await backend.checkAvailability(context, backend.empty());

        expect(firstBackend).to.deep.equal(secondBackend);
        expect(listAllFunctions).to.be.calledOnce;
        expect(listAllFunctionsV2).to.be.calledOnce;
      });

      it("should translate functions", async () => {
        listAllFunctions.onFirstCall().resolves({
          functions: [
            {
              ...HAVE_CLOUD_FUNCTION,
              httpsTrigger: {},
            },
          ],
          unreachable: [],
        });
        listAllFunctionsV2.onFirstCall().resolves({
          functions: [],
          unreachable: [],
        });
        const have = await backend.existingBackend(newContext());

        expect(have).to.deep.equal(backend.of({ ...ENDPOINT, httpsTrigger: {} }));
      });

      it("should throw an error if v2 list api throws an error", async () => {
        listAllFunctions.onFirstCall().resolves({
          functions: [],
          unreachable: [],
        });
        listAllFunctionsV2.throws(
          new FirebaseError("HTTP Error: 500, Internal Error", { status: 500 }),
        );

        await expect(backend.existingBackend(newContext())).to.be.rejectedWith(
          "HTTP Error: 500, Internal Error",
        );
      });

      it("should read v1 functions only when user is not allowlisted for v2", async () => {
        listAllFunctions.onFirstCall().resolves({
          functions: [
            {
              ...HAVE_CLOUD_FUNCTION,
              httpsTrigger: {},
            },
          ],
          unreachable: [],
        });
        listAllFunctionsV2.throws(
          new FirebaseError("HTTP Error: 404, Method not found", { status: 404 }),
        );

        const have = await backend.existingBackend(newContext());

        expect(have).to.deep.equal(backend.of({ ...ENDPOINT, httpsTrigger: {} }));
      });

      it("should throw an error if v2 list api throws an error", async () => {
        listAllFunctions.onFirstCall().resolves({
          functions: [],
          unreachable: [],
        });
        listAllFunctionsV2.throws(
          new FirebaseError("HTTP Error: 500, Internal Error", { status: 500 }),
        );

        await expect(backend.existingBackend(newContext())).to.be.rejectedWith(
          "HTTP Error: 500, Internal Error",
        );
      });

      it("should read v1 functions only when user is not allowlisted for v2", async () => {
        listAllFunctions.onFirstCall().resolves({
          functions: [
            {
              ...HAVE_CLOUD_FUNCTION,
              httpsTrigger: {},
            },
          ],
          unreachable: [],
        });
        listAllFunctionsV2.throws(
          new FirebaseError("HTTP Error: 404, Method not found", { status: 404 }),
        );

        const have = await backend.existingBackend(newContext());

        expect(have).to.deep.equal(backend.of({ ...ENDPOINT, httpsTrigger: {} }));
      });

      it("should read v2 functions when enabled", async () => {
        listAllFunctions.onFirstCall().resolves({
          functions: [],
          unreachable: [],
        });
        listAllFunctionsV2.onFirstCall().resolves({
          functions: [HAVE_CLOUD_FUNCTION_V2],
          unreachable: [],
        });
        const have = await backend.existingBackend(newContext());

        expect(have).to.deep.equal(
          backend.of({
            ...ENDPOINT,
            platform: "gcfv2",
            concurrency: 80,
            cpu: 1,
            httpsTrigger: {},
            runServiceId: HAVE_CLOUD_FUNCTION_V2.serviceConfig?.service,
            source: HAVE_CLOUD_FUNCTION_V2.buildConfig.source,
            uri: HAVE_CLOUD_FUNCTION_V2.serviceConfig?.uri,
          }),
        );
      });

      it("should deduce features of scheduled functions", async () => {
        listAllFunctions.onFirstCall().resolves({
          functions: [
            {
              ...HAVE_CLOUD_FUNCTION,
              eventTrigger: {
                eventType: "google.pubsub.topic.publish",
                resource: "projects/project/topics/topic",
              },
              labels: {
                "deployment-scheduled": "true",
              },
            },
          ],
          unreachable: [],
        });
        listAllFunctionsV2.onFirstCall().resolves({
          functions: [],
          unreachable: [],
        });
        const have = await backend.existingBackend(newContext());
        const want = backend.of({
          ...ENDPOINT,
          scheduleTrigger: {},
          labels: {
            "deployment-scheduled": "true",
          },
        });

        expect(have).to.deep.equal(want);
      });
    });

    describe("checkAvailability", () => {
      it("should throw error when functions list fails", async () => {
        const context = newContext();
        listAllFunctions.rejects(new FirebaseError("Failed to list functions"));

        await expect(backend.checkAvailability(context, backend.empty())).to.be.rejected;
      });

      it("should do nothing when regions are all avalable", async () => {
        listAllFunctions.onFirstCall().resolves({
          functions: [],
          unreachable: [],
        });
        listAllFunctionsV2.onFirstCall().resolves({
          functions: [],
          unreachable: [],
        });

        await backend.checkAvailability(newContext(), backend.empty());

        expect(listAllFunctions).to.have.been.called;
        expect(listAllFunctionsV2).to.have.been.called;
        expect(logLabeledWarning).to.not.have.been.called;
      });

      it("should warn if an unused GCFv1 backend is unavailable", async () => {
        listAllFunctions.onFirstCall().resolves({
          functions: [],
          unreachable: ["region"],
        });
        listAllFunctionsV2.resolves({
          functions: [],
          unreachable: [],
        });

        await backend.checkAvailability(newContext(), backend.empty());

        expect(listAllFunctions).to.have.been.called;
        expect(listAllFunctionsV2).to.have.been.called;
        expect(logLabeledWarning).to.have.been.called;
      });

      it("should warn if an unused GCFv2 backend is unavailable", async () => {
        listAllFunctions.onFirstCall().resolves({
          functions: [],
          unreachable: [],
        });
        listAllFunctionsV2.onFirstCall().resolves({
          functions: [],
          unreachable: ["region"],
        });

        await backend.checkAvailability(newContext(), backend.empty());

        expect(listAllFunctions).to.have.been.called;
        expect(listAllFunctionsV2).to.have.been.called;
        expect(logLabeledWarning).to.have.been.called;
      });

      it("should throw if a needed GCFv1 region is unavailable", async () => {
        listAllFunctions.onFirstCall().resolves({
          functions: [],
          unreachable: ["region"],
        });
        listAllFunctionsV2.resolves({
          functions: [],
          unreachable: [],
        });
        const want = backend.of({ ...ENDPOINT, httpsTrigger: {} });
        await expect(backend.checkAvailability(newContext(), want)).to.eventually.be.rejectedWith(
          FirebaseError,
          /The following Cloud Functions regions are currently unreachable:/,
        );
      });

      it("should throw if a GCFv2 needed region is unavailable", async () => {
        listAllFunctions.onFirstCall().resolves({
          functions: [],
          unreachable: [],
        });
        listAllFunctionsV2.onFirstCall().resolves({
          functions: [],
          unreachable: ["region"],
        });
        const want: backend.Backend = backend.of({
          ...ENDPOINT,
          platform: "gcfv2",
          httpsTrigger: {},
        });

        await expect(backend.checkAvailability(newContext(), want)).to.eventually.be.rejectedWith(
          FirebaseError,
          /The following Cloud Functions V2 regions are currently unreachable:/,
        );
      });

      it("Should only warn when deploying GCFv1 and GCFv2 is unavailable.", async () => {
        listAllFunctions.onFirstCall().resolves({
          functions: [],
          unreachable: [],
        });
        listAllFunctionsV2.onFirstCall().resolves({
          functions: [],
          unreachable: ["us-central1"],
        });

        const want = backend.of({ ...ENDPOINT, httpsTrigger: {} });
        await backend.checkAvailability(newContext(), want);

        expect(listAllFunctions).to.have.been.called;
        expect(listAllFunctionsV2).to.have.been.called;
        expect(logLabeledWarning).to.have.been.called;
      });

      it("Should only warn when deploying GCFv2 and GCFv1 is unavailable.", async () => {
        listAllFunctions.onFirstCall().resolves({
          functions: [],
          unreachable: ["us-central1"],
        });
        listAllFunctionsV2.onFirstCall().resolves({
          functions: [],
          unreachable: [],
        });

        const want: backend.Backend = backend.of({ ...ENDPOINT, httpsTrigger: {} });
        await backend.checkAvailability(newContext(), want);

        expect(listAllFunctions).to.have.been.called;
        expect(listAllFunctionsV2).to.have.been.called;
        expect(logLabeledWarning).to.have.been.called;
      });
    });
  });

  describe("compareFunctions", () => {
    const fnMembers = {
      project: "project",
      runtime: "nodejs14",
      httpsTrigger: {},
    };

    it("should compare different platforms", () => {
      const left: backend.Endpoint = {
        id: "v1",
        region: "us-central1",
        platform: "gcfv1",
        entryPoint: "v1",
        ...fnMembers,
      };
      const right: backend.Endpoint = {
        id: "v2",
        region: "us-west1",
        platform: "gcfv2",
        entryPoint: "v2",
        ...fnMembers,
      };

      expect(backend.compareFunctions(left, right)).to.eq(1);
      expect(backend.compareFunctions(right, left)).to.eq(-1);
    });

    it("should compare different regions, same platform", () => {
      const left: backend.Endpoint = {
        id: "v1",
        region: "us-west1",
        platform: "gcfv1",
        entryPoint: "v1",
        ...fnMembers,
      };
      const right: backend.Endpoint = {
        id: "newV1",
        region: "us-central1",
        platform: "gcfv1",
        entryPoint: "newV1",
        ...fnMembers,
      };

      expect(backend.compareFunctions(left, right)).to.eq(1);
      expect(backend.compareFunctions(right, left)).to.eq(-1);
    });

    it("should compare different ids, same platform & region", () => {
      const left: backend.Endpoint = {
        id: "v1",
        region: "us-central1",
        platform: "gcfv1",
        entryPoint: "v1",
        ...fnMembers,
      };
      const right: backend.Endpoint = {
        id: "newV1",
        region: "us-central1",
        platform: "gcfv1",
        entryPoint: "newV1",
        ...fnMembers,
      };

      expect(backend.compareFunctions(left, right)).to.eq(1);
      expect(backend.compareFunctions(right, left)).to.eq(-1);
    });

    it("should compare same ids", () => {
      const left: backend.Endpoint = {
        id: "v1",
        region: "us-central1",
        platform: "gcfv1",
        entryPoint: "v1",
        ...fnMembers,
      };
      const right: backend.Endpoint = {
        id: "v1",
        region: "us-central1",
        platform: "gcfv1",
        entryPoint: "v1",
        ...fnMembers,
      };

      expect(backend.compareFunctions(left, right)).to.eq(0);
    });
  });

  describe("comprehension helpers", () => {
    const endpointUS: backend.Endpoint = {
      id: "endpointUS",
      project: "project",
      region: "us-west1",
      platform: "gcfv2",
      runtime: "nodejs16",
      entryPoint: "ep",
      httpsTrigger: {},
    };

    const endpointEU: backend.Endpoint = {
      ...endpointUS,
      id: "endpointEU",
      region: "europe-west1",
    };

    const bkend: backend.Backend = {
      ...backend.empty(),
    };
    bkend.endpoints[endpointUS.region] = { [endpointUS.id]: endpointUS };
    bkend.endpoints[endpointEU.region] = { [endpointEU.id]: endpointEU };
    bkend.requiredAPIs = [{ api: "api.google.com", reason: "required" }];

    it("allEndpoints", () => {
      const have = backend.allEndpoints(bkend).sort(backend.compareFunctions);
      const want = [endpointUS, endpointEU].sort(backend.compareFunctions);
      expect(have).to.deep.equal(want);
    });

    it("matchingBackend", () => {
      const have = backend.matchingBackend(bkend, (fn) => fn.id === "endpointUS");
      const want: backend.Backend = {
        ...backend.empty(),
        endpoints: {
          [endpointUS.region]: {
            [endpointUS.id]: endpointUS,
          },
        },
        requiredAPIs: [{ api: "api.google.com", reason: "required" }],
      };
      expect(have).to.deep.equal(want);
    });

    it("someEndpoint", () => {
      expect(backend.someEndpoint(bkend, (fn) => fn.id === "endpointUS")).to.be.true;
      expect(backend.someEndpoint(bkend, (fn) => fn.id === "missing")).to.be.false;
    });

    it("findEndpoint", () => {
      expect(backend.findEndpoint(bkend, (fn) => fn.id === "endpointUS")).to.be.deep.equal(
        endpointUS,
      );
      expect(backend.findEndpoint(bkend, (fn) => fn.id === "missing")).to.be.undefined;
    });

    it("regionalEndpoints", () => {
      const have = backend.regionalEndpoints(bkend, endpointUS.region);
      const want = [endpointUS];
      expect(have).to.deep.equal(want);
    });

    it("hasEndpoint", () => {
      const smallBackend = backend.matchingBackend(bkend, (fn) => fn.id === "endpointUS");
      expect(backend.hasEndpoint(smallBackend)(endpointUS)).to.be.true;
      expect(backend.hasEndpoint(smallBackend)(endpointEU)).to.be.false;
    });

    it("missingEndpoint", () => {
      const smallBackend = backend.matchingBackend(bkend, (fn) => fn.id === "endpointUS");
      expect(backend.missingEndpoint(smallBackend)(endpointUS)).to.be.false;
      expect(backend.missingEndpoint(smallBackend)(endpointEU)).to.be.true;
    });
  });
});
