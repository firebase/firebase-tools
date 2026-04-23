import { expect } from "chai";
import * as sinon from "sinon";
import * as run from "./run";
import { Client } from "../apiv2";

describe("run", () => {
  describe("setInvokerCreate", () => {
    let sandbox: sinon.SinonSandbox;
    let apiRequestStub: sinon.SinonStub;
    let client: Client;

    beforeEach(() => {
      client = new Client({
        urlPrefix: "origin",
        auth: true,
        apiVersion: "v1",
      });
      sandbox = sinon.createSandbox();
      apiRequestStub = sandbox.stub(client, "post").throws("Unexpected API post call");
    });

    afterEach(() => {
      sandbox.restore();
    });

    it("should reject on emtpy invoker array", async () => {
      await expect(run.setInvokerCreate("project", "service", [], client)).to.be.rejected;
    });

    it("should reject if the setting the IAM policy fails", async () => {
      apiRequestStub.onFirstCall().throws("Error calling set api.");

      await expect(
        run.setInvokerCreate("project", "service", ["public"], client),
      ).to.be.rejectedWith("Failed to set the IAM Policy on the Service service");
      expect(apiRequestStub).to.be.calledOnce;
    });

    it("should set a private policy on a function", async () => {
      apiRequestStub.onFirstCall().callsFake((path: string, json: any) => {
        expect(json.policy).to.deep.eq({
          bindings: [
            {
              role: "roles/run.invoker",
              members: [],
            },
          ],
          etag: "",
          version: 3,
        });

        return Promise.resolve();
      });

      await expect(run.setInvokerCreate("project", "service", ["private"], client)).to.not.be
        .rejected;
      expect(apiRequestStub).to.be.calledOnce;
    });

    it("should set a public policy on a function", async () => {
      apiRequestStub.onFirstCall().callsFake((path: string, json: any) => {
        expect(json.policy).to.deep.eq({
          bindings: [
            {
              role: "roles/run.invoker",
              members: ["allUsers"],
            },
          ],
          etag: "",
          version: 3,
        });

        return Promise.resolve();
      });

      await expect(run.setInvokerCreate("project", "service", ["public"], client)).to.not.be
        .rejected;
      expect(apiRequestStub).to.be.calledOnce;
    });

    it("should set the policy with a set of invokers with active policies", async () => {
      apiRequestStub.onFirstCall().callsFake((path: string, json: any) => {
        json.policy.bindings[0].members.sort();
        expect(json.policy.bindings[0].members).to.deep.eq([
          "serviceAccount:service-account1@project.iam.gserviceaccount.com",
          "serviceAccount:service-account2@project.iam.gserviceaccount.com",
          "serviceAccount:service-account3@project.iam.gserviceaccount.com",
        ]);

        return Promise.resolve();
      });

      await expect(
        run.setInvokerCreate(
          "project",
          "service",
          [
            "service-account1@",
            "service-account2@project.iam.gserviceaccount.com",
            "service-account3@",
          ],
          client,
        ),
      ).to.not.be.rejected;
      expect(apiRequestStub).to.be.calledOnce;
    });
  });

  describe("setInvokerUpdate", () => {
    describe("setInvokerCreate", () => {
      let sandbox: sinon.SinonSandbox;
      let apiPostStub: sinon.SinonStub;
      let apiGetStub: sinon.SinonStub;
      let client: Client;

      beforeEach(() => {
        client = new Client({
          urlPrefix: "origin",
          auth: true,
          apiVersion: "v1",
        });
        sandbox = sinon.createSandbox();
        apiPostStub = sandbox.stub(client, "post").throws("Unexpected API post call");
        apiGetStub = sandbox.stub(client, "get").throws("Unexpected API get call");
      });

      afterEach(() => {
        sandbox.restore();
      });

      it("should reject on emtpy invoker array", async () => {
        await expect(run.setInvokerUpdate("project", "service", [])).to.be.rejected;
      });

      it("should reject if the getting the IAM policy fails", async () => {
        apiGetStub.onFirstCall().throws("Error calling get api.");

        await expect(
          run.setInvokerUpdate("project", "service", ["public"], undefined, client),
        ).to.be.rejectedWith("Failed to get the IAM Policy on the Service service");

        expect(apiGetStub).to.be.called;
      });

      it("should reject if the setting the IAM policy fails", async () => {
        apiGetStub.resolves({ body: {} });
        apiPostStub.throws("Error calling set api.");

        await expect(
          run.setInvokerUpdate("project", "service", ["public"], undefined, client),
        ).to.be.rejectedWith("Failed to set the IAM Policy on the Service service");
        expect(apiGetStub).to.be.calledOnce;
        expect(apiPostStub).to.be.calledOnce;
      });

      it("should set a basic policy on a function without any polices", async () => {
        apiGetStub.onFirstCall().resolves({ body: {} });
        apiPostStub.onFirstCall().callsFake((path: string, json: any) => {
          expect(json.policy).to.deep.eq({
            bindings: [
              {
                role: "roles/run.invoker",
                members: ["allUsers"],
              },
            ],
            etag: "",
            version: 3,
          });

          return Promise.resolve();
        });

        await expect(
          run.setInvokerUpdate("project", "service", ["public"], undefined, client),
        ).to.not.be.rejected;
        expect(apiGetStub).to.be.calledOnce;
        expect(apiPostStub).to.be.calledOnce;
      });

      it("should set the policy with private invoker with active policies", async () => {
        apiGetStub.onFirstCall().resolves({
          body: {
            bindings: [
              { role: "random-role", members: ["user:pineapple"] },
              { role: "roles/run.invoker", members: ["some-service-account"] },
            ],
            etag: "1234",
            version: 3,
          },
        });
        apiPostStub.onFirstCall().callsFake((path: string, json: any) => {
          expect(json.policy).to.deep.eq({
            bindings: [
              { role: "random-role", members: ["user:pineapple"] },
              { role: "roles/run.invoker", members: [] },
            ],
            etag: "1234",
            version: 3,
          });

          return Promise.resolve();
        });

        await expect(
          run.setInvokerUpdate("project", "service", ["private"], undefined, client),
        ).to.not.be.rejected;
        expect(apiGetStub).to.be.calledOnce;
        expect(apiPostStub).to.be.calledOnce;
      });

      it("should set the policy with a set of invokers with active policies", async () => {
        apiGetStub.onFirstCall().resolves({ body: {} });
        apiPostStub.onFirstCall().callsFake((path: string, json: any) => {
          const invoker = json.policy.bindings.find(
            (b: any) => b.role === "roles/run.invoker" && !b.condition,
          );
          invoker.members.sort();
          expect(invoker.members).to.deep.eq([
            "serviceAccount:service-account1@project.iam.gserviceaccount.com",
            "serviceAccount:service-account2@project.iam.gserviceaccount.com",
            "serviceAccount:service-account3@project.iam.gserviceaccount.com",
          ]);

          return Promise.resolve();
        });

        await expect(
          run.setInvokerUpdate(
            "project",
            "service",
            [
              "service-account1@",
              "service-account2@project.iam.gserviceaccount.com",
              "service-account3@",
            ],
            undefined,
            client,
          ),
        ).to.not.be.rejected;
        expect(apiGetStub).to.be.calledOnce;
        expect(apiPostStub).to.be.calledOnce;
      });

      it("should not set the policy if the set of invokers is the same as the current invokers", async () => {
        apiGetStub.onFirstCall().resolves({
          body: {
            bindings: [
              {
                role: "roles/run.invoker",
                members: [
                  "serviceAccount:service-account1@project.iam.gserviceaccount.com",
                  "serviceAccount:service-account3@project.iam.gserviceaccount.com",
                  "serviceAccount:service-account2@project.iam.gserviceaccount.com",
                ],
              },
            ],
            etag: "1234",
            version: 3,
          },
        });

        await expect(
          run.setInvokerUpdate(
            "project",
            "service",
            [
              "service-account2@project.iam.gserviceaccount.com",
              "service-account3@",
              "service-account1@",
            ],
            undefined,
            client,
          ),
        ).to.not.be.rejected;
        expect(apiGetStub).to.be.calledOnce;
        expect(apiPostStub).to.not.be.called;
      });

      it("merges existing invoker members when mergeExistingMembers is true", async () => {
        apiGetStub.onFirstCall().resolves({
          body: {
            bindings: [
              {
                role: "roles/run.invoker",
                members: ["user:kept@example.com"],
              },
              { role: "random-role", members: ["user:other"] },
            ],
            etag: "abc",
            version: 3,
          },
        });
        apiPostStub.onFirstCall().callsFake((path: string, json: any) => {
          const invoker = json.policy.bindings.find(
            (b: any) => b.role === "roles/run.invoker" && !b.condition,
          );
          expect(invoker.members.sort()).to.deep.equal(
            ["allUsers", "user:kept@example.com"].sort(),
          );
          expect(json.policy.bindings).to.deep.include({
            role: "random-role",
            members: ["user:other"],
          });
          expect(json.policy.etag).to.equal("abc");
          return Promise.resolve();
        });

        await expect(
          run.setInvokerUpdate(
            "project",
            "service",
            ["public"],
            { mergeExistingMembers: true },
            client,
          ),
        ).to.not.be.rejected;
        expect(apiGetStub).to.be.calledOnce;
        expect(apiPostStub).to.be.calledOnce;
      });

      it("replaces members (no merge) when mergeExistingMembers is false", async () => {
        apiGetStub.onFirstCall().resolves({
          body: {
            bindings: [
              {
                role: "roles/run.invoker",
                members: ["user:stale@example.com"],
              },
            ],
            etag: "abc",
            version: 3,
          },
        });
        apiPostStub.onFirstCall().callsFake((path: string, json: any) => {
          const invoker = json.policy.bindings.find(
            (b: any) => b.role === "roles/run.invoker" && !b.condition,
          );
          expect(invoker.members).to.deep.equal(["allUsers"]);
          return Promise.resolve();
        });

        await expect(
          run.setInvokerUpdate(
            "project",
            "service",
            ["public"],
            { mergeExistingMembers: false },
            client,
          ),
        ).to.not.be.rejected;
        expect(apiGetStub).to.be.calledOnce;
        expect(apiPostStub).to.be.calledOnce;
      });

      it("preserves conditional invoker bindings when updating", async () => {
        const conditional = {
          role: "roles/run.invoker",
          members: ["serviceAccount:gated@project.iam.gserviceaccount.com"],
          condition: { expression: "request.time < timestamp('2030-01-01T00:00:00Z')" },
        };
        apiGetStub.onFirstCall().resolves({
          body: {
            bindings: [
              conditional,
              {
                role: "roles/run.invoker",
                members: ["user:old@example.com"],
              },
            ],
            etag: "abc",
            version: 3,
          },
        });
        apiPostStub.onFirstCall().callsFake((path: string, json: any) => {
          // conditional binding survives
          expect(json.policy.bindings).to.deep.include(conditional);
          // unconditional binding was replaced (default behavior)
          const unconditional = json.policy.bindings.find(
            (b: any) => b.role === "roles/run.invoker" && !b.condition,
          );
          expect(unconditional.members).to.deep.equal(["allUsers"]);
          return Promise.resolve();
        });

        await expect(
          run.setInvokerUpdate("project", "service", ["public"], undefined, client),
        ).to.not.be.rejected;
        expect(apiGetStub).to.be.calledOnce;
        expect(apiPostStub).to.be.calledOnce;
      });
    });
  });
  describe("updateService", () => {
    let service: run.Service;
    let serviceIsResolved: sinon.SinonStub;
    let replaceService: sinon.SinonStub;
    let getService: sinon.SinonStub;

    beforeEach(() => {
      serviceIsResolved = sinon
        .stub(run, "serviceIsResolved")
        .throws(new Error("Unexpected serviceIsResolved call"));
      replaceService = sinon
        .stub(run, "replaceService")
        .throws(new Error("Unexpected replaceService call"));
      getService = sinon.stub(run, "getService").throws(new Error("Unexpected getService call"));

      service = {
        apiVersion: "serving.knative.dev/v1",
        kind: "Service",
        metadata: {
          name: "service",
          namespace: "project",
        },
        spec: {
          template: {
            metadata: {
              name: "service",
              namespace: "project",
            },
            spec: {
              containerConcurrency: 1,
              containers: [
                {
                  image: "image",
                  ports: [
                    {
                      name: "main",
                      containerPort: 8080,
                    },
                  ],
                  env: {},
                  resources: {
                    limits: {
                      memory: "256M",
                      cpu: "0.1667",
                    },
                  },
                },
              ],
            },
          },
          traffic: [],
        },
      };
    });

    afterEach(() => {
      serviceIsResolved.restore();
      getService.restore();
      replaceService.restore();
    });

    it("handles noops immediately", async () => {
      replaceService.resolves(service);
      getService.resolves(service);
      serviceIsResolved.returns(true);
      await run.updateService("name", service);

      expect(replaceService).to.have.been.calledOnce;
      expect(serviceIsResolved).to.have.been.calledOnce;
      expect(getService).to.not.have.been.called;
    });

    it("loops on ready status", async () => {
      replaceService.resolves(service);
      getService.resolves(service);
      serviceIsResolved.onFirstCall().returns(false);
      serviceIsResolved.onSecondCall().returns(true);
      await run.updateService("name", service);

      expect(replaceService).to.have.been.calledOnce;
      expect(serviceIsResolved).to.have.been.calledTwice;
      expect(getService).to.have.been.calledOnce;
    });
  });

  describe("serviceIsResolved", () => {
    let service: run.Service;
    beforeEach(() => {
      service = {
        apiVersion: "serving.knative.dev/v1",
        kind: "Service",
        metadata: {
          name: "service",
          namespace: "project",
          generation: 2,
        },
        spec: {
          template: {
            metadata: {
              name: "service",
              namespace: "project",
            },
            spec: {
              containerConcurrency: 1,
              containers: [
                {
                  image: "image",
                  ports: [
                    {
                      name: "main",
                      containerPort: 8080,
                    },
                  ],
                  env: {},
                  resources: {
                    limits: {
                      memory: "256M",
                      cpu: "0.1667",
                    },
                  },
                },
              ],
            },
          },
          traffic: [],
        },
        status: {
          observedGeneration: 2,
          conditions: [
            {
              status: "True",
              type: "Ready",
              reason: "Testing",
              lastTransitionTime: "",
              message: "",
              severity: "Info",
            },
          ],
          latestCreatedRevisionName: "",
          latestReadyRevisionName: "",
          traffic: [],
          url: "",
          address: {
            url: "",
          },
        },
      };
    });

    it("returns false if the observed generation isn't the metageneration", () => {
      service.status!.observedGeneration = 1;
      service.metadata.generation = 2;
      expect(run.serviceIsResolved(service)).to.be.false;
    });

    it("returns false if the status is not ready", () => {
      service.status!.observedGeneration = 2;
      service.metadata.generation = 2;
      service.status!.conditions[0].status = "Unknown";
      service.status!.conditions[0].type = "Ready";

      expect(run.serviceIsResolved(service)).to.be.false;
    });

    it("throws if we have an failed status", () => {
      service.status!.observedGeneration = 2;
      service.metadata.generation = 2;
      service.status!.conditions[0].status = "False";
      service.status!.conditions[0].type = "Ready";

      expect(() => run.serviceIsResolved(service)).to.throw;
    });

    it("returns true if resolved", () => {
      service.status!.observedGeneration = 2;
      service.metadata.generation = 2;
      service.status!.conditions[0].status = "True";
      service.status!.conditions[0].type = "Ready";

      expect(run.serviceIsResolved(service)).to.be.true;
    });
  });
});
