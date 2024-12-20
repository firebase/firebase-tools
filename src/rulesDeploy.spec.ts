import { expect } from "chai";
import sinon from "sinon";
import esmock from "esmock";

import { FirebaseError } from "./error.js";
import * as prompt from "./prompt.js";
import * as resourceManager from "./gcp/resourceManager.js";
import * as projectNumber from "./getProjectNumber.js";
import { readFileSync } from "fs";
import { RulesetFile } from "./gcp/rules.js";
import { Config } from "./config.js";
import * as gcp from "./gcp/index.js";

import { RulesetServiceType } from "./rulesDeploy.js";
import { FIXTURE_DIR, FIXTURE_FIRESTORE_RULES_PATH } from "./test/fixtures/rulesDeploy/index.js";
import { FIXTURE_DIR as CROSS_SERVICE_FIXTURE_DIR } from "./test/fixtures/rulesDeployCrossService/index.js";


describe("RulesDeploy", () => {
  const BASE_OPTIONS: { cwd: string; project: string; config: any } = {
    cwd: FIXTURE_DIR,
    project: "test-project",
    config: null,
  };
  BASE_OPTIONS.config = Config.load(BASE_OPTIONS, false);
  const FIRESTORE_RULES_CONTENT = readFileSync(FIXTURE_FIRESTORE_RULES_PATH).toString();

  describe("addFile", () => {
    it("should successfully add a file that exists", async () => {
      const { RulesDeploy } = await esmock("./rulesDeploy.js");
      const rd = new RulesDeploy(BASE_OPTIONS, RulesetServiceType.CLOUD_FIRESTORE);

      expect(() => {
        rd.addFile("firestore.rules");
      }).to.not.throw();
    });

    it("should throw an error if the file does not exist", async () => {
      const { RulesDeploy } = await esmock("./rulesDeploy.js");
      const rd = new RulesDeploy(BASE_OPTIONS, RulesetServiceType.CLOUD_FIRESTORE);

      expect(() => {
        rd.addFile("no.way");
      }).to.throw(FirebaseError, /Error reading rules/);
    });
  });

  describe("compile", () => {
    let rd: any;
    let testRulesetStub = sinon.stub();
    beforeEach(async () => {
      const { RulesDeploy } = await esmock("./rulesDeploy.js", {}, {
        "./gcp/index.js": {
          rules : {
            "testRuleset": testRulesetStub,
          }
        }
      });
      rd = new RulesDeploy(BASE_OPTIONS, RulesetServiceType.CLOUD_FIRESTORE);
      testRulesetStub.rejects(new Error("behavior unspecified"));
    });

    afterEach(() => {
      testRulesetStub.reset();
    });

    it("should succeed if there are no files to compile", async () => {
      const result = rd.compile();
      await expect(result).to.eventually.be.fulfilled;

      expect(testRulesetStub).not.called;
    });

    it("should succeed if there is one file to compile", async () => {
      testRulesetStub.onFirstCall().resolves();
      rd.addFile("firestore.rules");

      const result = rd.compile();
      await expect(result).to.eventually.be.fulfilled;

      expect(testRulesetStub).calledOnce;
      expect(testRulesetStub).calledWithExactly(BASE_OPTIONS.project, [
        { name: "firestore.rules", content: sinon.match.string },
      ]);
    });

    it("should succeed if there are multiple files to compile", async () => {
      testRulesetStub.onFirstCall().resolves().onSecondCall().resolves();
      rd.addFile("firestore.rules");
      rd.addFile("storage.rules");

      const result = rd.compile();
      await expect(result).to.eventually.be.fulfilled;

      expect(testRulesetStub).calledTwice;
      expect(testRulesetStub).calledWithExactly(BASE_OPTIONS.project, [
        { name: "firestore.rules", content: sinon.match.string },
      ]);
      expect(testRulesetStub).calledWithExactly(BASE_OPTIONS.project, [
        { name: "storage.rules", content: sinon.match.string },
      ]);
    });

    it("should fail if one file fails to compile (method error)", async () => {
      testRulesetStub
        .onFirstCall()
        .resolves()
        .onSecondCall()
        .rejects(new Error("failed to compile"));
      rd.addFile("firestore.rules");
      rd.addFile("storage.rules");

      const result = rd.compile();
      await expect(result).to.eventually.be.rejectedWith(Error, "failed to compile");
    });

    it("should fail if one file fails to compile (returned an error in the response)", async () => {
      testRulesetStub
        .onFirstCall()
        .resolves()
        .onSecondCall()
        .resolves({
          body: {
            issues: [
              {
                severity: "ERROR",
                sourcePosition: { line: 0, column: 0 },
                description: "oopsie",
              },
            ],
          },
        });
      rd.addFile("firestore.rules");
      rd.addFile("storage.rules");

      const result = rd.compile();
      await expect(result).to.eventually.be.rejectedWith(
        Error,
        /Compilation error in .*storage.rules.*:\n\[E\] 0:0 - oopsie/,
      );
    });

    it("should fail if one file fails to compile (returned multiple errors in the response)", async () => {
      testRulesetStub
        .onFirstCall()
        .resolves()
        .onSecondCall()
        .resolves({
          body: {
            issues: [
              {
                severity: "ERROR",
                sourcePosition: { line: 0, column: 0 },
                description: "oopsie",
              },
              {
                severity: "ERROR",
                sourcePosition: { line: 1, column: 1 },
                description: "daisey",
              },
            ],
          },
        });
      rd.addFile("firestore.rules");
      rd.addFile("storage.rules");

      const result = rd.compile();
      await expect(result).to.eventually.be.rejectedWith(
        Error,
        /Compilation errors in .*storage.rules.*:\n\[E\] 0:0 - oopsie\n\[E\] 1:1 - daisey/,
      );
    });

    it("should succeed if the compile returns a warning (returned a warning in the response)", async () => {
      testRulesetStub
        .onFirstCall()
        .resolves()
        .onSecondCall()
        .resolves({
          body: {
            issues: [
              {
                severity: "WARNING",
                sourcePosition: { line: 0, column: 0 },
                description: "oopsie",
              },
            ],
          },
        });
      rd.addFile("firestore.rules");
      rd.addFile("storage.rules");

      const result = rd.compile();
      await expect(result).to.eventually.be.fulfilled;
    });
  });

  describe("createRulesets", () => {
    let rd: any;
    let sandbox = sinon.createSandbox();
    let getLatestRulesetNameStub = sandbox.stub();
    let getRulesetContentStub = sandbox.stub();
    let createRulesetStub = sandbox.stub();
    beforeEach(async () => {
      const { RulesDeploy } = await esmock("./rulesDeploy.js", {}, {
        "./gcp/index.js": {
          rules : {
            "getLatestRulesetName": getLatestRulesetNameStub,
            "getRulesetContent": getRulesetContentStub,
            "createRuleset": createRulesetStub,
          }
        }
      });
      rd = new RulesDeploy(BASE_OPTIONS, RulesetServiceType.CLOUD_FIRESTORE);
      getLatestRulesetNameStub
        .rejects(new Error("getLatestRulesetName behavior unspecified"));
      getRulesetContentStub
        .rejects(new Error("getRulesetContent behavior unspecified"));
      createRulesetStub
        .rejects(new Error("createRuleset behavior unspecified"));
    });

    afterEach(() => {
      sandbox.reset();
    });

    describe("with no initial rules", () => {
      beforeEach(() => {
        getLatestRulesetNameStub.resolves(null);
      });

      it("should not create rulesets if none were provided", async () => {
        const result = rd.createRulesets(RulesetServiceType.CLOUD_FIRESTORE);
        await expect(result).to.eventually.deep.equal([]);

        expect(createRulesetStub).not.called;
      });

      it("should create rulesets if one was provided", async () => {
        createRulesetStub.onFirstCall().resolves("compiled");
        rd.addFile("firestore.rules");

        const result = rd.createRulesets(RulesetServiceType.CLOUD_FIRESTORE);
        await expect(result).to.eventually.deep.equal(["compiled"]);

        expect(createRulesetStub).calledOnceWithExactly(BASE_OPTIONS.project, [
          { name: "firestore.rules", content: sinon.match.string },
        ]);
      });

      it("should throw an error if createRuleset fails", async () => {
        rd.addFile("firestore.rules");
        createRulesetStub.rejects(new Error("oh no!"));

        const result = rd.createRulesets(RulesetServiceType.CLOUD_FIRESTORE);
        await expect(result).to.eventually.be.rejectedWith(Error, "oh no!");
      });

      it("should create multiple rulesets if multiple are provided", async () => {
        createRulesetStub
          .onFirstCall()
          .resolves("one")
          .onSecondCall()
          .resolves("two");
        rd.addFile("firestore.rules");
        rd.addFile("storage.rules");

        const result = rd.createRulesets(RulesetServiceType.CLOUD_FIRESTORE);
        await expect(result).to.eventually.deep.equal(["one", "two"]);

        expect(createRulesetStub).calledTwice;
        expect(createRulesetStub).calledWithExactly(BASE_OPTIONS.project, [
          { name: "firestore.rules", content: sinon.match.string },
        ]);
        expect(createRulesetStub).calledWithExactly(BASE_OPTIONS.project, [
          { name: "storage.rules", content: sinon.match.string },
        ]);
      });
    });

    describe("with initial rules", () => {
      const content: RulesetFile[] = [
        {
          name: "firestore.rules",
          content: FIRESTORE_RULES_CONTENT,
        },
      ];

      beforeEach(() => {
        getLatestRulesetNameStub.resolves("deadbeef");
        getRulesetContentStub.resolves(content);
      });

      afterEach(() => {
        sinon.restore();
      });

      it("should throw an error if createRuleset fails", async () => {
        rd.addFile("storage.rules");
        createRulesetStub.rejects(new Error("oh no!"));

        const result = rd.createRulesets(RulesetServiceType.CLOUD_FIRESTORE);
        await expect(result).to.eventually.be.rejectedWith(Error, "oh no!");
      });

      it("should not create rulesets if none were provided", async () => {
        const result = rd.createRulesets(RulesetServiceType.CLOUD_FIRESTORE);
        await expect(result).to.eventually.deep.equal([]);

        expect(createRulesetStub).not.called;
      });

      it("should not create any additional rules if they all match", async () => {
        rd.addFile("firestore.rules");
        rd.addFile("firestore.rules");

        const result = rd.createRulesets(RulesetServiceType.CLOUD_FIRESTORE);
        await expect(result).to.eventually.deep.equal([]);

        expect(createRulesetStub).not.called;
      });

      it("should create any rules for a single one that does not match", async () => {
        createRulesetStub.resolves("created");
        rd.addFile("firestore.rules");
        rd.addFile("storage.rules");

        const result = rd.createRulesets(RulesetServiceType.CLOUD_FIRESTORE);
        await expect(result).to.eventually.deep.equal(["created"]);

        expect(createRulesetStub).calledOnce;
        expect(createRulesetStub).calledOnceWithExactly(BASE_OPTIONS.project, [
          { name: "storage.rules", content: sinon.match.string },
        ]);
      });

      it("should create all rules if none match", async () => {
        getRulesetContentStub.resolves([]);
        createRulesetStub
          .onFirstCall()
          .resolves("one")
          .onSecondCall()
          .resolves("two");
        rd.addFile("firestore.rules");
        rd.addFile("storage.rules");

        const result = rd.createRulesets(RulesetServiceType.CLOUD_FIRESTORE);
        await expect(result).to.eventually.deep.equal(["one", "two"]);

        expect(createRulesetStub).calledTwice;
        expect(createRulesetStub).calledWithExactly(BASE_OPTIONS.project, [
          { name: "firestore.rules", content: sinon.match.string },
        ]);
        expect(createRulesetStub).calledWithExactly(BASE_OPTIONS.project, [
          { name: "storage.rules", content: sinon.match.string },
        ]);
      });
    });

    describe("with cross-service rules", () => {
      const CROSS_SERVICE_OPTIONS: { cwd: string; project: string; config: any } = {
        cwd: CROSS_SERVICE_FIXTURE_DIR,
        project: "test-project",
        config: null,
      };
      CROSS_SERVICE_OPTIONS.config = Config.load(CROSS_SERVICE_OPTIONS, false);

      beforeEach(() => {
        getLatestRulesetNameStub.resolves(null);
        createRulesetStub.onFirstCall().resolves("compiled");
        sinon.stub(projectNumber, "getProjectNumber").resolves("12345");
        rd.addFile("storage.rules");
      });

      afterEach(() => {
        sandbox.restore();
      });

      it("should deploy even with IAM failure", async () => {
        sinon.stub(resourceManager, "serviceAccountHasRoles").rejects();
        const result = rd.createRulesets(RulesetServiceType.FIREBASE_STORAGE);
        await expect(result).to.eventually.deep.equal(["compiled"]);

        expect(gcp.rules.createRuleset).calledOnceWithExactly(BASE_OPTIONS.project, [
          { name: "storage.rules", content: sinon.match.string },
        ]);
        expect(resourceManager.serviceAccountHasRoles).calledOnce;
      });

      it("should update permissions if prompted", async () => {
        sinon.stub(resourceManager, "serviceAccountHasRoles").resolves(false);
        sinon.stub(resourceManager, "addServiceAccountToRoles").resolves();
        sinon.stub(prompt, "promptOnce").onFirstCall().resolves(true);

        const result = rd.createRulesets(RulesetServiceType.FIREBASE_STORAGE);
        await expect(result).to.eventually.deep.equal(["compiled"]);

        expect(gcp.rules.createRuleset).calledOnceWithExactly(BASE_OPTIONS.project, [
          { name: "storage.rules", content: sinon.match.string },
        ]);
        expect(resourceManager.addServiceAccountToRoles).calledOnceWithExactly(
          "12345",
          "service-12345@gcp-sa-firebasestorage.iam.gserviceaccount.com",
          ["roles/firebaserules.firestoreServiceAgent"],
          true,
        );
      });

      it("should not update permissions if declined", async () => {
        sinon.stub(resourceManager, "serviceAccountHasRoles").resolves(false);
        sinon.stub(resourceManager, "addServiceAccountToRoles").resolves();
        sinon.stub(prompt, "promptOnce").onFirstCall().resolves(false);

        const result = rd.createRulesets(RulesetServiceType.FIREBASE_STORAGE);
        await expect(result).to.eventually.deep.equal(["compiled"]);

        expect(gcp.rules.createRuleset).calledOnceWithExactly(BASE_OPTIONS.project, [
          { name: "storage.rules", content: sinon.match.string },
        ]);
        expect(resourceManager.addServiceAccountToRoles).not.called;
      });

      it("should not prompt if role already granted", async () => {
        sinon.stub(resourceManager, "serviceAccountHasRoles").resolves(true);
        sinon.stub(resourceManager, "addServiceAccountToRoles").resolves();
        const promptSpy = sinon.spy(prompt, "promptOnce");

        const result = rd.createRulesets(RulesetServiceType.FIREBASE_STORAGE);
        await expect(result).to.eventually.deep.equal(["compiled"]);

        expect(gcp.rules.createRuleset).calledOnceWithExactly(BASE_OPTIONS.project, [
          { name: "storage.rules", content: sinon.match.string },
        ]);
        expect(resourceManager.addServiceAccountToRoles).not.called;
        expect(promptSpy).not.called;
      });
    });

    describe("when there are quota issues", () => {
      const QUOTA_ERROR = new Error("quota error");
      (QUOTA_ERROR as any).status = 429;

      beforeEach(() => {
        (gcp.rules.getLatestRulesetName as sinon.SinonStub).resolves("deadbeef");
        (gcp.rules.getRulesetContent as sinon.SinonStub).resolves([]);
        (gcp.rules.createRuleset as sinon.SinonStub).rejects(new Error("failing"));

        sinon.stub(gcp.rules, "listAllRulesets").rejects(new Error("listAllRulesets failing"));
      });

      afterEach(() => {
        sinon.restore();
      });

      it("should throw if it return not a quota issue", async () => {
        rd.addFile("firestore.rules");

        const result = rd.createRulesets(RulesetServiceType.CLOUD_FIRESTORE);
        await expect(result).to.be.rejectedWith(Error, "failing");
      });

      it("should do nothing if there are not a lot of previous rulesets", async () => {
        (gcp.rules.createRuleset as sinon.SinonStub).onFirstCall().rejects(QUOTA_ERROR);
        (gcp.rules.listAllRulesets as sinon.SinonStub).resolves(Array(1));
        rd.addFile("firestore.rules");

        const result = rd.createRulesets(RulesetServiceType.CLOUD_FIRESTORE);
        await expect(result).to.eventually.be.fulfilled;
      });

      describe("and a prompt is made", () => {
        beforeEach(() => {
          sinon.stub(prompt, "promptOnce").rejects(new Error("behavior unspecified"));
          sinon.stub(gcp.rules, "listAllReleases").rejects(new Error("listAllReleases failing"));
          sinon.stub(gcp.rules, "deleteRuleset").rejects(new Error("deleteRuleset failing"));
          sinon.stub(gcp.rules, "getRulesetId").throws(new Error("getRulesetId failing"));
        });

        afterEach(() => {
          sinon.restore();
        });

        it("should prompt for a choice (no)", async () => {
          (gcp.rules.createRuleset as sinon.SinonStub).onFirstCall().rejects(QUOTA_ERROR);
          (gcp.rules.listAllRulesets as sinon.SinonStub).resolves(Array(1001));
          (prompt.promptOnce as sinon.SinonStub).onFirstCall().resolves(false);
          rd.addFile("firestore.rules");

          const result = rd.createRulesets(RulesetServiceType.CLOUD_FIRESTORE);
          await expect(result).to.eventually.deep.equal([]);
          expect(gcp.rules.createRuleset).to.be.calledOnce;
          expect(prompt.promptOnce).to.be.calledOnce;
        });

        it("should prompt for a choice (yes) and delete and retry creation", async () => {
          (gcp.rules.createRuleset as sinon.SinonStub).onFirstCall().rejects(QUOTA_ERROR);
          (gcp.rules.listAllRulesets as sinon.SinonStub).resolves(
            new Array(1001).fill(0).map(() => ({ name: "foo" })),
          );
          (prompt.promptOnce as sinon.SinonStub).onFirstCall().resolves(true);
          (gcp.rules.listAllReleases as sinon.SinonStub).resolves([
            { rulesetName: "name", name: "bar" },
          ]);
          (gcp.rules.getRulesetId as sinon.SinonStub).returns("");
          (gcp.rules.deleteRuleset as sinon.SinonStub).resolves();
          (gcp.rules.createRuleset as sinon.SinonStub).onSecondCall().resolves("created");
          rd.addFile("firestore.rules");

          const result = rd.createRulesets(RulesetServiceType.CLOUD_FIRESTORE);
          await expect(result).to.eventually.deep.equal(["created"]);
          expect(gcp.rules.createRuleset).to.be.calledTwice;
        });
      });
    });
  });

  // describe("release", () => {
  //   let rd = new RulesDeploy(BASE_OPTIONS, RulesetServiceType.CLOUD_FIRESTORE);

  //   beforeEach(() => {
  //     rd = new RulesDeploy(BASE_OPTIONS, RulesetServiceType.CLOUD_FIRESTORE);
  //     sinon
  //       .stub(gcp.rules, "updateOrCreateRelease")
  //       .rejects(new Error("updateOrCreateRelease behavior unspecified"));
  //   });

  //   afterEach(() => {
  //     sinon.restore();
  //   });

  //   it("should release the rules", async () => {
  //     (gcp.rules.updateOrCreateRelease as sinon.SinonStub).resolves();

  //     const result = rd.release("firestore.rules", RulesetServiceType.CLOUD_FIRESTORE);
  //     await expect(result).to.eventually.be.fulfilled;

  //     expect(gcp.rules.updateOrCreateRelease).calledOnceWithExactly(
  //       BASE_OPTIONS.project,
  //       undefined, // Because we didn't compile anything.
  //       RulesetServiceType.CLOUD_FIRESTORE,
  //     );
  //   });

  //   it("should enforce a subresource for storage", async () => {
  //     const result = rd.release("firestore.rules", RulesetServiceType.FIREBASE_STORAGE);
  //     await expect(result).to.eventually.be.rejectedWith(
  //       FirebaseError,
  //       /Cannot release resource type "firebase.storage"/,
  //     );

  //     expect(gcp.rules.updateOrCreateRelease).not.called;
  //   });

  //   it("should append a subresource for storage", async () => {
  //     (gcp.rules.updateOrCreateRelease as sinon.SinonStub).resolves();

  //     const result = rd.release("firestore.rules", RulesetServiceType.FIREBASE_STORAGE, "bar");
  //     await expect(result).to.eventually.be.fulfilled;

  //     expect(gcp.rules.updateOrCreateRelease).calledOnceWithExactly(
  //       BASE_OPTIONS.project,
  //       undefined, // Because we didn't compile anything.
  //       `${RulesetServiceType.FIREBASE_STORAGE}/bar`,
  //     );
  //   });
  // });
});
