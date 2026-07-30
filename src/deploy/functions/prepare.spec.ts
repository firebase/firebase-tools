import { expect } from "chai";
import * as sinon from "sinon";
import * as build from "./build";
import * as prepare from "./prepare";
import * as runtimes from "./runtimes";
import * as backend from "./backend";
import * as ensureApiEnabled from "../../ensureApiEnabled";
import * as firestore from "../../gcp/firestore";
import * as storage from "../../gcp/storage";
import * as database from "../../management/database";
import * as firestoreService from "./services/firestore";
import * as storageService from "./services/storage";
import * as databaseService from "./services/database";
import * as serviceusage from "../../gcp/serviceusage";
import * as prompt from "../../prompt";
import * as iam from "../../gcp/iam";
import * as resourcemanager from "../../gcp/resourceManager";
import { RuntimeDelegate } from "./runtimes";
import { FirebaseError } from "../../error";
import { Options } from "../../options";
import { ValidatedConfig } from "../../functions/projectConfig";
import { BEFORE_CREATE_EVENT, BEFORE_SIGN_IN_EVENT } from "../../functions/events/v1";
import { latest } from "./runtimes/supported";

describe("partition env helper", () => {
  it("splits a Record into two based on which keys begin with FIREBASE_SECRET_REF", () => {
    const input = {
      foo: "bar",
      FIREBASE_SECRET_REF_baz: "quux",
    } as Record<string, string>;
    const { userEnvs: userEnvs, secretRefs: secretRefs } = prepare.partitionUserEnvs(input);
    expect(userEnvs).to.deep.equal({ foo: "bar" });
    expect(secretRefs).to.deep.equal({ baz: "quux" });
  });
});

