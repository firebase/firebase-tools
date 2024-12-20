import { expect } from "chai";
import sinon from "sinon";
import esmock from "esmock";

import { FirebaseError } from "./error.js";
import { readFileSync } from "fs";
import { RulesetFile } from "./gcp/rules.js";
import { Config } from "./config.js";

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
          },
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
    let rdCrossService: any;
    let sandbox = sinon.createSandbox();

    let getProjectNumberStub = sandbox.stub();
    let getLatestRulesetNameStub = sandbox.stub();
    let getRulesetContentStub = sandbox.stub();
    let createRulesetStub = sandbox.stub();
    let listAllRulesetsStub = sandbox.stub();
    let listAllReleasesStub = sandbox.stub();
    let promptOnceStub = sandbox.stub();
    let serviceAccountHasRolesStub = sandbox.stub();
    let addServiceAccountToRolesStub = sandbox.stub();
    let getRulesetIdStub = sandbox.stub();
    let deleteRulesetStub = sandbox.stub();
    
    const CROSS_SERVICE_OPTIONS: { cwd: string; project: string; config: any } = {
      cwd: CROSS_SERVICE_FIXTURE_DIR,
      project: "test-project",
      config: null,
    };
    CROSS_SERVICE_OPTIONS.config = Config.load(CROSS_SERVICE_OPTIONS, false);

    beforeEach(async () => {
      const { RulesDeploy } = await esmock("./rulesDeploy.js", {}, {
        "./gcp/index.js": {
          rules : {
            "getLatestRulesetName": getLatestRulesetNameStub,
            "getRulesetContent": getRulesetContentStub,
            "createRuleset": createRulesetStub,
            "listAllRulesets": listAllRulesetsStub,
            "listAllReleases": listAllReleasesStub,
            "getRulesetId": getRulesetIdStub,
            "deleteRuleset": deleteRulesetStub,
          },
        },
        "./gcp/resourceManager.js": {
          "serviceAccountHasRoles": serviceAccountHasRolesStub,
          "addServiceAccountToRoles": addServiceAccountToRolesStub,
        },
        "./getProjectNumber.js": {
          "getProjectNumber": getProjectNumberStub,
        },
        "./prompt.js" : {
          "promptOnce": promptOnceStub,
        },
      });

      getProjectNumberStub.resolves("12345");
      getLatestRulesetNameStub.rejects(new Error("getLatestRulesetName behavior unspecified"));;
      getRulesetContentStub.rejects(new Error("getRulesetContent behavior unspecified"));
      createRulesetStub.rejects(new Error("createRuleset behavior unspecified"));
      listAllRulesetsStub.rejects(new Error("listAllRulesets behavior unspecified"));
      listAllReleasesStub.rejects(new Error("listAllReleases behavior unspecified"));
      promptOnceStub.rejects(new Error("promptOnce behavior unspecified"));
      serviceAccountHasRolesStub.rejects(new Error("serviceAccountHasRoles behavior unspecified"));
      addServiceAccountToRolesStub.rejects(new Error("addServiceAccountToRoles behavior unspecified"));
      getRulesetIdStub.rejects(new Error("getRulesetId behavior unspecified"));
      deleteRulesetStub.rejects(new Error("deleteRulesetStub behavior unspecified"));

      rd = new RulesDeploy(BASE_OPTIONS, RulesetServiceType.CLOUD_FIRESTORE);
      rdCrossService = new RulesDeploy(CROSS_SERVICE_OPTIONS, RulesetServiceType.FIREBASE_STORAGE);
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
      beforeEach(() => {
        getLatestRulesetNameStub.resolves(null);
        createRulesetStub.onFirstCall().resolves("compiled");
        rd = rdCrossService;
        rd.addFile("storage.rules");
      });

      it("should deploy even with IAM failure", async () => {
        serviceAccountHasRolesStub.rejects();
        const result = rd.createRulesets(RulesetServiceType.FIREBASE_STORAGE);
        await expect(result).to.eventually.deep.equal(["compiled"]);

        expect(createRulesetStub).calledOnceWithExactly(BASE_OPTIONS.project, [
          { name: "storage.rules", content: sinon.match.string },
        ]);
        expect(serviceAccountHasRolesStub).calledOnce;
      });

      it("should update permissions if prompted", async () => {
        serviceAccountHasRolesStub.resolves(false);
        addServiceAccountToRolesStub.resolves();
        promptOnceStub.onFirstCall().resolves(true);

        const result = rd.createRulesets(RulesetServiceType.FIREBASE_STORAGE);
        await expect(result).to.eventually.deep.equal(["compiled"]);

        expect(createRulesetStub).calledOnceWithExactly(BASE_OPTIONS.project, [
          { name: "storage.rules", content: sinon.match.string },
        ]);
        expect(addServiceAccountToRolesStub).to.have.been.calledOnce;
        expect(addServiceAccountToRolesStub).calledOnceWithExactly(
          "12345",
          "service-12345@gcp-sa-firebasestorage.iam.gserviceaccount.com",
          ["roles/firebaserules.firestoreServiceAgent"],
          true,
        );
      });

      it("should not update permissions if declined", async () => {
        serviceAccountHasRolesStub.resolves(false);
        addServiceAccountToRolesStub.resolves();
        promptOnceStub.onFirstCall().resolves(false);

        const result = rd.createRulesets(RulesetServiceType.FIREBASE_STORAGE);
        await expect(result).to.eventually.deep.equal(["compiled"]);

        expect(createRulesetStub).calledOnceWithExactly(BASE_OPTIONS.project, [
          { name: "storage.rules", content: sinon.match.string },
        ]);
        expect(addServiceAccountToRolesStub).not.called;
      });

      it("should not prompt if role already granted", async () => {
        serviceAccountHasRolesStub.resolves(true);
        addServiceAccountToRolesStub.resolves();

        const result = rd.createRulesets(RulesetServiceType.FIREBASE_STORAGE);
        await expect(result).to.eventually.deep.equal(["compiled"]);

        expect(createRulesetStub).calledOnceWithExactly(BASE_OPTIONS.project, [
          { name: "storage.rules", content: sinon.match.string },
        ]);
        expect(addServiceAccountToRolesStub).not.called;
        expect(promptOnceStub).not.called;
      });
    });

    describe("when there are quota issues", () => {
      const QUOTA_ERROR = new Error("quota error");
      (QUOTA_ERROR as any).status = 429;

      beforeEach(() => {
        getLatestRulesetNameStub.resolves("deadbeef");
        getRulesetContentStub.resolves([]);
        createRulesetStub.rejects(new Error("failing"));
      });

      it("should throw if it return not a quota issue", async () => {
        rd.addFile("firestore.rules");

        const result = rd.createRulesets(RulesetServiceType.CLOUD_FIRESTORE);
        await expect(result).to.be.rejectedWith(Error, "failing");
      });

      it("should do nothing if there are not a lot of previous rulesets", async () => {
        createRulesetStub.onFirstCall().rejects(QUOTA_ERROR);
        listAllRulesetsStub.resolves(Array(1));
        rd.addFile("firestore.rules");

        const result = rd.createRulesets(RulesetServiceType.CLOUD_FIRESTORE);
        await expect(result).to.eventually.be.fulfilled;
      });

      describe("and a prompt is made", () => {
        it("should prompt for a choice (no)", async () => {
          createRulesetStub.onFirstCall().rejects(QUOTA_ERROR);
          listAllRulesetsStub.resolves(Array(1001));
          promptOnceStub.onFirstCall().resolves(false);
          rd.addFile("firestore.rules");

          const result = rd.createRulesets(RulesetServiceType.CLOUD_FIRESTORE);
          await expect(result).to.eventually.deep.equal([]);
          expect(createRulesetStub).to.be.calledOnce;
          expect(promptOnceStub).to.be.calledOnce;
        });

        it("should prompt for a choice (yes) and delete and retry creation", async () => {
          createRulesetStub.onFirstCall().rejects(QUOTA_ERROR);
          listAllRulesetsStub.resolves(
            new Array(1001).fill(0).map(() => ({ name: "foo" })),
          );
          promptOnceStub.onFirstCall().resolves(true);
          listAllReleasesStub.resolves([
            { rulesetName: "name", name: "bar" },
          ]);
          getRulesetIdStub.returns("");
          deleteRulesetStub.resolves();
          createRulesetStub.onSecondCall().resolves("created");
          rd.addFile("firestore.rules");

          const result = rd.createRulesets(RulesetServiceType.CLOUD_FIRESTORE);
          await expect(result).to.eventually.deep.equal(["created"]);
          expect(createRulesetStub).to.be.calledTwice;
        });
      });
    });
  });

  describe("release", () => {
    let rd: any;
    let updateOrCreateReleaseStub = sinon.stub();
    beforeEach(async () => {
      const { RulesDeploy } = await esmock("./rulesDeploy.js", {}, {
        "./gcp/index.js": {
          rules : {
            "updateOrCreateRelease": updateOrCreateReleaseStub,
          },
        }
      });
      rd = new RulesDeploy(BASE_OPTIONS, RulesetServiceType.CLOUD_FIRESTORE);
      updateOrCreateReleaseStub
        .rejects(new Error("updateOrCreateRelease behavior unspecified"));
    });

    afterEach(() => {
      updateOrCreateReleaseStub.reset();
    });

    it("should release the rules", async () => {
      updateOrCreateReleaseStub.resolves();

      const result = rd.release("firestore.rules", RulesetServiceType.CLOUD_FIRESTORE);
      await expect(result).to.eventually.be.fulfilled;

      expect(updateOrCreateReleaseStub).calledOnceWithExactly(
        BASE_OPTIONS.project,
        undefined, // Because we didn't compile anything.
        RulesetServiceType.CLOUD_FIRESTORE,
      );
    });

    it("should enforce a subresource for storage", async () => {
      const result = rd.release("firestore.rules", RulesetServiceType.FIREBASE_STORAGE);
      await expect(result).to.eventually.be.rejectedWith(
        'Cannot release resource type "firebase.storage"',
      );

      expect(updateOrCreateReleaseStub).not.called;
    });

    it("should append a subresource for storage", async () => {
      updateOrCreateReleaseStub.resolves();

      const result = rd.release("firestore.rules", RulesetServiceType.FIREBASE_STORAGE, "bar");
      await expect(result).to.eventually.be.fulfilled;

      expect(updateOrCreateReleaseStub).calledOnceWithExactly(
        BASE_OPTIONS.project,
        undefined, // Because we didn't compile anything.
        `${RulesetServiceType.FIREBASE_STORAGE}/bar`,
      );
    });
  });
});
