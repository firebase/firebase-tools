import { expect } from "chai";
import * as sinon from "sinon";
import * as api from "../../api";

import * as backend from "../../deploy/functions/backend";
import * as cloudfunctions from "../../gcp/cloudfunctions";

describe("cloudfunctions", () => {
  const FUNCTION_NAME: backend.TargetIds = {
    id: "id",
    region: "region",
    project: "project",
  };

  const FUNCTION_SPEC: backend.FunctionSpec = {
    platform: "gcfv1",
    ...FUNCTION_NAME,
    trigger: {},
    entryPoint: "function",
    runtime: "nodejs16",
  };

  // Omit a random trigger to make this compile
  const ENDPOINT: Omit<backend.Endpoint, "httpsTrigger"> = {
    platform: "gcfv1",
    ...FUNCTION_NAME,
    entryPoint: "function",
    runtime: "nodejs16",
  };

  const CLOUD_FUNCTION: Omit<cloudfunctions.CloudFunction, cloudfunctions.OutputOnlyFields> = {
    name: "projects/project/locations/region/functions/id",
    entryPoint: "function",
    runtime: "nodejs16",
  };

  const HAVE_CLOUD_FUNCTION: cloudfunctions.CloudFunction = {
    ...CLOUD_FUNCTION,
    buildId: "buildId",
    versionId: 1,
    updateTime: new Date(),
    status: "ACTIVE",
  };

  describe("functionFromEndpoint", () => {
    const UPLOAD_URL = "https://storage.googleapis.com/projects/-/buckets/sample/source.zip";
    it("should guard against version mixing", () => {
      expect(() => {
        cloudfunctions.functionFromEndpoint(
          { ...ENDPOINT, platform: "gcfv2", httpsTrigger: {} },
          UPLOAD_URL
        );
      }).to.throw;
    });

    it("should copy a minimal function", () => {
      expect(
        cloudfunctions.functionFromEndpoint({ ...ENDPOINT, httpsTrigger: {} }, UPLOAD_URL)
      ).to.deep.equal({
        ...CLOUD_FUNCTION,
        sourceUploadUrl: UPLOAD_URL,
        httpsTrigger: {},
      });

      const eventEndpoint = {
        ...ENDPOINT,
        eventTrigger: {
          eventType: "google.pubsub.topic.publish",
          eventFilters: {
            resource: "projects/p/topics/t",
          },
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
        eventGcfFunction
      );
    });

    it("should copy trival fields", () => {
      const fullEndpoint: backend.Endpoint = {
        ...ENDPOINT,
        httpsTrigger: {},
        availableMemoryMb: 128,
        minInstances: 1,
        maxInstances: 42,
        vpcConnector: "connector",
        vpcConnectorEgressSettings: "ALL_TRAFFIC",
        ingressSettings: "ALLOW_ALL",
        timeout: "15s",
        serviceAccountEmail: "inlined@google.com",
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
        timeout: "15s",
        serviceAccountEmail: "inlined@google.com",
      };

      expect(cloudfunctions.functionFromEndpoint(fullEndpoint, UPLOAD_URL)).to.deep.equal(
        fullGcfFunction
      );
    });

    it("should calculate non-trivial fields", () => {
      const complexEndpoint: backend.Endpoint = {
        ...ENDPOINT,
        scheduleTrigger: {},
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
        labels: {
          "deployment-scheduled": "true",
        },
      };

      expect(cloudfunctions.functionFromEndpoint(complexEndpoint, UPLOAD_URL)).to.deep.equal(
        complexGcfFunction
      );
    });
  });

  describe("endpointFromFunction", () => {
    it("should copy a minimal version", () => {
      expect(
        cloudfunctions.endpointFromFunction({
          ...HAVE_CLOUD_FUNCTION,
          httpsTrigger: {},
        })
      ).to.deep.equal({ ...ENDPOINT, httpsTrigger: {} });
    });

    it("should translate event triggers", () => {
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
        })
      ).to.deep.equal({
        ...ENDPOINT,
        eventTrigger: {
          eventType: "google.pubsub.topic.publish",
          eventFilters: {
            resource: "projects/p/topics/t",
          },
          retry: true,
        },
      });

      // And again w/o the failure policy
      expect(
        cloudfunctions.endpointFromFunction({
          ...HAVE_CLOUD_FUNCTION,
          eventTrigger: {
            eventType: "google.pubsub.topic.publish",
            resource: "projects/p/topics/t",
          },
        })
      ).to.deep.equal({
        ...ENDPOINT,
        eventTrigger: {
          eventType: "google.pubsub.topic.publish",
          eventFilters: {
            resource: "projects/p/topics/t",
          },
          retry: false,
        },
      });
    });

    it("should transalte scheduled triggers", () => {
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
        })
      ).to.deep.equal({
        ...ENDPOINT,
        scheduleTrigger: {},
        labels: {
          "deployment-scheduled": "true",
        },
      });
    });

    it("should copy optional fields", () => {
      const extraFields: Partial<backend.Endpoint> = {
        availableMemoryMb: 128,
        minInstances: 1,
        maxInstances: 42,
        vpcConnector: "connector",
        vpcConnectorEgressSettings: "ALL_TRAFFIC",
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
      expect(
        cloudfunctions.endpointFromFunction({
          ...HAVE_CLOUD_FUNCTION,
          ...extraFields,
          httpsTrigger: {},
        } as cloudfunctions.CloudFunction)
      ).to.deep.equal({
        ...ENDPOINT,
        ...extraFields,
        httpsTrigger: {},
      });
    });
  });

  describe("functionFromSpec", () => {
    const UPLOAD_URL = "https://storage.googleapis.com/projects/-/buckets/sample/source.zip";
    it("should guard against version mixing", () => {
      expect(() => {
        cloudfunctions.functionFromSpec({ ...FUNCTION_SPEC, platform: "gcfv2" }, UPLOAD_URL);
      }).to.throw;
    });

    it("should copy a minimal function", () => {
      expect(cloudfunctions.functionFromSpec(FUNCTION_SPEC, UPLOAD_URL)).to.deep.equal({
        ...CLOUD_FUNCTION,
        sourceUploadUrl: UPLOAD_URL,
        httpsTrigger: {},
      });

      const eventFunction = {
        ...FUNCTION_SPEC,
        trigger: {
          eventType: "google.pubsub.topic.publish",
          eventFilters: {
            resource: "projects/p/topics/t",
          },
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
      expect(cloudfunctions.functionFromSpec(eventFunction, UPLOAD_URL)).to.deep.equal(
        eventGcfFunction
      );
    });

    it("should copy trival fields", () => {
      const fullFunction: backend.FunctionSpec = {
        ...FUNCTION_SPEC,
        availableMemoryMb: 128,
        minInstances: 1,
        maxInstances: 42,
        vpcConnector: "connector",
        vpcConnectorEgressSettings: "ALL_TRAFFIC",
        ingressSettings: "ALLOW_ALL",
        timeout: "15s",
        serviceAccountEmail: "inlined@google.com",
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
        timeout: "15s",
        serviceAccountEmail: "inlined@google.com",
      };

      expect(cloudfunctions.functionFromSpec(fullFunction, UPLOAD_URL)).to.deep.equal(
        fullGcfFunction
      );
    });

    it("should calculate non-trivial fields", () => {
      const complexFunction: backend.FunctionSpec = {
        ...FUNCTION_SPEC,
        trigger: {
          eventType: "google.pubsub.topic.publish",
          eventFilters: {
            resource: "projects/p/topics/t",
          },
          retry: true,
        },
      };

      const complexGcfFunction: Omit<
        cloudfunctions.CloudFunction,
        cloudfunctions.OutputOnlyFields
      > = {
        ...CLOUD_FUNCTION,
        sourceUploadUrl: UPLOAD_URL,
        eventTrigger: {
          eventType: "google.pubsub.topic.publish",
          resource: "projects/p/topics/t",
          failurePolicy: {
            retry: {},
          },
        },
      };

      expect(cloudfunctions.functionFromSpec(complexFunction, UPLOAD_URL)).to.deep.equal(
        complexGcfFunction
      );
    });
  });

  describe("specFromFunction", () => {
    it("should copy a minimal version", () => {
      expect(
        cloudfunctions.specFromFunction({
          ...HAVE_CLOUD_FUNCTION,
          httpsTrigger: {},
        })
      ).to.deep.equal(FUNCTION_SPEC);
    });

    it("should translate event triggers", () => {
      expect(
        cloudfunctions.specFromFunction({
          ...HAVE_CLOUD_FUNCTION,
          eventTrigger: {
            eventType: "google.pubsub.topic.publish",
            resource: "projects/p/topics/t",
            failurePolicy: {
              retry: {},
            },
          },
        })
      ).to.deep.equal({
        ...FUNCTION_SPEC,
        trigger: {
          eventType: "google.pubsub.topic.publish",
          eventFilters: {
            resource: "projects/p/topics/t",
          },
          retry: true,
        },
      });

      // And again w/o the failure policy
      expect(
        cloudfunctions.specFromFunction({
          ...HAVE_CLOUD_FUNCTION,
          eventTrigger: {
            eventType: "google.pubsub.topic.publish",
            resource: "projects/p/topics/t",
          },
        })
      ).to.deep.equal({
        ...FUNCTION_SPEC,
        trigger: {
          eventType: "google.pubsub.topic.publish",
          eventFilters: {
            resource: "projects/p/topics/t",
          },
          retry: false,
        },
      });
    });

    it("should copy optional fields", () => {
      const extraFields: Partial<backend.FunctionSpec> = {
        availableMemoryMb: 128,
        minInstances: 1,
        maxInstances: 42,
        vpcConnector: "connector",
        vpcConnectorEgressSettings: "ALL_TRAFFIC",
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
      expect(
        cloudfunctions.specFromFunction({
          ...HAVE_CLOUD_FUNCTION,
          ...extraFields,
          httpsTrigger: {},
        } as cloudfunctions.CloudFunction)
      ).to.deep.equal({
        ...FUNCTION_SPEC,
        ...extraFields,
        trigger: {},
      });
    });

    it("should transform fields", () => {
      expect(
        cloudfunctions.specFromFunction({
          ...HAVE_CLOUD_FUNCTION,
          httpsTrigger: {},
        })
      ).to.deep.equal({
        ...FUNCTION_SPEC,
        trigger: {},
      });
    });
  });

  describe("setInvokerCreate", () => {
    let sandbox: sinon.SinonSandbox;
    let apiRequestStub: sinon.SinonStub;

    beforeEach(() => {
      sandbox = sinon.createSandbox();
      apiRequestStub = sandbox.stub(api, "request").throws("Unexpected API request call");
    });

    afterEach(() => {
      sandbox.restore();
    });

    it("should reject on emtpy invoker array", async () => {
      await expect(cloudfunctions.setInvokerCreate("project", "function", [])).to.be.rejected;
    });

    it("should reject if the setting the IAM policy fails", async () => {
      apiRequestStub.onFirstCall().throws("Error calling set api.");

      await expect(
        cloudfunctions.setInvokerCreate("project", "function", ["public"])
      ).to.be.rejectedWith("Failed to set the IAM Policy on the function function");
      expect(apiRequestStub).to.be.calledOnce;
    });

    it("should set a private policy on a function", async () => {
      apiRequestStub.onFirstCall().callsFake((method: any, resource: any, options: any) => {
        expect(options.data.policy).to.deep.eq({
          bindings: [
            {
              role: "roles/cloudfunctions.invoker",
              members: [],
            },
          ],
          etag: "",
          version: 3,
        });

        return Promise.resolve();
      });

      await expect(cloudfunctions.setInvokerCreate("project", "function", ["private"])).to.not.be
        .rejected;
      expect(apiRequestStub).to.be.calledOnce;
    });

    it("should set a public policy on a function", async () => {
      apiRequestStub.onFirstCall().callsFake((method: any, resource: any, options: any) => {
        expect(options.data.policy).to.deep.eq({
          bindings: [
            {
              role: "roles/cloudfunctions.invoker",
              members: ["allUsers"],
            },
          ],
          etag: "",
          version: 3,
        });

        return Promise.resolve();
      });

      await expect(cloudfunctions.setInvokerCreate("project", "function", ["public"])).to.not.be
        .rejected;
      expect(apiRequestStub).to.be.calledOnce;
    });

    it("should set the policy with a set of invokers with active policies", async () => {
      apiRequestStub.onFirstCall().callsFake((method: any, resource: any, options: any) => {
        options.data.policy.bindings[0].members.sort();
        expect(options.data.policy.bindings[0].members).to.deep.eq([
          "serviceAccount:service-account1@project.iam.gserviceaccount.com",
          "serviceAccount:service-account2@project.iam.gserviceaccount.com",
          "serviceAccount:service-account3@project.iam.gserviceaccount.com",
        ]);

        return Promise.resolve();
      });

      await expect(
        cloudfunctions.setInvokerCreate("project", "function", [
          "service-account1@",
          "service-account2@project.iam.gserviceaccount.com",
          "service-account3@",
        ])
      ).to.not.be.rejected;
      expect(apiRequestStub).to.be.calledOnce;
    });
  });

  describe("setInvokerUpdate", () => {
    let sandbox: sinon.SinonSandbox;
    let apiRequestStub: sinon.SinonStub;

    beforeEach(() => {
      sandbox = sinon.createSandbox();
      apiRequestStub = sandbox.stub(api, "request").throws("Unexpected API request call");
    });

    afterEach(() => {
      sandbox.restore();
    });

    it("should reject on emtpy invoker array", async () => {
      await expect(cloudfunctions.setInvokerUpdate("project", "function", [])).to.be.rejected;
    });

    it("should reject if the getting the IAM policy fails", async () => {
      apiRequestStub.onFirstCall().throws("Error calling get api.");

      await expect(
        cloudfunctions.setInvokerUpdate("project", "function", ["public"])
      ).to.be.rejectedWith("Failed to get the IAM Policy on the function function");

      expect(apiRequestStub).to.be.called;
    });

    it("should reject if the setting the IAM policy fails", async () => {
      apiRequestStub.onFirstCall().resolves({});
      apiRequestStub.onSecondCall().throws("Error calling set api.");

      await expect(
        cloudfunctions.setInvokerUpdate("project", "function", ["public"])
      ).to.be.rejectedWith("Failed to set the IAM Policy on the function function");
      expect(apiRequestStub).to.be.calledTwice;
    });

    it("should set a basic policy on a function without any polices", async () => {
      apiRequestStub.onFirstCall().resolves({});
      apiRequestStub.onSecondCall().callsFake((method: any, resource: any, options: any) => {
        expect(options.data.policy).to.deep.eq({
          bindings: [
            {
              role: "roles/cloudfunctions.invoker",
              members: ["allUsers"],
            },
          ],
          etag: "",
          version: 3,
        });

        return Promise.resolve();
      });

      await expect(cloudfunctions.setInvokerUpdate("project", "function", ["public"])).to.not.be
        .rejected;
      expect(apiRequestStub).to.be.calledTwice;
    });

    it("should set the policy with private invoker with active policies", async () => {
      apiRequestStub.onFirstCall().resolves({
        bindings: [
          { role: "random-role", members: ["user:pineapple"] },
          { role: "roles/cloudfunctions.invoker", members: ["some-service-account"] },
        ],
        etag: "1234",
        version: 3,
      });
      apiRequestStub.onSecondCall().callsFake((method: any, resource: any, options: any) => {
        expect(options.data.policy).to.deep.eq({
          bindings: [
            { role: "random-role", members: ["user:pineapple"] },
            { role: "roles/cloudfunctions.invoker", members: [] },
          ],
          etag: "1234",
          version: 3,
        });

        return Promise.resolve();
      });

      await expect(cloudfunctions.setInvokerUpdate("project", "function", ["private"])).to.not.be
        .rejected;
      expect(apiRequestStub).to.be.calledTwice;
    });

    it("should set the policy with a set of invokers with active policies", async () => {
      apiRequestStub.onFirstCall().resolves({});
      apiRequestStub.onSecondCall().callsFake((method: any, resource: any, options: any) => {
        options.data.policy.bindings[0].members.sort();
        expect(options.data.policy.bindings[0].members).to.deep.eq([
          "serviceAccount:service-account1@project.iam.gserviceaccount.com",
          "serviceAccount:service-account2@project.iam.gserviceaccount.com",
          "serviceAccount:service-account3@project.iam.gserviceaccount.com",
        ]);

        return Promise.resolve();
      });

      await expect(
        cloudfunctions.setInvokerUpdate("project", "function", [
          "service-account1@",
          "service-account2@project.iam.gserviceaccount.com",
          "service-account3@",
        ])
      ).to.not.be.rejected;
      expect(apiRequestStub).to.be.calledTwice;
    });

    it("should not set the policy if the set of invokers is the same as the current invokers", async () => {
      apiRequestStub.onFirstCall().resolves({
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
        ])
      ).to.not.be.rejected;
      expect(apiRequestStub).to.be.calledOnce;
    });
  });
});