describe("prepare", () => {
  const ENDPOINT_BASE: Omit<backend.Endpoint, "httpsTrigger"> = {
    platform: "gcfv2",
    id: "id",
    region: "region",
    project: "project",
    entryPoint: "entry",
    runtime: latest("nodejs"),
  };

  const ENDPOINT: backend.Endpoint = {
    ...ENDPOINT_BASE,
    httpsTrigger: {},
  };

  describe("loadCodebases", () => {
    let sandbox: sinon.SinonSandbox;
    let runtimeDelegateStub: RuntimeDelegate;
    let discoverBuildStub: sinon.SinonStub;

    beforeEach(() => {
      sandbox = sinon.createSandbox();
      discoverBuildStub = sandbox.stub();
      runtimeDelegateStub = {
        language: "nodejs",
        runtime: latest("nodejs"),
        bin: "node",
        validate: sandbox.stub().resolves(),
        build: sandbox.stub().resolves(),
        watch: sandbox.stub().resolves(() => Promise.resolve()),
        discoverBuild: discoverBuildStub,
      };
      discoverBuildStub.resolves(
        build.of({
          test: {
            platform: "gcfv2",
            entryPoint: "test",
            project: "project",
            runtime: latest("nodejs"),
            httpsTrigger: {},
          },
        }),
      );
      sandbox.stub(runtimes, "getRuntimeDelegate").resolves(runtimeDelegateStub);
    });

    afterEach(() => {
      sandbox.restore();
    });

    it("should apply the prefix to the function name", async () => {
      const config: ValidatedConfig = [
        { source: "source", codebase: "codebase", prefix: "my-prefix", runtime: "nodejs22" },
      ];
      const options = {
        config: {
          path: (p: string) => p,
        },
        projectId: "project",
      } as unknown as Options;
      const firebaseConfig = { projectId: "project" };
      const runtimeConfig = {};

      const builds = await prepare.loadCodebases(config, options, firebaseConfig, runtimeConfig);

      expect(Object.keys(builds.codebase.endpoints)).to.deep.equal(["my-prefix-test"]);
    });

    it("should preserve runtime from codebase config", async () => {
      const config: ValidatedConfig = [
        { source: "source", codebase: "codebase", runtime: "nodejs20" },
      ];
      const options = {
        config: {
          path: (p: string) => p,
        },
        projectId: "project",
      } as unknown as Options;
      const firebaseConfig = { projectId: "project" };
      const runtimeConfig = {};

      const builds = await prepare.loadCodebases(config, options, firebaseConfig, runtimeConfig);

      expect(builds.codebase.runtime).to.equal("nodejs20");
    });

    it("should throw and print valid versions in the 'invalid runtime' error message", async () => {
      const config: ValidatedConfig = [
        {
          source: "source",
          codebase: "codebase",
          // @ts-expect-error the runtime is intentionally invalid
          runtime: "does-not-exist",
        },
      ];
      const options = {
        config: {
          path: (p: string) => p,
        },
        projectId: "project",
      } as unknown as Options;
      const firebaseConfig = { projectId: "project" };
      const runtimeConfig = {};

      await expect(prepare.loadCodebases(config, options, firebaseConfig, runtimeConfig))
        .to.be.rejectedWith(FirebaseError)
        .then((error) => {
          // Should always list latest runtimes
          expect(error.message).to.include(latest("nodejs"));
          expect(error.message).to.include(latest("python"));

          // Should never list a decommissioned runtime
          expect(error.message).to.not.include("nodejs6");
        });
    });

    it("should pass only firebase config when disallowLegacyRuntimeConfig is true", async () => {
      const config: ValidatedConfig = [
        {
          source: "source",
          codebase: "codebase",
          disallowLegacyRuntimeConfig: true,
          runtime: "nodejs22",
        },
      ];
      const options = {
        config: {
          path: (p: string) => p,
        },
        projectId: "project",
      } as unknown as Options;
      const firebaseConfig = { projectId: "project" };
      const runtimeConfig = { firebase: firebaseConfig, customKey: "customValue" };

      await prepare.loadCodebases(config, options, firebaseConfig, runtimeConfig);

      expect(discoverBuildStub.calledOnce).to.be.true;
      const callArgs = discoverBuildStub.firstCall.args;
      expect(callArgs[0]).to.deep.equal({ firebase: firebaseConfig });
      expect(callArgs[0]).to.not.have.property("customKey");
    });

    it("should pass full runtime config when disallowLegacyRuntimeConfig is false", async () => {
      const config: ValidatedConfig = [
        {
          source: "source",
          codebase: "codebase",
          disallowLegacyRuntimeConfig: false,
          runtime: "nodejs22",
        },
      ];
      const options = {
        config: {
          path: (p: string) => p,
        },
        projectId: "project",
      } as unknown as Options;
      const firebaseConfig = { projectId: "project" };
      const runtimeConfig = { firebase: firebaseConfig, customKey: "customValue" };

      await prepare.loadCodebases(config, options, firebaseConfig, runtimeConfig);

      expect(discoverBuildStub.calledOnce).to.be.true;
      const callArgs = discoverBuildStub.firstCall.args;
      expect(callArgs[0]).to.deep.equal(runtimeConfig);
      expect(callArgs[0]).to.have.property("customKey", "customValue");
    });
  });

  describe("resolveDefaultRegionsForBuild", () => {
    let sandbox: sinon.SinonSandbox;
    let getDatabaseStub: sinon.SinonStub;
    let getBucketStub: sinon.SinonStub;
    let getDatabaseInstanceDetailsStub: sinon.SinonStub;

    beforeEach(() => {
      sandbox = sinon.createSandbox();
      firestoreService.clearCache();
      storageService.clearCache();
      databaseService.clearCache();
      getDatabaseStub = sandbox.stub(firestore, "getDatabase");
      getBucketStub = sandbox.stub(storage, "getBucket");
      getDatabaseInstanceDetailsStub = sandbox.stub(database, "getDatabaseInstanceDetails");
    });

    afterEach(() => {
      sandbox.restore();
    });

    it("does nothing if no endpoints or in REGION_TBD", async () => {
      const want = build.empty();
      const have = backend.empty();
      await prepare.resolveDefaultRegionsForBuild(want, have);
      expect(want.endpoints).to.deep.equal({});
    });

    it("infers region from have backend if unique", async () => {
      const want = build.of({
        id: {
          platform: "gcfv2",
          entryPoint: "entry",
          project: "project",
          runtime: latest("nodejs"),
          httpsTrigger: {},
          region: [build.REGION_TBD],
        },
      });

      const haveE = { ...ENDPOINT, region: "us-east1" };
      const have = backend.of(haveE);

      await prepare.resolveDefaultRegionsForBuild(want, have);

      expect(want.endpoints["id"].region).to.deep.equal(["us-east1"]);
    });

    it("resolves region to us-east1 and correctly formats VPC connector path with us-east1", async () => {
      const want = build.of({
        id: {
          platform: "gcfv2",
          entryPoint: "entry",
          project: "project",
          runtime: latest("nodejs"),
          httpsTrigger: {},
          region: [build.REGION_TBD],
          vpc: {
            connector: "my-connector",
          },
        },
      });

      const haveE = { ...ENDPOINT, id: "id", region: "us-east1" };
      const have = backend.of(haveE);

      await prepare.resolveDefaultRegionsForBuild(want, have);
      expect(want.endpoints["id"].region).to.deep.equal(["us-east1"]);

      const backendResult = build.toBackend(want, {});
      const endpointDef = backendResult.endpoints["us-east1"]?.["id"];
      expect(endpointDef).to.not.be.undefined;
      expect(endpointDef?.vpc?.connector).to.equal(
        "projects/project/locations/us-east1/connectors/my-connector",
      );
    });

    it("resolves region and preserves pre-formatted VPC connector paths", async () => {
      const want = build.of({
        id: {
          platform: "gcfv2",
          entryPoint: "entry",
          project: "project",
          runtime: latest("nodejs"),
          httpsTrigger: {},
          region: [build.REGION_TBD],
          vpc: {
            connector: "projects/my-project/locations/us-central1/connectors/my-connector",
          },
        },
      });

      const haveE = { ...ENDPOINT, id: "id", region: "us-east1" };
      const have = backend.of(haveE);

      await prepare.resolveDefaultRegionsForBuild(want, have);
      expect(want.endpoints["id"].region).to.deep.equal(["us-east1"]);

      const backendResult = build.toBackend(want, {});
      const endpointDef = backendResult.endpoints["us-east1"]?.["id"];
      expect(endpointDef).to.not.be.undefined;
      expect(endpointDef?.vpc?.connector).to.equal(
        "projects/my-project/locations/us-central1/connectors/my-connector",
      );
    });

    it("throws error if ambiguous", async () => {
      const want = build.of({
        id: {
          platform: "gcfv2",
          entryPoint: "entry",
          project: "project",
          runtime: latest("nodejs"),
          httpsTrigger: {},
          region: [build.REGION_TBD],
        },
      });

      const haveE1 = { ...ENDPOINT, id: "id", region: "us-east1" };
      const haveE2 = { ...ENDPOINT, id: "id", region: "us-west1" };
      const have = backend.of(haveE1, haveE2);

      await expect(prepare.resolveDefaultRegionsForBuild(want, have)).to.be.rejectedWith(
        FirebaseError,
        /Cannot resolve default region for function id. It exists in multiple regions. The region must be specified to continue./,
      );
    });

    it("resolves us-east1 for global resource blocking triggers", async () => {
      const want = build.of({
        beforeCreate: {
          platform: "gcfv2",
          entryPoint: "entry",
          project: "project",
          runtime: latest("nodejs"),
          blockingTrigger: {
            eventType: "providers/cloud.auth/eventTypes/user.beforeCreate",
          },
        },
      });
      const have = backend.empty();

      await prepare.resolveDefaultRegionsForBuild(want, have);

      expect(want.endpoints["beforeCreate"].region).to.deep.equal(["us-east1"]);
    });

    it("resolves us-east1 for global event triggers", async () => {
      const want = build.of({
        onPublish: {
          platform: "gcfv2",
          entryPoint: "entry",
          project: "project",
          runtime: latest("nodejs"),
          eventTrigger: {
            eventType: "google.cloud.pubsub.topic.v1.messagePublished",
            retry: false,
          },
          region: [build.REGION_TBD],
        },
      });
      const have = backend.empty();

      await prepare.resolveDefaultRegionsForBuild(want, have);

      expect(want.endpoints["onPublish"].region).to.deep.equal(["us-east1"]);
    });

    describe("Firestore event triggers", () => {
      const testCases = [
        { dbLocation: "nam5", expectedRegion: "us-central1" },
        { dbLocation: "nam7", expectedRegion: "us-central1" },
        { dbLocation: "eur3", expectedRegion: "europe-west1" },
        { dbLocation: "asia-northeast1", expectedRegion: "asia-northeast1" },
      ];

      testCases.forEach(({ dbLocation, expectedRegion }) => {
        it(`should resolve ${expectedRegion} when database location is ${dbLocation}`, async () => {
          const want = build.of({
            onDocumentCreate: {
              platform: "gcfv2",
              entryPoint: "entry",
              project: "project",
              runtime: latest("nodejs"),
              eventTrigger: {
                eventType: "google.cloud.firestore.document.v1.created",
                eventFilters: { database: "(default)" },
                retry: false,
              },
              region: [build.REGION_TBD],
            },
          });
          const have = backend.empty();

          getDatabaseStub.resolves({ locationId: dbLocation });

          await prepare.resolveDefaultRegionsForBuild(want, have);

          expect(want.endpoints["onDocumentCreate"].region).to.deep.equal([expectedRegion]);
        });
      });
    });

    describe("Storage event triggers", () => {
      const testCases = [
        { bucketLocation: "us", expectedRegion: "us-east1" },
        { bucketLocation: "eu", expectedRegion: "europe-west1" },
        { bucketLocation: "asia", expectedRegion: "asia-east1" },
        { bucketLocation: "us-central1", expectedRegion: "us-central1" },
      ];

      testCases.forEach(({ bucketLocation, expectedRegion }) => {
        it(`should resolve ${expectedRegion} when bucket location is ${bucketLocation}`, async () => {
          const want = build.of({
            onArchive: {
              platform: "gcfv2",
              entryPoint: "entry",
              project: "project",
              runtime: latest("nodejs"),
              eventTrigger: {
                eventType: "google.cloud.storage.object.v1.archived",
                eventFilters: { bucket: "my-bucket" },
                retry: false,
              },
              region: [build.REGION_TBD],
            },
          });
          const have = backend.empty();

          getBucketStub.resolves({ location: bucketLocation });

          await prepare.resolveDefaultRegionsForBuild(want, have);

          expect(want.endpoints["onArchive"].region).to.deep.equal([expectedRegion]);
        });
      });
    });

    it("resolves region for Database event triggers based on instance location", async () => {
      const want = build.of({
        onWrite: {
          platform: "gcfv2",
          entryPoint: "entry",
          project: "project",
          runtime: latest("nodejs"),
          eventTrigger: {
            eventType: "google.firebase.database.ref.v1.written",
            eventFilters: { instance: "my-instance" },
            retry: false,
          },
          region: [build.REGION_TBD],
        },
      });
      const have = backend.empty();

      getDatabaseInstanceDetailsStub.resolves({ location: "europe-west1" });

      await prepare.resolveDefaultRegionsForBuild(want, have);

      expect(want.endpoints["onWrite"].region).to.deep.equal(["europe-west1"]);
    });

    it("resolves region for DataConnect event triggers based on service location", async () => {
      const want = build.of({
        onMutationExecuted: {
          platform: "gcfv2",
          entryPoint: "entry",
          project: "project",
          runtime: latest("nodejs"),
          eventTrigger: {
            eventType: "google.firebase.dataconnect.connector.v1.mutationExecuted",
            eventFilters: {
              service: "projects/project/locations/europe-west1/services/my-service",
            },
            retry: false,
          },
          region: [build.REGION_TBD],
        },
      });
      const have = backend.empty();

      await prepare.resolveDefaultRegionsForBuild(want, have);

      expect(want.endpoints["onMutationExecuted"].region).to.deep.equal(["europe-west1"]);
    });

    it("resolves region for DataConnect event triggers based on connector location", async () => {
      const want = build.of({
        onMutationExecutedConnector: {
          platform: "gcfv2",
          entryPoint: "entry",
          project: "project",
          runtime: latest("nodejs"),
          eventTrigger: {
            eventType: "google.firebase.dataconnect.connector.v1.mutationExecuted",
            eventFilters: {
              connector:
                "projects/project/locations/europe-west2/services/my-service/connectors/my-connector",
            },
            retry: false,
          },
          region: [build.REGION_TBD],
        },
      });
      const have = backend.empty();

      await prepare.resolveDefaultRegionsForBuild(want, have);

      expect(want.endpoints["onMutationExecutedConnector"].region).to.deep.equal(["europe-west2"]);
    });

    it("does not infer region from have backend if it belongs to a different codebase", async () => {
      const want = build.of({
        id: {
          platform: "gcfv2",
          entryPoint: "entry",
          project: "project",
          runtime: latest("nodejs"),
          httpsTrigger: {},
          region: [build.REGION_TBD],
        },
      });

      const haveE = { ...ENDPOINT, id: "id", region: "europe-west1", codebase: "codebaseB" };
      const have = backend.of(haveE);

      const relevantEndpoints = backend
        .allEndpoints(have)
        .filter((e) => e.codebase === "codebaseA" || e.codebase === undefined);

      await prepare.resolveDefaultRegionsForBuild(want, backend.of(...relevantEndpoints));

      expect(want.endpoints["id"].region).to.deep.equal(["us-central1"]);
    });

    it("resolves us-east1 for global AI Logic triggers", async () => {
      const want = build.of({
        globalAI: {
          platform: "gcfv2",
          entryPoint: "entry",
          project: "project",
          runtime: latest("nodejs"),
          blockingTrigger: {
            eventType: "google.firebase.ailogic.v1.beforeGenerate",
          },
          region: [build.REGION_TBD],
        },
      });
      const have = backend.empty();

      await prepare.resolveDefaultRegionsForBuild(want, have);

      expect(want.endpoints["globalAI"].region).to.deep.equal(["us-east1"]);
    });

    it("resolves us-central1 for regional AI Logic triggers", async () => {
      const want = build.of({
        regionalAI: {
          platform: "gcfv2",
          entryPoint: "entry",
          project: "project",
          runtime: latest("nodejs"),
          blockingTrigger: {
            eventType: "google.firebase.ailogic.v1.beforeGenerate",
            options: {
              regionalWebhook: true,
            },
          },
          region: [build.REGION_TBD],
        },
      });
      const have = backend.empty();

      await prepare.resolveDefaultRegionsForBuild(want, have);

      expect(want.endpoints["regionalAI"].region).to.deep.equal(["us-central1"]);
    });

    it("falls back to us-central1 when getDatabase or getBucket throws an API error during region resolution", async () => {
      const want = build.of({
        firestoreTrigger: {
          platform: "gcfv2",
          entryPoint: "entry",
          project: "project",
          runtime: latest("nodejs"),
          eventTrigger: {
            eventType: "google.cloud.firestore.document.v1.created",
            eventFilters: { database: "(default)" },
            retry: false,
          },
          region: [build.REGION_TBD],
        },
        storageTrigger: {
          platform: "gcfv2",
          entryPoint: "entry",
          project: "project",
          runtime: latest("nodejs"),
          eventTrigger: {
            eventType: "google.cloud.storage.object.v1.archived",
            eventFilters: { bucket: "my-bucket" },
            retry: false,
          },
          region: [build.REGION_TBD],
        },
      });
      const have = backend.empty();

      getDatabaseStub.rejects(new Error("API Error fetching database location"));
      getBucketStub.rejects(new Error("API Error fetching bucket location"));

      await prepare.resolveDefaultRegionsForBuild(want, have);

      expect(want.endpoints["firestoreTrigger"].region).to.deep.equal(["us-central1"]);
      expect(want.endpoints["storageTrigger"].region).to.deep.equal(["us-central1"]);
    });
  });

  describe("inferDetailsFromExisting", () => {
    it("merges env vars if .env is not used", () => {
      const oldE = {
        ...ENDPOINT,
        environmentVariables: {
          foo: "old value",
          old: "value",
        },
      };
      const newE = {
        ...ENDPOINT,
        environmentVariables: {
          foo: "new value",
          new: "value",
        },
      };

      prepare.inferDetailsFromExisting(backend.of(newE), backend.of(oldE), /* usedDotenv= */ false);

      expect(newE.environmentVariables).to.deep.equals({
        old: "value",
        new: "value",
        foo: "new value",
      });
    });

    it("overwrites env vars if .env is used", () => {
      const oldE = {
        ...ENDPOINT,
        environmentVariables: {
          foo: "old value",
          old: "value",
        },
      };
      const newE = {
        ...ENDPOINT,
        environmentVariables: {
          foo: "new value",
          new: "value",
        },
      };

      prepare.inferDetailsFromExisting(backend.of(newE), backend.of(oldE), /* usedDotEnv= */ true);

      expect(newE.environmentVariables).to.deep.equals({
        new: "value",
        foo: "new value",
      });
    });

    it("can noop when there is no prior endpoint", () => {
      const e = { ...ENDPOINT };
      prepare.inferDetailsFromExisting(backend.of(e), backend.of(), /* usedDotEnv= */ false);
      expect(e).to.deep.equal(ENDPOINT);
    });

    it("can fill in regions from last deploy", () => {
      const want: backend.Endpoint = {
        ...ENDPOINT_BASE,
        eventTrigger: {
          eventType: "google.cloud.storage.object.v1.finalized",
          eventFilters: { bucket: "bucket" },
          retry: false,
        },
      };
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      const have: backend.Endpoint & backend.EventTriggered = JSON.parse(JSON.stringify(want));
      have.eventTrigger.region = "us";

      prepare.inferDetailsFromExisting(backend.of(want), backend.of(have), /* usedDotEnv= */ false);
      expect(want.eventTrigger.region).to.equal("us");
    });

    it("doesn't fill in regions if triggers changed", () => {
      const want: backend.Endpoint = {
        ...ENDPOINT_BASE,
        eventTrigger: {
          eventType: "google.cloud.storage.object.v1.finalzied",
          eventFilters: { bucket: "us-bucket" },
          retry: false,
        },
      };
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      const have: backend.Endpoint & backend.EventTriggered = JSON.parse(JSON.stringify(want));
      have.eventTrigger.eventFilters = { bucket: "us-central1-bucket" };
      have.eventTrigger.region = "us-central1";

      prepare.inferDetailsFromExisting(backend.of(want), backend.of(have), /* usedDotEnv= */ false);
      expect(want.eventTrigger.region).to.be.undefined;
    });

    it("fills in instance size", () => {
      const want: backend.Endpoint = {
        ...ENDPOINT_BASE,
        httpsTrigger: {},
      };
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      const have: backend.Endpoint = JSON.parse(JSON.stringify(want));
      have.availableMemoryMb = 512;

      prepare.inferDetailsFromExisting(backend.of(want), backend.of(have), /* usedDotEnv= */ false);
      expect(want.availableMemoryMb).to.equal(512);
    });

    it("fills in timeout from last deploy", () => {
      const want: backend.Endpoint = {
        ...ENDPOINT_BASE,
        httpsTrigger: {},
      };
      const have: backend.Endpoint = JSON.parse(JSON.stringify(want));
      have.timeoutSeconds = 120;

      prepare.inferDetailsFromExisting(backend.of(want), backend.of(have), /* usedDotEnv= */ false);
      expect(want.timeoutSeconds).to.equal(120);
    });

    it("downgrades concurrency if necessary (explicit)", () => {
      const have: backend.Endpoint = {
        ...ENDPOINT_BASE,
        httpsTrigger: {},
        concurrency: 80,
        cpu: 1,
      };
      const want: backend.Endpoint = {
        ...ENDPOINT_BASE,
        httpsTrigger: {},
        cpu: 0.5,
      };

      prepare.inferDetailsFromExisting(backend.of(want), backend.of(have), /* useDotEnv= */ false);
      prepare.resolveCpuAndConcurrency(backend.of(want));
      expect(want.concurrency).to.equal(1);
    });

    it("downgrades concurrency if necessary (implicit)", () => {
      const have: backend.Endpoint = {
        ...ENDPOINT_BASE,
        httpsTrigger: {},
        concurrency: 80,
        cpu: 1,
      };
      const want: backend.Endpoint = {
        ...ENDPOINT_BASE,
        httpsTrigger: {},
        cpu: "gcf_gen1",
      };

      prepare.inferDetailsFromExisting(backend.of(want), backend.of(have), /* useDotEnv= */ false);
      prepare.resolveCpuAndConcurrency(backend.of(want));
      expect(want.concurrency).to.equal(1);
    });

    it("upgrades default concurrency with CPU upgrades", () => {
      const have: backend.Endpoint = {
        ...ENDPOINT_BASE,
        httpsTrigger: {},
        availableMemoryMb: 256,
        cpu: "gcf_gen1",
      };
      const want: backend.Endpoint = {
        ...ENDPOINT_BASE,
        httpsTrigger: {},
      };

      prepare.inferDetailsFromExisting(backend.of(want), backend.of(have), /* useDotEnv= */ false);
      prepare.resolveCpuAndConcurrency(backend.of(want));
      expect(want.concurrency).to.equal(1);
    });

    it("defaults timeout to 60 for run platform functions", () => {
      const want: backend.Endpoint = {
        ...ENDPOINT_BASE,
        platform: "run",
        httpsTrigger: {},
      };

      prepare.resolveDefaultTimeout(backend.of(want));
      expect(want.timeoutSeconds).to.equal(60);
    });

    it("does not default timeout for gcfv2 platform functions", () => {
      const want: backend.Endpoint = {
        ...ENDPOINT_BASE,
        platform: "gcfv2",
        httpsTrigger: {},
      };

      prepare.resolveDefaultTimeout(backend.of(want));
      expect(want.timeoutSeconds).to.be.undefined;
    });
  });

  describe("inferBlockingDetails", () => {
    it("should merge the blocking options and set default value", () => {
      const beforeCreate: backend.Endpoint = {
        ...ENDPOINT_BASE,
        id: "beforeCreate",
        blockingTrigger: {
          eventType: BEFORE_CREATE_EVENT,
          options: {
            accessToken: true,
            refreshToken: false,
          },
        },
      };
      const beforeSignIn: backend.Endpoint = {
        ...ENDPOINT_BASE,
        id: "beforeSignIn",
        blockingTrigger: {
          eventType: BEFORE_SIGN_IN_EVENT,
          options: {
            accessToken: false,
            idToken: true,
          },
        },
      };

      prepare.inferBlockingDetails(backend.of(beforeCreate, beforeSignIn));

      expect(beforeCreate.blockingTrigger.options?.accessToken).to.be.true;
      expect(beforeCreate.blockingTrigger.options?.idToken).to.be.true;
      expect(beforeCreate.blockingTrigger.options?.refreshToken).to.be.false;
      expect(beforeSignIn.blockingTrigger.options?.accessToken).to.be.true;
      expect(beforeSignIn.blockingTrigger.options?.idToken).to.be.true;
      expect(beforeSignIn.blockingTrigger.options?.refreshToken).to.be.false;
    });
  });

  describe("updateEndpointTargetedStatus", () => {
    let endpoint1InBackend1: backend.Endpoint;
    let endpoint2InBackend1: backend.Endpoint;
    let endpoint1InBackend2: backend.Endpoint;
    let endpoint2InBackend2: backend.Endpoint;

    let backends: Record<string, backend.Backend>;

    beforeEach(() => {
      endpoint1InBackend1 = {
        ...ENDPOINT,
        id: "endpoint1",
        platform: "gcfv1",
        codebase: "backend1",
      };
      endpoint2InBackend1 = {
        ...ENDPOINT,
        id: "endpoint2",
        platform: "gcfv1",
        codebase: "backend1",
      };
      endpoint1InBackend2 = {
        ...ENDPOINT,
        id: "endpoint1",
        platform: "gcfv2",
        codebase: "backend2",
      };
      endpoint2InBackend2 = {
        ...ENDPOINT,
        id: "endpoint2",
        platform: "gcfv2",
        codebase: "backend2",
      };

      const backend1 = backend.of(endpoint1InBackend1, endpoint2InBackend1);
      const backend2 = backend.of(endpoint1InBackend2, endpoint2InBackend2);

      backends = { backend1, backend2 };
    });

    it("should mark targeted codebases", () => {
      const filters = [{ codebase: "backend1" }];
      // Execute
      prepare.updateEndpointTargetedStatus(backends, filters);

      // Expect
      expect(endpoint1InBackend1.targetedByOnly).to.be.true;
      expect(endpoint2InBackend1.targetedByOnly).to.be.true;
      expect(endpoint1InBackend2.targetedByOnly).to.be.false;
      expect(endpoint2InBackend2.targetedByOnly).to.be.false;
    });

    it("should mark targeted codebases + ids", () => {
      const filters = [{ codebase: "backend1", idChunks: ["endpoint1"] }];

      // Execute
      prepare.updateEndpointTargetedStatus(backends, filters);

      // Expect
      expect(endpoint1InBackend1.targetedByOnly).to.be.true;
      expect(endpoint2InBackend1.targetedByOnly).to.be.false;
      expect(endpoint1InBackend2.targetedByOnly).to.be.false;
      expect(endpoint2InBackend2.targetedByOnly).to.be.false;
    });

    it("should mark targeted ids", () => {
      const filters = [{ idChunks: ["endpoint1"] }];

      // Execute
      prepare.updateEndpointTargetedStatus(backends, filters);

      // Expect
      expect(endpoint1InBackend1.targetedByOnly).to.be.true;
      expect(endpoint2InBackend1.targetedByOnly).to.be.false;
      expect(endpoint1InBackend1.targetedByOnly).to.be.true;
      expect(endpoint2InBackend2.targetedByOnly).to.be.false;
    });
  });

  describe("warnIfNewGenkitFunctionIsMissingSecrets", () => {
    const nonGenkitEndpoint: backend.Endpoint = {
      id: "nonGenkit",
      platform: "gcfv2",
      region: "us-central1",
      project: "project",
      entryPoint: "entry",
      runtime: latest("nodejs"),
      httpsTrigger: {},
    };

    const genkitEndpointWithSecrets: backend.Endpoint = {
      id: "genkitWithSecrets",
      platform: "gcfv2",
      region: "us-central1",
      project: "project",
      entryPoint: "entry",
      runtime: latest("nodejs"),
      callableTrigger: {
        genkitAction: "action",
      },
      secretEnvironmentVariables: [
        {
          key: "SECRET",
          secret: "secret",
          projectId: "project",
        },
      ],
    };

    const genkitEndpointWithoutSecrets: backend.Endpoint = {
      id: "genkitWithoutSecrets",
      platform: "gcfv2",
      region: "us-central1",
      project: "project",
      entryPoint: "entry",
      runtime: latest("nodejs"),
      callableTrigger: {
        genkitAction: "action",
      },
    };

    let confirm: sinon.SinonStub<
      Parameters<typeof prompt.confirm>,
      ReturnType<typeof prompt.confirm>
    >;

    beforeEach(() => {
      confirm = sinon.stub(prompt, "confirm");
    });

    afterEach(() => {
      sinon.verifyAndRestore();
    });

    it("should not prompt if there are no genkit functions", async () => {
      await prepare.warnIfNewGenkitFunctionIsMissingSecrets(
        backend.empty(),
        backend.of(nonGenkitEndpoint),
        {} as any,
      );
      expect(confirm).to.not.be.called;
    });

    it("should not prompt if all genkit functions have secrets", async () => {
      await prepare.warnIfNewGenkitFunctionIsMissingSecrets(
        backend.empty(),
        backend.of(genkitEndpointWithSecrets),
        {} as any,
      );
      expect(confirm).to.not.be.called;
    });

    it("should not prompt if the function is already deployed", async () => {
      await prepare.warnIfNewGenkitFunctionIsMissingSecrets(
        backend.of(genkitEndpointWithoutSecrets),
        backend.of(genkitEndpointWithoutSecrets),
        {} as any,
      );
      expect(confirm).to.not.be.called;
    });

    it("should not prompt if force is true", async () => {
      await prepare.warnIfNewGenkitFunctionIsMissingSecrets(
        backend.empty(),
        backend.of(genkitEndpointWithoutSecrets),
        { force: true } as any,
      );
      expect(confirm).to.not.be.called;
    });

    it("should throw if missing secrets and noninteractive", async () => {
      confirm.resolves(false);
      await expect(
        prepare.warnIfNewGenkitFunctionIsMissingSecrets(
          backend.empty(),
          backend.of(genkitEndpointWithoutSecrets),
          { nonInteractive: true } as any,
        ),
      ).to.be.rejectedWith(FirebaseError);
      expect(confirm).to.have.been.calledWithMatch({ nonInteractive: true });
    });

    it("should prompt if missing secrets and interactive", async () => {
      confirm.resolves(true);
      await prepare.warnIfNewGenkitFunctionIsMissingSecrets(
        backend.empty(),
        backend.of(genkitEndpointWithoutSecrets),
        {} as any,
      );
      expect(confirm).to.be.calledOnce;
    });

    it("should throw if user declines to deploy", async () => {
      confirm.resolves(false);
      await expect(
        prepare.warnIfNewGenkitFunctionIsMissingSecrets(
          backend.empty(),
          backend.of(genkitEndpointWithoutSecrets),
          {} as any,
        ),
      ).to.be.rejectedWith(FirebaseError);
    });
  });

  describe("ensureAllRequiredAPIsEnabled", () => {
    let sinonSandbox: sinon.SinonSandbox;
    let ensureApiStub: sinon.SinonStub;
    let generateServiceIdentityStub: sinon.SinonStub;
    let checkApiStub: sinon.SinonStub;
    let promptStub: sinon.SinonStub;

    beforeEach(() => {
      sinonSandbox = sinon.createSandbox();
      ensureApiStub = sinonSandbox.stub(ensureApiEnabled, "ensure").resolves();
      checkApiStub = sinonSandbox.stub(ensureApiEnabled, "check").resolves(true);
      generateServiceIdentityStub = sinonSandbox
        .stub(serviceusage, "generateServiceIdentity")
        .resolves();
      promptStub = sinonSandbox.stub(prompt, "confirm").resolves(true);
    });

    afterEach(() => {
      sinonSandbox.restore();
    });

    const mockOptions = {};

    it("should not enable any APIs for an empty backend", async () => {
      await prepare.ensureAllRequiredAPIsEnabled("project", backend.empty(), mockOptions);
      expect(ensureApiStub.called).to.be.false;
      expect(generateServiceIdentityStub.called).to.be.false;
    });

    it("should not prompt when APIs are part of allowlist", async () => {
      const b = backend.empty();
      b.requiredAPIs = [{ api: "cloudscheduler.googleapis.com" }]; // Standard API

      await prepare.ensureAllRequiredAPIsEnabled("project", b, mockOptions);

      expect(promptStub.called).to.be.false;
      expect(
        ensureApiStub.calledWith("project", "cloudscheduler.googleapis.com", "functions", false),
      ).to.be.true;
    });

    it("should not prompt when additional API is already enabled", async () => {
      const b = backend.empty();
      const customApi = "custom.googleapis.com";
      b.requiredAPIs = [{ api: customApi }];
      checkApiStub.withArgs("project", customApi, "functions", true).resolves(true);

      await prepare.ensureAllRequiredAPIsEnabled("project", b, mockOptions);

      expect(promptStub.called).to.be.false;
      expect(ensureApiStub.calledWith("project", customApi, "functions", false)).to.be.false;
    });

    it("should prompt and enable additional API when user confirms", async () => {
      const b = backend.empty();
      const customApi = "custom.googleapis.com";
      const customReason = "Needed for custom stuff";
      b.requiredAPIs = [{ api: customApi, reason: customReason }];
      checkApiStub.withArgs("project", customApi, "functions", true).resolves(false);
      promptStub.resolves(true);

      await prepare.ensureAllRequiredAPIsEnabled("project", b, mockOptions);

      expect(promptStub.calledOnce).to.be.true;
      expect(
        promptStub.calledWith(
          sinon.match({
            message: `This codebase depends on the following additional API(s) which are currently disabled:\n - ${customApi}: ${customReason}\nWould you like to enable them?`,
            default: false,
          }),
        ),
      ).to.be.true;
      expect(ensureApiStub.calledWith("project", customApi, "functions", false)).to.be.true;
    });

    it("should throw exception when user aborts prompt", async () => {
      const b = backend.empty();
      const customApi = "custom.googleapis.com";
      b.requiredAPIs = [{ api: customApi }];
      checkApiStub.withArgs("project", customApi, "functions", true).resolves(false);
      promptStub.resolves(false);

      await expect(
        prepare.ensureAllRequiredAPIsEnabled("project", b, mockOptions),
      ).to.be.rejectedWith(FirebaseError, "Must enable required APIs to deploy.");

      expect(ensureApiStub.calledWith("project", customApi, "functions", false)).to.be.false;
    });

    it("should enable Secret Manager API if secrets are used ", async () => {
      const e: backend.Endpoint = {
        id: "hasSecrets",
        platform: "gcfv1",
        region: "us-central1",
        project: "project",
        entryPoint: "entry",
        runtime: latest("nodejs"),
        httpsTrigger: {},
        secretEnvironmentVariables: [
          {
            key: "SECRET",
            secret: "secret",
            projectId: "project",
          },
        ],
      };
      await prepare.ensureAllRequiredAPIsEnabled("project", backend.of(e), mockOptions);
      expect(
        ensureApiStub.calledWith(
          "project",
          "https://secretmanager.googleapis.com",
          "functions",
          false,
        ),
      ).to.be.true;
    });

    it("should enable GCFv2 APIs and generate required service identities", async () => {
      const e: backend.Endpoint = {
        id: "v2",
        platform: "gcfv2",
        region: "us-central1",
        project: "project",
        entryPoint: "entry",
        runtime: latest("nodejs"),
        httpsTrigger: {},
      };

      await prepare.ensureAllRequiredAPIsEnabled("project", backend.of(e), mockOptions);

      expect(ensureApiStub.calledWith("project", "https://run.googleapis.com", "functions")).to.be
        .true;
      expect(ensureApiStub.calledWith("project", "https://eventarc.googleapis.com", "functions")).to
        .be.true;
      expect(ensureApiStub.calledWith("project", "https://pubsub.googleapis.com", "functions")).to
        .be.true;
      expect(ensureApiStub.calledWith("project", "https://storage.googleapis.com", "functions")).to
        .be.true;
      expect(
        generateServiceIdentityStub.calledWith("project", "pubsub.googleapis.com", "functions"),
      ).to.be.true;
      expect(
        generateServiceIdentityStub.calledWith("project", "eventarc.googleapis.com", "functions"),
      ).to.be.true;
    });
  });

  describe("discoverSecurityDetails", () => {
    let testIamPermissionsStub: sinon.SinonStub;

    beforeEach(() => {
      testIamPermissionsStub = sinon
        .stub(iam, "testIamPermissions")
        .resolves({ passed: true } as any);
      sinon.stub(iam, "generateManagedServiceAccountName").resolves("firebase-fn-123");
      sinon.stub(resourcemanager, "getServiceAccountRoles").resolves([]);
    });

    afterEach(() => {
      sinon.restore();
    });

    it("should mutate endpoints to use managed service account when enrolling in declarative security", async () => {
      const e: backend.Endpoint = {
        ...ENDPOINT,
      };
      const want = backend.of(e);
      want.requiredRoles = ["roles/viewer"];
      const have = backend.empty();

      const result = await prepare.discoverSecurityDetails("default", want, have, "project");

      expect(result.managedSA).to.equal("firebase-fn-123@project.iam.gserviceaccount.com");
      expect(result.newEtag).to.be.a("string");
      expect(e.serviceAccount).to.equal("firebase-fn-123@project.iam.gserviceaccount.com");
      expect(e.labels?.["firebase-declarative-security-etag"]).to.equal(result.newEtag);
    });

    it("should reset endpoints to default service account when unenrolling (opting out)", async () => {
      const e: backend.Endpoint = {
        ...ENDPOINT,
        serviceAccount: "firebase-fn-123@project.iam.gserviceaccount.com",
        labels: {
          "firebase-declarative-security-etag": "salt-etag",
        },
      };
      const want = backend.of(e);
      const have = backend.of({
        ...e,
        labels: { ...e.labels },
      });

      const result = await prepare.discoverSecurityDetails("default", want, have, "project");

      expect(result.existingManagedSA).to.equal("firebase-fn-123@project.iam.gserviceaccount.com");
      expect(result.haveRolesEtag).to.equal("salt-etag");
      expect(e.serviceAccount).to.be.null;
      expect(e.labels?.["firebase-declarative-security-etag"]).to.be.undefined;
    });

    it("should keep explicit custom service accounts and not reset to default when unenrolling from declarative security", async () => {
      const eCustom: backend.Endpoint = {
        ...ENDPOINT,
        id: "custom",
        serviceAccount: "custom-sa@project.iam.gserviceaccount.com",
      };
      const eManaged: backend.Endpoint = {
        ...ENDPOINT,
        id: "managed",
        serviceAccount: "firebase-fn-123@project.iam.gserviceaccount.com",
      };
      const want = backend.merge(backend.of(eCustom), backend.of(eManaged));

      const have = backend.merge(
        backend.of({
          ...eCustom,
          serviceAccount: "firebase-fn-123@project.iam.gserviceaccount.com",
          labels: { "firebase-declarative-security-etag": "salt-etag" },
        }),
        backend.of({
          ...eManaged,
          serviceAccount: "firebase-fn-123@project.iam.gserviceaccount.com",
          labels: { "firebase-declarative-security-etag": "salt-etag" },
        }),
      );

      await prepare.discoverSecurityDetails("default", want, have, "project");

      expect(eCustom.serviceAccount).to.equal("custom-sa@project.iam.gserviceaccount.com");
      expect(eManaged.serviceAccount).to.be.null;
    });

    it("should throw error if user combines custom SA and declarative security", async () => {
      const e: backend.Endpoint = {
        ...ENDPOINT,
        serviceAccount: "custom-sa@project.iam.gserviceaccount.com",
      };
      const want = backend.of(e);
      want.requiredRoles = ["roles/viewer"];
      const have = backend.empty();

      await expect(
        prepare.discoverSecurityDetails("default", want, have, "project"),
      ).to.be.rejectedWith(
        FirebaseError,
        /Cannot use explicit custom service accounts on functions while using declarative security/,
      );
    });

    it("should throw error if user lacks IAM operator permissions", async () => {
      testIamPermissionsStub.resolves({
        passed: false,
        missing: ["iam.serviceAccounts.create"],
      });
      const e: backend.Endpoint = {
        ...ENDPOINT,
      };
      const want = backend.of(e);
      want.requiredRoles = ["roles/viewer"];
      const have = backend.empty();

      await expect(prepare.discoverSecurityDetails("default", want, have, "project")).to.be
        .rejected;
    });

    it("should throw error if attempting to enroll during a partially filtered deploy", async () => {
      const e: backend.Endpoint = {
        ...ENDPOINT,
      };
      const want = backend.of(e);
      want.requiredRoles = ["roles/viewer"];
      const have = backend.empty();

      await expect(
        prepare.discoverSecurityDetails("default", want, have, "project", [
          { codebase: "default", idChunks: ["myFunc"] },
        ]),
      ).to.be.rejectedWith(
        FirebaseError,
        /To ensure a whole codebase is migrated cleanly, you may not deploy only part of a codebase when opting into or out of declarative security/,
      );
    });

    it("should throw error if attempting to unenroll during a partially filtered deploy", async () => {
      const e: backend.Endpoint = {
        ...ENDPOINT,
        serviceAccount: "firebase-fn-123@project.iam.gserviceaccount.com",
        labels: {
          "firebase-declarative-security-etag": "salt-etag",
        },
      };
      const want = backend.of(e);
      const have = backend.of({
        ...e,
        labels: { ...e.labels },
      });

      await expect(
        prepare.discoverSecurityDetails("default", want, have, "project", [
          { codebase: "default", idChunks: ["myFunc"] },
        ]),
      ).to.be.rejectedWith(
        FirebaseError,
        /To ensure a whole codebase is migrated cleanly, you may not deploy only part of a codebase when opting into or out of declarative security/,
      );
    });
  });
});
