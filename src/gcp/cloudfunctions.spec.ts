import { expect } from "chai";
import * as nock from "nock";

import { functionsOrigin } from "../api";

import * as backend from "../deploy/functions/backend";
import * as build from "../deploy/functions/build";
import { BEFORE_CREATE_EVENT, BEFORE_SIGN_IN_EVENT } from "../functions/events/v1";
import * as cloudfunctions from "./cloudfunctions";
import * as projectConfig from "../functions/projectConfig";
import { BLOCKING_LABEL, CODEBASE_LABEL, HASH_LABEL } from "../functions/constants";
import * as tf from "../functions/iac/terraform";

describe("cloudfunctions", () => {
  const FUNCTION_NAME: backend.TargetIds = {
    id: "id",
    region: "region",
    project: "project",
  };

  // Omit a random trigger to make this compile
  const ENDPOINT: Omit<backend.Endpoint, "httpsTrigger"> = {
    platform: "gcfv1",
    ...FUNCTION_NAME,
    entryPoint: "function",
    runtime: "nodejs16",
    codebase: projectConfig.DEFAULT_CODEBASE,
    state: "ACTIVE",
  };

  const BUILD_ENDPOINT: build.Endpoint = {
    platform: "gcfv1",
    region: ["region"],
    project: "project",
    entryPoint: "function",
    runtime: "nodejs16",
    httpsTrigger: {},
  };

  const CLOUD_FUNCTION: Omit<cloudfunctions.CloudFunction, cloudfunctions.OutputOnlyFields> = {
    name: "projects/project/locations/region/functions/id",
    entryPoint: "function",
    runtime: "nodejs16",
    dockerRegistry: "ARTIFACT_REGISTRY",
  };

  const HAVE_CLOUD_FUNCTION: cloudfunctions.CloudFunction = {
    ...CLOUD_FUNCTION,
    buildId: "buildId",
    versionId: 1,
    updateTime: new Date(),
    status: "ACTIVE",
  };

  before(() => {
    nock.disableNetConnect();
  });

  after(() => {
    expect(nock.isDone()).to.be.true;
    nock.enableNetConnect();
  });

  describe("terraformFromEndpoint", () => {
    const BUCKET: tf.Expression = tf.expr("bucket");
    const ARCHIVE: tf.Expression = tf.expr("archive");

    it("should reject non-gcfv1 endpoints", () => {
      expect(() => {
        cloudfunctions.terraformFromEndpoint(
          "id",
          { ...BUILD_ENDPOINT, platform: "gcfv2", httpsTrigger: {} },
          BUCKET,
          ARCHIVE,
        );
      }).to.throw("Cannot create 1st gen function terraform for endpoint id with platform gcfv2");
    });

    it("should reject invalid runtimes", () => {
      expect(() => {
        cloudfunctions.terraformFromEndpoint(
          "id",
          { ...BUILD_ENDPOINT, runtime: "invalid" as any, httpsTrigger: {} },
          BUCKET,
          ARCHIVE,
        );
      }).to.throw(
        "Cannot create 1st gen function terraform for endpoint id with invalid runtime invalid",
      );
    });

    it("should return just compute resource if no invoker is present", () => {
      const endpoint: build.Endpoint = {
        platform: "gcfv1",
        region: ["region"],
        project: "project",
        entryPoint: "function",
        runtime: "nodejs16",
        eventTrigger: {
          eventType: "google.pubsub.topic.publish",
          eventFilters: { resource: "projects/p/topics/t" },
          retry: false,
        },
      };

      const actual = cloudfunctions.terraformFromEndpoint("id", endpoint, BUCKET, ARCHIVE);

      expect(actual.length).to.equal(1);
      expect(actual[0].labels![0]).to.equal("google_cloudfunctions_function");
    });

    it("should return compute and permissions resources if invoker is present", () => {
      const actual = cloudfunctions.terraformFromEndpoint(
        "id",
        { ...BUILD_ENDPOINT, httpsTrigger: { invoker: ["public"] } },
        BUCKET,
        ARCHIVE,
      );

      expect(actual.length).to.equal(2);
      expect(actual[0].labels![0]).to.equal("google_cloudfunctions_function");
      expect(actual[1].labels![0]).to.equal("google_cloudfunctions_function_iam_binding");
    });
  });

  describe("functionTerraform", () => {
    const BUCKET: tf.Expression = tf.expr("bucket");
    const ARCHIVE: tf.Expression = tf.expr("archive");

    it("should handle different region formats", () => {
      // String region
      let endpoint: build.Endpoint = {
        ...BUILD_ENDPOINT,
        region: ["europe-west1"],
        httpsTrigger: {},
      };
      let actual = cloudfunctions.functionTerraform("id", endpoint, BUCKET, ARCHIVE);
      expect(actual.attributes["region"]).to.equal("europe-west1");

      // Empty array region
      endpoint = { ...BUILD_ENDPOINT, region: [], httpsTrigger: {} };
      actual = cloudfunctions.functionTerraform("id", endpoint, BUCKET, ARCHIVE);
      expect(actual.attributes["region"]).to.deep.equal({
        "@type": "HCLExpression",
        value: "var.location",
      });

      // Single element array region
      endpoint = {
        ...BUILD_ENDPOINT,
        region: ["asia-east1"],
        httpsTrigger: {},
      }; 
      actual = cloudfunctions.functionTerraform("id", endpoint, BUCKET, ARCHIVE);
      expect(actual.attributes["region"]).to.equal("asia-east1");

      // Multi element array region
      endpoint = {
        ...BUILD_ENDPOINT,
        region: ["us-central1", "us-east1"],
        httpsTrigger: {},
      }; 
      actual = cloudfunctions.functionTerraform("id", endpoint, BUCKET, ARCHIVE);
      expect(actual.attributes["for_each"]).to.deep.equal({
        "@type": "HCLExpression",
        value: `toset(["us-central1","us-east1"])`,
      });
      expect(actual.attributes["region"]).to.deep.equal({
        "@type": "HCLExpression",
        value: "each.value",
      });
    });

    it("should handle VPC connectivity", () => {
      const endpoint: build.Endpoint = {
        ...BUILD_ENDPOINT,
        httpsTrigger: {},
        vpc: {
          connector: "my-connector",
          egressSettings: "ALL_TRAFFIC",
        },
      };
      const actual = cloudfunctions.functionTerraform("id", endpoint, BUCKET, ARCHIVE);

      expect(actual.attributes["vpc_connector"]).to.equal(
        "projects/${var.project}/locations/region/connectors/my-connector",
      );
      expect(actual.attributes["vpc_connector_egress_settings"]).to.equal("ALL_TRAFFIC");
    });

    it("should handle full VPC connector string", () => {
      const endpoint: build.Endpoint = {
        ...BUILD_ENDPOINT,
        httpsTrigger: {},
        vpc: {
          connector: "projects/p/locations/l/connectors/c",
        },
      };
      const actual = cloudfunctions.functionTerraform("id", endpoint, BUCKET, ARCHIVE);

      expect(actual.attributes["vpc_connector"]).to.equal("projects/p/locations/l/connectors/c");
    });

    it("should throw for unsupported trigger types", () => {
      expect(() =>
        cloudfunctions.functionTerraform(
          "id",
          { ...ENDPOINT, scheduleTrigger: {} } as unknown as build.Endpoint,
          BUCKET,
          ARCHIVE,
        ),
      ).to.throw("Scheduled functions are not supported in terraform yet");

      expect(() =>
        cloudfunctions.functionTerraform(
          "id",
          { ...ENDPOINT, taskQueueTrigger: {} } as unknown as build.Endpoint,
          BUCKET,
          ARCHIVE,
        ),
      ).to.throw("Task queue functions are not supported in terraform yet");

      expect(() =>
        cloudfunctions.functionTerraform(
          "id",
          { ...ENDPOINT, blockingTrigger: {} } as unknown as build.Endpoint,
          BUCKET,
          ARCHIVE,
        ),
      ).to.throw("Blocking functions are not supported in terraform yet");

      expect(() =>
        cloudfunctions.functionTerraform(
          "id",
          { ...ENDPOINT, dataConnectGraphqlTrigger: {} } as unknown as build.Endpoint,
          BUCKET,
          ARCHIVE,
        ),
      ).to.throw("Data connector functions are not supported in terraform yet");
    });

    it("should support secret environment variables", () => {
      const endpoint: build.Endpoint = {
        ...BUILD_ENDPOINT,
        httpsTrigger: {},
        secretEnvironmentVariables: [{ key: "API_KEY", secret: "MY_SECRET", projectId: "project" }],
      };
      const actual = cloudfunctions.functionTerraform("id", endpoint, BUCKET, ARCHIVE);
      expect(actual.attributes["secret_environment_variables"]).to.deep.equal([
        { key: "API_KEY", secret: "MY_SECRET", version: "latest" },
      ]);
    });
  });

  describe("invokerTerraform", () => {
    it("should return null if not https or callable", () => {
      const endpoint: build.Endpoint = {
        platform: "gcfv1",
        region: ["region"],
        project: "project",
        entryPoint: "function",
        runtime: "nodejs16",
        eventTrigger: {
          eventType: "google.pubsub.topic.publish",
          retry: false,
        },
      };

      expect(cloudfunctions.invokerTerraform("id", endpoint)).to.be.null;
    });

    it("should handle public invoker", () => {
      const actual = cloudfunctions.invokerTerraform("id", {
        ...BUILD_ENDPOINT,
        httpsTrigger: { invoker: ["public"] },
      });
      expect(actual?.attributes["members"]).to.deep.equal(["allUsers"]);
    });

    it("should handle private invoker", () => {
      const actual = cloudfunctions.invokerTerraform("id", {
        ...BUILD_ENDPOINT,
        httpsTrigger: { invoker: ["private"] },
      });
      expect(actual?.attributes["members"]).to.deep.equal([]);
    });

    it("should handle array of custom service accounts", () => {
      const actual = cloudfunctions.invokerTerraform("id", {
        ...BUILD_ENDPOINT,
        httpsTrigger: { invoker: ["foo@", "bar@baz.com"] },
      });
      expect(actual?.attributes["members"]).to.deep.equal([
        "serviceAccount:foo@${var.project}.iam.gserviceaccount.com",
        "serviceAccount:bar@baz.com",
      ]);
    });

    it("should use for_each when deployed to multiple regions", () => {
      const actual = cloudfunctions.invokerTerraform("id", {
        ...BUILD_ENDPOINT,
        region: ["us-central1", "us-east1"],
        httpsTrigger: { invoker: ["public"] },
      });
      expect(actual?.attributes["for_each"]).to.deep.equal({
        "@type": "HCLExpression",
        value: "google_cloudfunctions_function.id",
      });
      expect(actual?.attributes["region"]).to.deep.equal({
        "@type": "HCLExpression",
        value: "each.value.region",
      });
    });
  });

  describe("functionFromEndpoint", () => {
    const UPLOAD_URL = "https://storage.googleapis.com/projects/-/buckets/sample/source.zip";
    it("should guard against version mixing", () => {
      expect(() => {
        cloudfunctions.functionFromEndpoint(
          { ...ENDPOINT, platform: "gcfv2", httpsTrigger: {} },
          UPLOAD_URL,
        );
      }).to.throw();
    });

    it("should copy a minimal function", () => {
      expect(
        cloudfunctions.functionFromEndpoint({ ...ENDPOINT, httpsTrigger: {} }, UPLOAD_URL),
      ).to.deep.equal({
        ...CLOUD_FUNCTION,
        sourceUploadUrl: UPLOAD_URL,
        httpsTrigger: {},
      });

      const eventEndpoint = {
        ...ENDPOINT,
        eventTrigger: {
          eventType: "google.pubsub.topic.publish",
          eventFilters: { resource: "projects/p/topics/t" },
          retry: false,
        },
      };
      const eventGcfFunction = {
        ...CLOUD_FUNCTION,
        sourceUploadUrl: UPLOAD_URL,
        eventTrigger: {
          eventType: "google.pubsub.topic.publish",
          resource: "projects/p/topics/t",
          failurePolicy: undefined,
        },
      };
      expect(cloudfunctions.functionFromEndpoint(eventEndpoint, UPLOAD_URL)).to.deep.equal(
        eventGcfFunction,
      );
    });

    it("should copy trival fields", () => {
      const fullEndpoint: backend.Endpoint = {
        ...ENDPOINT,
        httpsTrigger: {},
        availableMemoryMb: 128,
        minInstances: 1,
        maxInstances: 42,
        vpc: {
          connector: "connector",
          egressSettings: "ALL_TRAFFIC",
        },
        ingressSettings: "ALLOW_ALL",
        serviceAccount: "inlined@google.com",
        labels: {
          foo: "bar",
        },
        environmentVariables: {
          FOO: "bar",
        },
      };

      const fullGcfFunction: Omit<cloudfunctions.CloudFunction, cloudfunctions.OutputOnlyFields> = {
        ...CLOUD_FUNCTION,
        sourceUploadUrl: UPLOAD_URL,
        httpsTrigger: {},
        labels: {
          ...CLOUD_FUNCTION.labels,
          foo: "bar",
        },
        environmentVariables: {
          FOO: "bar",
        },
        maxInstances: 42,
        minInstances: 1,
        vpcConnector: "connector",
        vpcConnectorEgressSettings: "ALL_TRAFFIC",
        ingressSettings: "ALLOW_ALL",
        availableMemoryMb: 128,
        serviceAccountEmail: "inlined@google.com",
      };

      expect(cloudfunctions.functionFromEndpoint(fullEndpoint, UPLOAD_URL)).to.deep.equal(
        fullGcfFunction,
      );
    });

    it("should calculate non-trivial fields", () => {
      const complexEndpoint: backend.Endpoint = {
        ...ENDPOINT,
        scheduleTrigger: {},
        timeoutSeconds: 20,
      };

      const complexGcfFunction: Omit<
        cloudfunctions.CloudFunction,
        cloudfunctions.OutputOnlyFields
      > = {
        ...CLOUD_FUNCTION,
        sourceUploadUrl: UPLOAD_URL,
        eventTrigger: {
          eventType: "google.pubsub.topic.publish",
          resource: `projects/project/topics/${backend.scheduleIdForFunction(FUNCTION_NAME)}`,
        },
        timeout: "20s",
        labels: {
          ...CLOUD_FUNCTION.labels,
          "deployment-scheduled": "true",
        },
      };

      expect(cloudfunctions.functionFromEndpoint(complexEndpoint, UPLOAD_URL)).to.deep.equal(
        complexGcfFunction,
      );
    });

    it("detects task queue functions", () => {
      const taskEndpoint: backend.Endpoint = {
        ...ENDPOINT,
        taskQueueTrigger: {},
      };
      const taskQueueFunction: Omit<cloudfunctions.CloudFunction, cloudfunctions.OutputOnlyFields> =
        {
          ...CLOUD_FUNCTION,
          sourceUploadUrl: UPLOAD_URL,
          httpsTrigger: {},
          labels: {
            ...CLOUD_FUNCTION.labels,
            "deployment-taskqueue": "true",
          },
        };

      expect(cloudfunctions.functionFromEndpoint(taskEndpoint, UPLOAD_URL)).to.deep.equal(
        taskQueueFunction,
      );
    });

    it("detects beforeCreate blocking functions", () => {
      const blockingEndpoint: backend.Endpoint = {
        ...ENDPOINT,
        blockingTrigger: {
          eventType: BEFORE_CREATE_EVENT,
        },
      };
      const blockingFunction: Omit<cloudfunctions.CloudFunction, cloudfunctions.OutputOnlyFields> =
        {
          ...CLOUD_FUNCTION,
          sourceUploadUrl: UPLOAD_URL,
          httpsTrigger: {},
          labels: {
            ...CLOUD_FUNCTION.labels,
            [BLOCKING_LABEL]: "before-create",
          },
        };

      expect(cloudfunctions.functionFromEndpoint(blockingEndpoint, UPLOAD_URL)).to.deep.equal(
        blockingFunction,
      );
    });

    it("detects beforeSignIn blocking functions", () => {
      const blockingEndpoint: backend.Endpoint = {
        ...ENDPOINT,
        blockingTrigger: {
          eventType: BEFORE_SIGN_IN_EVENT,
        },
      };
      const blockingFunction: Omit<cloudfunctions.CloudFunction, cloudfunctions.OutputOnlyFields> =
        {
          ...CLOUD_FUNCTION,
          sourceUploadUrl: UPLOAD_URL,
          httpsTrigger: {},
          labels: {
            ...CLOUD_FUNCTION.labels,
            [BLOCKING_LABEL]: "before-sign-in",
          },
        };

      expect(cloudfunctions.functionFromEndpoint(blockingEndpoint, UPLOAD_URL)).to.deep.equal(
        blockingFunction,
      );
    });

    it("should export codebase as label", () => {
      expect(
        cloudfunctions.functionFromEndpoint(
          {
            ...ENDPOINT,
            codebase: "my-codebase",
            httpsTrigger: {},
          },
          UPLOAD_URL,
        ),
      ).to.deep.equal({
        ...CLOUD_FUNCTION,
        sourceUploadUrl: UPLOAD_URL,
        httpsTrigger: {},
        labels: { ...CLOUD_FUNCTION.labels, [CODEBASE_LABEL]: "my-codebase" },
      });
    });

    it("should export hash as label", () => {
      expect(
        cloudfunctions.functionFromEndpoint(
          {
            ...ENDPOINT,
            hash: "my-hash",
            httpsTrigger: {},
          },
          UPLOAD_URL,
        ),
      ).to.deep.equal({
        ...CLOUD_FUNCTION,
        sourceUploadUrl: UPLOAD_URL,
        httpsTrigger: {},
        labels: { ...CLOUD_FUNCTION.labels, [HASH_LABEL]: "my-hash" },
      });
    });

    it("should expand shorthand service account", () => {
      expect(
        cloudfunctions.functionFromEndpoint(
          {
            ...ENDPOINT,
            httpsTrigger: {},
            serviceAccount: "robot@",
          },
          UPLOAD_URL,
        ),
      ).to.deep.equal({
        ...CLOUD_FUNCTION,
        sourceUploadUrl: UPLOAD_URL,
        httpsTrigger: {},
        serviceAccountEmail: `robot@${ENDPOINT.project}.iam.gserviceaccount.com`,
      });
    });

    it("should handle null service account", () => {
      expect(
        cloudfunctions.functionFromEndpoint(
          {
            ...ENDPOINT,
            httpsTrigger: {},
            serviceAccount: null,
          },
          UPLOAD_URL,
        ),
      ).to.deep.equal({
        ...CLOUD_FUNCTION,
        sourceUploadUrl: UPLOAD_URL,
        httpsTrigger: {},
        serviceAccountEmail: null,
      });
    });
  });

  describe("endpointFromFunction", () => {
    it("should copy a minimal version", () => {
      expect(
        cloudfunctions.endpointFromFunction({
          ...HAVE_CLOUD_FUNCTION,
          httpsTrigger: {},
        }),
      ).to.deep.equal({ ...ENDPOINT, httpsTrigger: {} });
    });

    it("should translate event triggers", () => {
      let want: backend.Endpoint = {
        ...ENDPOINT,
        eventTrigger: {
          eventType: "google.pubsub.topic.publish",
          eventFilters: { resource: "projects/p/topics/t" },
          retry: true,
        },
      };
      expect(
        cloudfunctions.endpointFromFunction({
          ...HAVE_CLOUD_FUNCTION,
          eventTrigger: {
            eventType: "google.pubsub.topic.publish",
            resource: "projects/p/topics/t",
            failurePolicy: {
              retry: {},
            },
          },
        }),
      ).to.deep.equal(want);

      // And again w/o the failure policy
      want = {
        ...want,
        eventTrigger: {
          ...want.eventTrigger,
          retry: false,
        },
      };
      expect(
        cloudfunctions.endpointFromFunction({
          ...HAVE_CLOUD_FUNCTION,
          eventTrigger: {
            eventType: "google.pubsub.topic.publish",
            resource: "projects/p/topics/t",
          },
        }),
      ).to.deep.equal(want);
    });

    it("should translate scheduled triggers", () => {
      expect(
        cloudfunctions.endpointFromFunction({
          ...HAVE_CLOUD_FUNCTION,
          eventTrigger: {
            eventType: "google.pubsub.topic.publish",
            resource: "projects/p/topics/t",
            failurePolicy: {
              retry: {},
            },
          },
          labels: {
            "deployment-scheduled": "true",
          },
        }),
      ).to.deep.equal({
        ...ENDPOINT,
        scheduleTrigger: {},
        labels: {
          "deployment-scheduled": "true",
        },
      });
    });

    it("should translate task queue triggers", () => {
      expect(
        cloudfunctions.endpointFromFunction({
          ...HAVE_CLOUD_FUNCTION,
          httpsTrigger: {},
          labels: {
            "deployment-taskqueue": "true",
          },
        }),
      ).to.deep.equal({
        ...ENDPOINT,
        taskQueueTrigger: {},
        labels: {
          "deployment-taskqueue": "true",
        },
      });
    });

    it("should translate beforeCreate blocking triggers", () => {
      expect(
        cloudfunctions.endpointFromFunction({
          ...HAVE_CLOUD_FUNCTION,
          httpsTrigger: {},
          labels: {
            "deployment-blocking": "before-create",
          },
        }),
      ).to.deep.equal({
        ...ENDPOINT,
        blockingTrigger: {
          eventType: BEFORE_CREATE_EVENT,
        },
        labels: {
          "deployment-blocking": "before-create",
        },
      });
    });

    it("should translate beforeSignIn blocking triggers", () => {
      expect(
        cloudfunctions.endpointFromFunction({
          ...HAVE_CLOUD_FUNCTION,
          httpsTrigger: {},
          labels: {
            "deployment-blocking": "before-sign-in",
          },
        }),
      ).to.deep.equal({
        ...ENDPOINT,
        blockingTrigger: {
          eventType: BEFORE_SIGN_IN_EVENT,
        },
        labels: {
          "deployment-blocking": "before-sign-in",
        },
      });
    });

    it("should copy optional fields", () => {
      const wantExtraFields: Partial<backend.Endpoint> = {
        availableMemoryMb: 128,
        minInstances: 1,
        maxInstances: 42,
        ingressSettings: "ALLOW_ALL",
        serviceAccount: "inlined@google.com",
        timeoutSeconds: 15,
        labels: {
          foo: "bar",
        },
        environmentVariables: {
          FOO: "bar",
        },
      };
      const haveExtraFields: Partial<cloudfunctions.CloudFunction> = {
        availableMemoryMb: 128,
        minInstances: 1,
        maxInstances: 42,
        ingressSettings: "ALLOW_ALL",
        serviceAccountEmail: "inlined@google.com",
        timeout: "15s",
        labels: {
          foo: "bar",
        },
        environmentVariables: {
          FOO: "bar",
        },
      };
      const vpcConnector = "connector";
      const vpcConnectorEgressSettings = "ALL_TRAFFIC";

      expect(
        cloudfunctions.endpointFromFunction({
          ...HAVE_CLOUD_FUNCTION,
          ...haveExtraFields,
          vpcConnector,
          vpcConnectorEgressSettings,
          httpsTrigger: {},
        } as cloudfunctions.CloudFunction),
      ).to.deep.equal({
        ...ENDPOINT,
        ...wantExtraFields,
        vpc: {
          connector: vpcConnector,
          egressSettings: vpcConnectorEgressSettings,
        },
        httpsTrigger: {},
      });
    });

    it("should derive codebase from labels", () => {
      expect(
        cloudfunctions.endpointFromFunction({
          ...HAVE_CLOUD_FUNCTION,
          httpsTrigger: {},
          labels: {
            ...CLOUD_FUNCTION.labels,
            [CODEBASE_LABEL]: "my-codebase",
          },
        }),
      ).to.deep.equal({
        ...ENDPOINT,
        httpsTrigger: {},
        labels: {
          ...ENDPOINT.labels,
          [CODEBASE_LABEL]: "my-codebase",
        },
        codebase: "my-codebase",
      });
    });

    it("should derive hash from labels", () => {
      expect(
        cloudfunctions.endpointFromFunction({
          ...HAVE_CLOUD_FUNCTION,
          httpsTrigger: {},
          labels: {
            ...CLOUD_FUNCTION.labels,
            [CODEBASE_LABEL]: "my-codebase",
            [HASH_LABEL]: "my-hash",
          },
        }),
      ).to.deep.equal({
        ...ENDPOINT,
        httpsTrigger: {},
        labels: {
          ...ENDPOINT.labels,
          [CODEBASE_LABEL]: "my-codebase",
          [HASH_LABEL]: "my-hash",
        },
        codebase: "my-codebase",
        hash: "my-hash",
      });
    });
  });

  describe("setInvokerCreate", () => {
    it("should reject on emtpy invoker array", async () => {
      await expect(cloudfunctions.setInvokerCreate("project", "function", [])).to.be.rejected;
    });

    it("should reject if the setting the IAM policy fails", async () => {
      nock(functionsOrigin())
        .post("/v1/function:setIamPolicy", {
          policy: {
            bindings: [{ role: "roles/cloudfunctions.invoker", members: ["allUsers"] }],
            etag: "",
            version: 3,
          },
          updateMask: "bindings,etag,version",
        })
        .reply(418, {});

      await expect(
        cloudfunctions.setInvokerCreate("project", "function", ["public"]),
      ).to.be.rejectedWith("Failed to set the IAM Policy on the function function");
    });

    it("should set a private policy on a function", async () => {
      nock(functionsOrigin())
        .post("/v1/function:setIamPolicy", {
          policy: {
            bindings: [{ role: "roles/cloudfunctions.invoker", members: [] }],
            etag: "",
            version: 3,
          },
          updateMask: "bindings,etag,version",
        })
        .reply(200, {});

      await expect(cloudfunctions.setInvokerCreate("project", "function", ["private"])).to.not.be
        .rejected;
    });

    it("should set a public policy on a function", async () => {
      nock(functionsOrigin())
        .post("/v1/function:setIamPolicy", {
          policy: {
            bindings: [{ role: "roles/cloudfunctions.invoker", members: ["allUsers"] }],
            etag: "",
            version: 3,
          },
          updateMask: "bindings,etag,version",
        })
        .reply(200, {});

      await expect(cloudfunctions.setInvokerCreate("project", "function", ["public"])).to.not.be
        .rejected;
    });

    it("should set the policy with a set of invokers with active policies", async () => {
      nock(functionsOrigin())
        .post("/v1/function:setIamPolicy", {
          policy: {
            bindings: [
              {
                role: "roles/cloudfunctions.invoker",
                members: [
                  "serviceAccount:service-account1@project.iam.gserviceaccount.com",
                  "serviceAccount:service-account2@project.iam.gserviceaccount.com",
                  "serviceAccount:service-account3@project.iam.gserviceaccount.com",
                ],
              },
            ],
            etag: "",
            version: 3,
          },
          updateMask: "bindings,etag,version",
        })
        .reply(200, {});

      await expect(
        cloudfunctions.setInvokerCreate("project", "function", [
          "service-account1@",
          "service-account2@project.iam.gserviceaccount.com",
          "service-account3@",
        ]),
      ).to.not.be.rejected;
    });
  });

  describe("setInvokerUpdate", () => {
    it("should reject on emtpy invoker array", async () => {
      await expect(cloudfunctions.setInvokerUpdate("project", "function", [])).to.be.rejected;
    });

    it("should reject if the getting the IAM policy fails", async () => {
      nock(functionsOrigin()).get("/v1/function:getIamPolicy").reply(404, {});

      await expect(
        cloudfunctions.setInvokerUpdate("project", "function", ["public"]),
      ).to.be.rejectedWith("Failed to get the IAM Policy on the function function");
    });

    it("should reject if the setting the IAM policy fails", async () => {
      nock(functionsOrigin()).get("/v1/function:getIamPolicy").reply(200, {});
      nock(functionsOrigin())
        .post("/v1/function:setIamPolicy", {
          policy: {
            bindings: [{ role: "roles/cloudfunctions.invoker", members: ["allUsers"] }],
            etag: "",
            version: 3,
          },
          updateMask: "bindings,etag,version",
        })
        .reply(418, {});

      await expect(
        cloudfunctions.setInvokerUpdate("project", "function", ["public"]),
      ).to.be.rejectedWith("Failed to set the IAM Policy on the function function");
    });

    it("should set a basic policy on a function without any polices", async () => {
      nock(functionsOrigin()).get("/v1/function:getIamPolicy").reply(200, {});
      nock(functionsOrigin())
        .post("/v1/function:setIamPolicy", {
          policy: {
            bindings: [{ role: "roles/cloudfunctions.invoker", members: ["allUsers"] }],
            etag: "",
            version: 3,
          },
          updateMask: "bindings,etag,version",
        })
        .reply(200, {});

      await expect(cloudfunctions.setInvokerUpdate("project", "function", ["public"])).to.not.be
        .rejected;
    });

    it("should set the policy with private invoker with active policies", async () => {
      nock(functionsOrigin())
        .get("/v1/function:getIamPolicy")
        .reply(200, {
          bindings: [
            { role: "random-role", members: ["user:pineapple"] },
            { role: "roles/cloudfunctions.invoker", members: ["some-service-account"] },
          ],
          etag: "1234",
          version: 3,
        });
      nock(functionsOrigin())
        .post("/v1/function:setIamPolicy", {
          policy: {
            bindings: [
              { role: "random-role", members: ["user:pineapple"] },
              { role: "roles/cloudfunctions.invoker", members: [] },
            ],
            etag: "1234",
            version: 3,
          },
          updateMask: "bindings,etag,version",
        })
        .reply(200, {});

      await expect(cloudfunctions.setInvokerUpdate("project", "function", ["private"])).to.not.be
        .rejected;
    });

    it("should set the policy with a set of invokers with active policies", async () => {
      nock(functionsOrigin()).get("/v1/function:getIamPolicy").reply(200, {});
      nock(functionsOrigin())
        .post("/v1/function:setIamPolicy", {
          policy: {
            bindings: [
              {
                role: "roles/cloudfunctions.invoker",
                members: [
                  "serviceAccount:service-account1@project.iam.gserviceaccount.com",
                  "serviceAccount:service-account2@project.iam.gserviceaccount.com",
                  "serviceAccount:service-account3@project.iam.gserviceaccount.com",
                ],
              },
            ],
            etag: "",
            version: 3,
          },
          updateMask: "bindings,etag,version",
        })
        .reply(200, {});

      await expect(
        cloudfunctions.setInvokerUpdate("project", "function", [
          "service-account1@",
          "service-account2@project.iam.gserviceaccount.com",
          "service-account3@",
        ]),
      ).to.not.be.rejected;
    });

    it("should not set the policy if the set of invokers is the same as the current invokers", async () => {
      nock(functionsOrigin())
        .get("/v1/function:getIamPolicy")
        .reply(200, {
          bindings: [
            {
              role: "roles/cloudfunctions.invoker",
              members: [
                "serviceAccount:service-account1@project.iam.gserviceaccount.com",
                "serviceAccount:service-account3@project.iam.gserviceaccount.com",
                "serviceAccount:service-account2@project.iam.gserviceaccount.com",
              ],
            },
          ],
          etag: "1234",
          version: 3,
        });

      await expect(
        cloudfunctions.setInvokerUpdate("project", "function", [
          "service-account2@project.iam.gserviceaccount.com",
          "service-account3@",
          "service-account1@",
        ]),
      ).to.not.be.rejected;
    });
  });
});
