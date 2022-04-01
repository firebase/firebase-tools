import { expect } from "chai";
import * as sinon from "sinon";

import * as iam from "../../../gcp/iam";
import * as storage from "../../../gcp/storage";
import * as backend from "../../../deploy/functions/backend";
import { IamBindings, IamBinder, splitResource } from "../../../deploy/functions/iambinder";

function expectBindings(a: IamBindings, want: iam.Binding[]) {
  const b = IamBindings.fromIamBindings(want);
  const diff = b.diff(a);
  expect(diff.additions).to.be.empty;
}

function expectExactBindings(a: IamBindings, want: iam.Binding[]) {
  const b = IamBindings.fromIamBindings(want);

  const abdiff = a.diff(b);
  const badiff = b.diff(a);

  expect(abdiff.additions).to.be.empty;
  expect(badiff.additions).to.be.empty;
}

describe("iambinder", () => {
  describe("splitResource", () => {
    it("splits resource names into respective components", () => {
      expect(splitResource("//cloudresourcemanager.googleapis.com/projects/12345")).to.deep.equal({
        service: "cloudresourcemanager.googleapis.com",
        resource: "projects/12345",
      });
    });
  });

  describe("IamBindings", () => {
    describe(".fromIamBinding", () => {
      it("loads all iam.Bindings properties", () => {
        const bindings: iam.Binding[] = [
          {
            role: "roles/x",
            members: ["a", "b", "c"],
          },
          {
            role: "roles/y",
            members: ["a", "b", "c"],
            condition: {
              title: "abc",
              expression: "request.time < timestamp('2020-10-01T00:00:00.000Z')",
            },
          },
        ];
        const got = IamBindings.fromIamBindings(bindings).asIamBindings();

        expect(got).to.have.length(bindings.length);
        expect(got).to.include.deep.members(bindings);
      });

      it("handles empty binding", () => {
        const bindings: iam.Binding[] = [];
        expect(IamBindings.fromIamBindings(bindings).asIamBindings()).to.deep.equal(bindings);
      });
    });

    describe(".add", () => {
      it("adds bindings with many roles", () => {
        const a = new IamBindings();
        a.add("roles/x", ["a", "b", "c"]);
        a.add("roles/y", ["d"]);

        expectExactBindings(a, [
          { role: "roles/x", members: ["a", "b", "c"] },
          { role: "roles/y", members: ["d"] },
        ]);
      });

      it("appends members given same roles", () => {
        const a = new IamBindings();
        a.add("roles/x", ["a", "b", "c"]);
        a.add("roles/x", ["d", "e"]);
        expectExactBindings(a, [{ role: "roles/x", members: ["a", "b", "c", "d", "e"] }]);
      });

      it("handles duplicates", () => {
        const a = new IamBindings();
        a.add("roles/x", ["a", "b", "c"]);
        a.add("roles/x", ["b", "c"]);
        a.add("roles/x", ["d", "d", "e"]);
        expectExactBindings(a, [{ role: "roles/x", members: ["a", "b", "c", "d", "e"] }]);
      });

      it("groups role members by condition", () => {
        const a = new IamBindings();
        a.add("roles/x", ["a"], { expression: "a condition" });
        a.add("roles/x", ["b"]);
        a.add("roles/x", ["c"], { expression: "a condition" });
        expectExactBindings(a, [
          { role: "roles/x", members: ["a", "c"], condition: { expression: "a condition" } },
          { role: "roles/x", members: ["b"] },
        ]);
      });
    });

    describe("diff", () => {
      it("returns the same bindings given empty diff base", () => {
        const a = new IamBindings();
        a.add("roles/x", ["a"], { expression: "a condition" });
        a.add("roles/x", ["b"]);
        a.add("roles/x", ["c"], { expression: "a condition" });

        const got = a.diff(new IamBindings());

        expectExactBindings(got, a.asIamBindings());
      });

      it("removes members present in other bindings", () => {
        const a = new IamBindings();
        a.add("roles/x", ["a", "b"]);

        const b = new IamBindings();
        b.add("roles/x", ["b", "c"]);

        const got = a.diff(b);

        expectExactBindings(got, [{ role: "roles/x", members: ["a"] }]);
      });

      it("removes only members w/ matching condition", () => {
        const a = new IamBindings();
        a.add("roles/x", ["a", "b"]);
        a.add("roles/x", ["c", "d"], { expression: "some condition" });

        const b = new IamBindings();
        b.add("roles/x", ["a", "c"], { expression: "some condition" });
        b.add("roles/x", ["d"]);

        const got = a.diff(b);

        expectExactBindings(got, [
          { role: "roles/x", members: ["a", "b"] },
          { role: "roles/x", members: ["d"], condition: { expression: "some condition" } },
        ]);
      });

      it("removes role/condition if all members are removed", () => {
        const a = new IamBindings();
        a.add("roles/x", ["a", "b"]);
        a.add("roles/x", ["c", "d"], { expression: "some condition" });
        a.add("roles/y", ["e", "f"]);

        const b = new IamBindings();
        b.add("roles/x", ["a", "d", "c", "b"]);
        b.add("roles/x", ["c", "e", "f", "d"], { expression: "some condition" });
        b.add("roles/y", ["a", "e", "f", "d"]);
        b.add("roles/y", ["a", "e", "f", "d"], { expression: "some condition" });

        const got = a.diff(b);

        expectExactBindings(got, []);
      });
    });

    describe("merge", () => {
      it("combines simple roles", () => {
        const a = new IamBindings();
        a.add("roles/x", ["a", "b"]);

        const b = new IamBindings();
        b.add("roles/x", ["a", "c", "d"]);

        const got = a.merge(b);

        expectExactBindings(got, [{ role: "roles/x", members: ["a", "b", "c", "d"] }]);
      });

      it("combines simple roles with conditions correctly", () => {
        const a = new IamBindings();
        a.add("roles/x", ["a", "b"]);
        a.add("roles/x", ["c", "d"], { expression: "some condition" });

        const b = new IamBindings();
        b.add("roles/x", ["c", "d"]);
        b.add("roles/x", ["a", "b"], { expression: "some condition" });

        const got = a.merge(b);

        expectExactBindings(got, [
          { role: "roles/x", members: ["a", "b", "c", "d"] },
          {
            role: "roles/x",
            members: ["c", "d", "a", "b"],
            condition: { expression: "some condition" },
          },
        ]);
      });

      it("does nothing when merging with empty binding", () => {
        const a = new IamBindings();
        a.add("roles/x", ["a", "b"]);
        a.add("roles/x", ["c", "d"], { expression: "some condition" });

        const got = a.merge(new IamBindings());

        expectExactBindings(got, a.asIamBindings());
      });
    });

    describe("clone", () => {
      it("returns same bindings as the original", () => {
        const a = new IamBindings();
        a.add("roles/x", ["a", "b"]);
        a.add("roles/x", ["c", "d"], { expression: "some condition" });

        const got = a.clone();

        expectExactBindings(got, a.asIamBindings());
      });

      it("returns deeply copied members", () => {
        const orig = new IamBindings();
        orig.add("roles/x", ["a", "b"]);
        orig.add("roles/x", ["c", "d"], { expression: "some condition" });

        const cloned = orig.clone();
        cloned.add("roles/x", ["c"]);

        expect(cloned.asIamBindings()).to.not.deep.equal(orig.asIamBindings());
      });
    });
  });

  describe("IamBinder", () => {
    let storageServiceAccountStub: sinon.SinonStub;

    const PROJECT_ID = "project";
    const PROJECT_NUMBER = "12345";

    beforeEach(() => {
      storageServiceAccountStub = sinon.stub(storage, "getServiceAccount");
      storageServiceAccountStub.rejects("Unexpected call");
    });

    afterEach(() => {
      storageServiceAccountStub.restore();
    });

    describe("addEndpoints", () => {
      const BASE_ENDPOINT: Omit<backend.Endpoint, "httpsTrigger"> = {
        id: "id",
        region: "region",
        project: PROJECT_ID,
        platform: "gcfv1",
        entryPoint: "fn",
        runtime: "nodejs16",
      };

      it("does nothing given endpoints without IAM requirements", async () => {
        const endpoints: backend.Endpoint[] = [
          {
            ...BASE_ENDPOINT,
            httpsTrigger: {},
          },
          {
            ...BASE_ENDPOINT,
            eventTrigger: { eventType: "some-event", eventFilters: {}, retry: false },
          },
        ];

        const binder = new IamBinder(PROJECT_ID, PROJECT_NUMBER);
        await binder.addEndpoints(endpoints);
        const got = binder.additions;

        expect(got).to.be.empty;
      });

      describe("secrets", () => {
        it("adds binding to default service account given endpoints with secrets", async () => {
          const endpoints: backend.Endpoint[] = [
            {
              ...BASE_ENDPOINT,
              httpsTrigger: {},
              secretEnvironmentVariables: [
                {
                  secret: "MY_SECRET",
                  key: "MY_SECRET",
                  projectId: PROJECT_ID,
                },
                {
                  secret: "ANOTHER_SECRET",
                  key: "ANOTHER_SECRET",
                  projectId: PROJECT_ID,
                },
              ],
            },
          ];

          const binder = new IamBinder(PROJECT_ID, PROJECT_NUMBER);
          await binder.addEndpoints(endpoints);
          const got = binder.additions;

          expect(Object.keys(got)).to.have.length(2);
          expect(Object.keys(got)).to.have.members([
            `//secretmanager.googleapis.com/projects/${PROJECT_NUMBER}/secrets/MY_SECRET`,
            `//secretmanager.googleapis.com/projects/${PROJECT_NUMBER}/secrets/ANOTHER_SECRET`,
          ]);
          expectExactBindings(
            got[`//secretmanager.googleapis.com/projects/${PROJECT_NUMBER}/secrets/MY_SECRET`],
            [
              {
                role: "roles/secretmanager.secretAccessor",
                members: [`serviceAccount:${PROJECT_ID}@appspot.gserviceaccount.com`],
              },
            ]
          );
          expectExactBindings(
            got[`//secretmanager.googleapis.com/projects/${PROJECT_NUMBER}/secrets/ANOTHER_SECRET`],
            [
              {
                role: "roles/secretmanager.secretAccessor",
                members: [`serviceAccount:${PROJECT_ID}@appspot.gserviceaccount.com`],
              },
            ]
          );
        });

        it("adds binding to custom service account given endpoints with secrets", async () => {
          const endpoints: backend.Endpoint[] = [
            {
              ...BASE_ENDPOINT,
              httpsTrigger: {},
              serviceAccountEmail: "hello@",
              secretEnvironmentVariables: [
                {
                  secret: "MY_SECRET",
                  key: "MY_SECRET",
                  projectId: PROJECT_ID,
                },
              ],
            },
          ];

          const binder = new IamBinder(PROJECT_ID, PROJECT_NUMBER);
          await binder.addEndpoints(endpoints);
          const got = binder.additions;

          expect(Object.keys(got)).to.deep.equal([
            `//secretmanager.googleapis.com/projects/${PROJECT_NUMBER}/secrets/MY_SECRET`,
          ]);
          expectExactBindings(
            got[`//secretmanager.googleapis.com/projects/${PROJECT_NUMBER}/secrets/MY_SECRET`],
            [
              {
                role: "roles/secretmanager.secretAccessor",
                members: [`serviceAccount:hello@`],
              },
            ]
          );
        });
      });

      describe("gcfv2", () => {
        it("adds iam.serviceAccountTokenCreator role to pubsub service account", async () => {
          const endpoints: backend.Endpoint[] = [
            {
              ...BASE_ENDPOINT,
              platform: "gcfv2",
              eventTrigger: {
                eventType: "some-event",
                eventFilters: {},
                retry: false,
              },
            },
          ];

          const binder = new IamBinder(PROJECT_ID, PROJECT_NUMBER);
          await binder.addEndpoints(endpoints);
          const got = binder.additions;

          expectBindings(got[`//cloudresourcemanager.googleapis.com/projects/${PROJECT_NUMBER}`], [
            {
              role: "roles/iam.serviceAccountTokenCreator",
              members: [
                `serviceAccount:service-${PROJECT_NUMBER}@gcp-sa-pubsub.iam.gserviceaccount.com`,
              ],
            },
          ]);
        });

        it("adds run.invoker to default compute service account", async () => {
          const endpoints: backend.Endpoint[] = [
            {
              ...BASE_ENDPOINT,
              platform: "gcfv2",
              eventTrigger: {
                eventType: "some-event",
                eventFilters: {},
                retry: false,
              },
            },
          ];

          const binder = new IamBinder(PROJECT_ID, PROJECT_NUMBER);
          await binder.addEndpoints(endpoints);
          const got = binder.additions;

          expectBindings(got[`//cloudresourcemanager.googleapis.com/projects/${PROJECT_NUMBER}`], [
            {
              role: "roles/run.invoker",
              members: [`serviceAccount:${PROJECT_NUMBER}-compute@developer.gserviceaccount.com`],
            },
          ]);
        });

        it("adds pubsub.publisher to storage service account", async () => {
          storageServiceAccountStub.resolves({ email_address: "abc@google.com" });
          const endpoints: backend.Endpoint[] = [
            {
              ...BASE_ENDPOINT,
              platform: "gcfv2",
              eventTrigger: {
                eventType: "google.cloud.storage.object.v1.finalized",
                eventFilters: {},
                retry: false,
              },
            },
          ];

          const binder = new IamBinder(PROJECT_ID, PROJECT_NUMBER);
          await binder.addEndpoints(endpoints);
          const got = binder.additions;

          expectBindings(got[`//cloudresourcemanager.googleapis.com/projects/${PROJECT_NUMBER}`], [
            {
              role: "roles/pubsub.publisher",
              members: [`serviceAccount:abc@google.com`],
            },
          ]);
        });
      });
    });

    describe("updatePolicy", () => {
      let getPolicyStub: sinon.SinonStub;
      let setPolicyStub: sinon.SinonStub;

      beforeEach(() => {
        getPolicyStub = sinon.stub(IamBinder, "getPolicy");
        setPolicyStub = sinon.stub(IamBinder, "setPolicy");

        getPolicyStub.rejects(new Error("Unexpected call"));
        setPolicyStub.rejects(new Error("Unexpected call"));
      });

      afterEach(() => {
        sinon.verifyAndRestore();
      });

      it("updates simple policy bindings", async () => {
        const existingPolicy: iam.Policy = {
          version: 1,
          etag: "abc",
          bindings: [
            {
              role: "roles/someRole",
              members: ["c", "d"],
            },
          ],
        };
        const newBindings: iam.Policy["bindings"] = [
          {
            role: "roles/someRole",
            members: ["a", "b"],
          },
        ];

        getPolicyStub.resolves(existingPolicy);
        setPolicyStub.resolves();

        const newPolicy = await IamBinder.updatePolicy(
          "//secretmanager.googleapis.com/projects/my-project/secrets/MY_SECRET",
          IamBindings.fromIamBindings(newBindings)
        );

        expect(newPolicy).to.deep.equal({
          version: 1,
          etag: "abc",
          bindings: [
            {
              role: "roles/someRole",
              members: ["a", "b", "c", "d"],
            },
          ],
        });
        expect(setPolicyStub).to.have.been.calledOnce;
      });

      it("skips policy updates with no new bindings", async () => {
        const existingPolicy: iam.Policy = {
          version: 1,
          etag: "abc",
          bindings: [
            {
              role: "roles/someRole",
              members: ["a", "b"],
            },
          ],
        };
        const newBindings: iam.Policy["bindings"] = [
          {
            role: "roles/someRole",
            members: ["b"],
          },
        ];

        getPolicyStub.resolves(existingPolicy);
        setPolicyStub.resolves();

        const newPolicy = await IamBinder.updatePolicy(
          "//secretmanager.googleapis.com/projects/my-project/secrets/MY_SECRET",
          IamBindings.fromIamBindings(newBindings)
        );

        expect(newPolicy).to.deep.equal({
          version: 1,
          etag: "abc",
          bindings: [
            {
              role: "roles/someRole",
              members: ["a", "b"],
            },
          ],
        });
        expect(setPolicyStub).to.not.have.been.called;
      });
    });
  });
});
