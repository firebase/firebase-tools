import { expect } from "chai";
import * as sinon from "sinon";

import { FirebaseError } from "../error";
import { logger } from "../logger";
import * as prompt from "../prompt";
import * as extensionsApi from "./extensionsApi";
import * as migrateModule from "./migrate";
import * as paramHelper from "./paramHelper";
import * as updateHelper from "./updateHelper";
import { ExtensionInstance } from "./types";

describe("ext:migrate core logic (Unique Veneer)", () => {
  let sandbox: sinon.SinonSandbox;
  let selectStub: sinon.SinonStub;

  const mockInstance1: ExtensionInstance = {
    name: "projects/test-project/instances/email-1",
    createTime: "2025-01-01T00:00:00Z",
    updateTime: "2025-01-01T00:00:00Z",
    state: "ACTIVE",
    serviceAccountEmail: "sa@test.gserviceaccount.com",
    config: {
      name: "projects/test-project/instances/email-1/configurations/1",
      createTime: "2025-01-01T00:00:00Z",
      extensionRef: "firebase/firestore-send-email",
      params: {},
      systemParams: {},
      source: {
        state: "ACTIVE",
        name: "sources/1",
        packageUri: "https://gcs...",
        hash: "abc",
        spec: {
          name: "firestore-send-email",
          version: "0.1.18",
          resources: [],
          params: [],
          systemParams: [],
        },
      },
    },
  };

  const mockInstance2: ExtensionInstance = {
    name: "projects/test-project/instances/email-2",
    createTime: "2025-01-02T00:00:00Z",
    updateTime: "2025-01-02T00:00:00Z",
    state: "ACTIVE",
    serviceAccountEmail: "sa@test.gserviceaccount.com",
    config: {
      name: "projects/test-project/instances/email-2/configurations/1",
      createTime: "2025-01-02T00:00:00Z",
      extensionRef: "firebase/firestore-send-email",
      params: {},
      systemParams: {},
      source: {
        state: "ACTIVE",
        name: "sources/2",
        packageUri: "https://gcs...",
        hash: "def",
        spec: {
          name: "firestore-send-email",
          version: "0.1.18",
          resources: [],
          params: [],
          systemParams: [],
        },
      },
    },
  };

  const mockUnknownInstance: ExtensionInstance = {
    name: "projects/test-project/instances/custom-ext",
    createTime: "2025-01-03T00:00:00Z",
    updateTime: "2025-01-03T00:00:00Z",
    state: "ACTIVE",
    serviceAccountEmail: "sa@test.gserviceaccount.com",
    config: {
      name: "projects/test-project/instances/custom-ext/configurations/1",
      createTime: "2025-01-03T00:00:00Z",
      extensionRef: "my-publisher/unknown-extension",
      params: {},
      systemParams: {},
      source: {
        state: "ACTIVE",
        name: "sources/3",
        packageUri: "https://gcs...",
        hash: "ghi",
        spec: {
          name: "unknown-extension",
          version: "1.0.0",
          resources: [],
          params: [],
          systemParams: [],
        },
      },
    },
  };

  beforeEach(() => {
    sandbox = sinon.createSandbox();
    sandbox.stub(logger, "info");
    selectStub = sandbox.stub(prompt, "select");
  });

  afterEach(() => {
    sandbox.restore();
  });

  describe("getKitPackage", () => {
    it("should return package override if provided", () => {
      expect(migrateModule.getKitPackage("any/ref", "@custom/kit")).to.equal("@custom/kit");
    });

    it("should return mapped kit package for known extension ref", () => {
      expect(migrateModule.getKitPackage("firestore-send-email")).to.equal(
        "@firebase-function-kits/firestore-send-email",
      );
      expect(migrateModule.getKitPackage("firebase/firestore-send-email")).to.equal(
        "@firebase-function-kits/firestore-send-email",
      );
    });

    it("should return undefined for unknown extension ref", () => {
      expect(migrateModule.getKitPackage("custom/unknown")).to.be.undefined;
    });

    it("should return undefined for a known extension ref with no replacement", () => {
      expect(migrateModule.getKitPackage("moralis/moralis-streams")).to.be.undefined;
      expect(migrateModule.getKitPackage("firebase/firestore-bundle-builder")).to.be.undefined;
    });
  });

  describe("formatExtensionsTable", () => {
    it("should format table of installed extensions correctly", () => {
      const { rows } = migrateModule.formatExtensionsTable([mockInstance1, mockInstance2]);
      expect(rows).to.have.lengthOf(1);
      expect(rows[0].extension).to.equal("firebase/firestore-send-email");
      expect(rows[0].publisher).to.equal("firebase");
      expect(rows[0].instances).to.deep.equal(["email-1", "email-2"]);
      expect(rows[0].kitPackage).to.equal("@firebase-function-kits/firestore-send-email");
    });
  });

  describe("getMigratableInstances", () => {
    it("should filter out instances without associated function kits", () => {
      const migratable = migrateModule.getMigratableInstances([mockInstance1, mockUnknownInstance]);
      expect(migratable).to.have.lengthOf(1);
      expect(migratable[0].instanceId).to.equal("email-1");
      expect(migratable[0].kitPackage).to.equal("@firebase-function-kits/firestore-send-email");
    });
  });

  describe("promptInstanceSelection", () => {
    it("should format choices and call prompt.select with correct values", async () => {
      const migratable = migrateModule.getMigratableInstances([mockInstance1, mockInstance2]);
      selectStub.resolves(migratable[1]);

      const selected = await migrateModule.promptInstanceSelection(migratable);

      expect(selected).to.equal(migratable[1]);
      expect(selectStub).to.be.calledOnce;
      const opts = selectStub.firstCall
        .args[0] as prompt.SelectOptions<migrateModule.ExtensionMigrationPlan>;
      const choices = opts.choices as prompt.Choice<migrateModule.ExtensionMigrationPlan>[];
      expect(opts.message).to.equal("Which extension instance would you like to migrate?");
      expect(choices).to.have.lengthOf(2);
      expect(choices[0].name).to.equal("email-1 (firebase/firestore-send-email)");
      expect(choices[0].value).to.equal(migratable[0]);
      expect(choices[1].name).to.equal("email-2 (firebase/firestore-send-email)");
      expect(choices[1].value).to.equal(migratable[1]);
    });
  });

  describe("createMigrationPlan (no flags)", () => {
    it("should throw error when all extensions have already been migrated (0 instances)", async () => {
      sandbox.stub(extensionsApi, "listInstances").resolves([]);

      await expect(migrateModule.createMigrationPlan("test-project", {})).to.be.rejectedWith(
        FirebaseError,
        /All extensions in project .* have already been migrated/,
      );
    });

    it("should throw error if no installed extensions can be migrated", async () => {
      sandbox.stub(extensionsApi, "listInstances").resolves([mockUnknownInstance]);

      await expect(migrateModule.createMigrationPlan("test-project", {})).to.be.rejectedWith(
        FirebaseError,
        /No remaining Extensions have an associated function kit/,
      );
    });

    it("should prompt selection and return plan when instances can be migrated", async () => {
      sandbox.stub(extensionsApi, "listInstances").resolves([mockInstance1, mockInstance2]);
      selectStub.callsFake(
        async (opts: prompt.SelectOptions<migrateModule.ExtensionMigrationPlan>) => {
          const choices = opts.choices as prompt.Choice<migrateModule.ExtensionMigrationPlan>[];
          return choices[0].value;
        },
      );

      const plan = await migrateModule.createMigrationPlan("test-project", {});

      expect(selectStub).to.be.calledOnce;
      const opts = selectStub.firstCall
        .args[0] as prompt.SelectOptions<migrateModule.ExtensionMigrationPlan>;
      expect(opts.choices).to.have.lengthOf(2);
      expect(plan).to.deep.equal({
        instance: mockInstance1,
        instanceId: "email-1",
        extensionRef: "firebase/firestore-send-email",
        kitPackage: "@firebase-function-kits/firestore-send-email",
      });
    });
  });

  describe("createMigrationPlan (--extension flag)", () => {
    it("should throw error if specified extension is not installed", async () => {
      sandbox.stub(extensionsApi, "listInstances").resolves([mockInstance1]);

      await expect(
        migrateModule.createMigrationPlan("test-project", { extension: "non-existent-extension" }),
      ).to.be.rejectedWith(FirebaseError, /Extension non-existent-extension is not installed/);
    });

    it("should throw error if specified extension cannot be migrated", async () => {
      sandbox.stub(extensionsApi, "listInstances").resolves([mockUnknownInstance]);

      await expect(
        migrateModule.createMigrationPlan("test-project", {
          extension: "my-publisher/unknown-extension",
        }),
      ).to.be.rejectedWith(
        FirebaseError,
        /This extension does not have an associated function kit/,
      );
    });

    it("should throw error if third-party extension matching shortName has no kit package for its actual ref", async () => {
      const mockThirdPartyInstance: ExtensionInstance = {
        ...mockInstance1,
        config: {
          ...mockInstance1.config,
          extensionRef: "otherpublisher/firestore-send-email",
        },
      };
      sandbox.stub(extensionsApi, "listInstances").resolves([mockThirdPartyInstance]);

      await expect(
        migrateModule.createMigrationPlan("test-project", {
          extension: "firestore-send-email",
        }),
      ).to.be.rejectedWith(
        FirebaseError,
        /This extension does not have an associated function kit/,
      );
    });

    it("should allow migration when --package override is passed for extension with no counterpart", async () => {
      sandbox.stub(extensionsApi, "listInstances").resolves([mockUnknownInstance]);

      const plan = await migrateModule.createMigrationPlan("test-project", {
        extension: "my-publisher/unknown-extension",
        package: "@custom/override-package",
      });

      expect(plan).to.deep.equal({
        instance: mockUnknownInstance,
        instanceId: "custom-ext",
        extensionRef: "my-publisher/unknown-extension",
        kitPackage: "@custom/override-package",
      });
    });

    it("should auto-select single matching instance and return plan", async () => {
      sandbox.stub(extensionsApi, "listInstances").resolves([mockInstance1]);

      const plan = await migrateModule.createMigrationPlan("test-project", {
        extension: "firestore-send-email",
      });

      expect(plan).to.deep.equal({
        instance: mockInstance1,
        instanceId: "email-1",
        extensionRef: "firebase/firestore-send-email",
        kitPackage: "@firebase-function-kits/firestore-send-email",
      });
    });

    it("should prompt selection when multiple instances exist for specified extension", async () => {
      sandbox.stub(extensionsApi, "listInstances").resolves([mockInstance1, mockInstance2]);
      selectStub.callsFake(
        async (opts: prompt.SelectOptions<migrateModule.ExtensionMigrationPlan>) => {
          const choices = opts.choices as prompt.Choice<migrateModule.ExtensionMigrationPlan>[];
          return choices[1].value;
        },
      );

      const plan = await migrateModule.createMigrationPlan("test-project", {
        extension: "firestore-send-email",
      });

      expect(selectStub).to.be.calledOnce;
      const opts = selectStub.firstCall
        .args[0] as prompt.SelectOptions<migrateModule.ExtensionMigrationPlan>;
      const choices = opts.choices as prompt.Choice<migrateModule.ExtensionMigrationPlan>[];
      expect(choices).to.have.lengthOf(2);
      expect(choices[0].name).to.equal("email-1 (firebase/firestore-send-email)");
      expect(choices[1].name).to.equal("email-2 (firebase/firestore-send-email)");
      expect(plan?.instanceId).to.equal("email-2");
    });
  });

  describe("createMigrationPlan (--ext-instance flag)", () => {
    it("should throw error if specified instance is not found", async () => {
      sandbox.stub(extensionsApi, "listInstances").resolves([mockInstance1]);

      await expect(
        migrateModule.createMigrationPlan("test-project", { extInstance: "non-existent" }),
      ).to.be.rejectedWith(FirebaseError, /Extension instance non-existent was not found/);
    });

    it("should throw error if specified instance cannot be migrated", async () => {
      sandbox.stub(extensionsApi, "listInstances").resolves([mockUnknownInstance]);

      await expect(
        migrateModule.createMigrationPlan("test-project", { extInstance: "custom-ext" }),
      ).to.be.rejectedWith(
        FirebaseError,
        /This extension does not have an associated function kit/,
      );
    });

    it("should select specified instance and return plan", async () => {
      sandbox.stub(extensionsApi, "listInstances").resolves([mockInstance1]);

      const plan = await migrateModule.createMigrationPlan("test-project", {
        extInstance: "email-1",
      });

      expect(plan).to.deep.equal({
        instance: mockInstance1,
        instanceId: "email-1",
        extensionRef: "firebase/firestore-send-email",
        kitPackage: "@firebase-function-kits/firestore-send-email",
      });
    });
  });
  describe("ensureInstanceUpToDate", () => {
    it("should return original instance when instance is already up to date", async () => {
      sandbox.stub(extensionsApi, "getExtensionVersion").resolves({
        name: "firebase/firestore-send-email@0.1.14",
        ref: "firebase/firestore-send-email@0.1.14",
        spec: { name: "firestore-send-email", version: "0.1.14" },
      } as any);

      const updated = await migrateModule.ensureInstanceUpToDate("test-project", mockInstance1);

      expect(updated).to.equal(mockInstance1);
    });

    it("should automatically attempt upgrade when a newer version exists", async () => {
      sandbox.stub(extensionsApi, "getExtension").resolves({
        latestVersion: "0.1.15",
      } as any);
      const getExtVersionStub = sandbox.stub(extensionsApi, "getExtensionVersion").resolves({
        name: "firebase/firestore-send-email@0.1.15",
        ref: "firebase/firestore-send-email@0.1.15",
        spec: { name: "firestore-send-email", version: "0.1.15", params: [] },
      } as any);
      sandbox.stub(updateHelper, "update").resolves({} as any);
      sandbox.stub(extensionsApi, "getInstance").resolves(mockInstance1);

      await migrateModule.ensureInstanceUpToDate("test-project", mockInstance1);

      expect(getExtVersionStub).to.have.been.called;
    });

    it("should merge systemParams into currentParams when prompting for new parameters", async () => {
      sandbox.stub(extensionsApi, "getExtension").resolves({
        latestVersion: "0.1.15",
      } as any);
      sandbox.stub(extensionsApi, "getExtensionVersion").resolves({
        name: "firebase/firestore-send-email@0.1.15",
        ref: "firebase/firestore-send-email@0.1.15",
        spec: { name: "firestore-send-email", version: "0.1.15", params: [] },
      } as any);
      const promptStub = sandbox.stub(paramHelper, "promptForNewParams").resolves({} as any);
      sandbox.stub(updateHelper, "update").resolves({} as any);
      sandbox.stub(extensionsApi, "getInstance").resolves(mockInstance1);

      const instanceWithSystemParams: ExtensionInstance = {
        ...mockInstance1,
        config: {
          ...mockInstance1.config,
          params: { FOO: "bar" },
          systemParams: { "firebaseextensions.v1beta.function/location": "us-central1" },
        },
      };

      await migrateModule.ensureInstanceUpToDate("test-project", instanceWithSystemParams);

      expect(promptStub).to.have.been.calledWithMatch({
        currentParams: {
          FOO: "bar",
          "firebaseextensions.v1beta.function/location": "us-central1",
        },
      });
    });

    it("should throw FirebaseError with manual upgrade instructions when upgrade fails", async () => {
      sandbox.stub(extensionsApi, "getExtension").resolves({
        latestVersion: "0.1.15",
      } as any);
      sandbox.stub(extensionsApi, "getExtensionVersion").resolves({
        name: "firebase/firestore-send-email@0.1.15",
        ref: "firebase/firestore-send-email@0.1.15",
        spec: { name: "firestore-send-email", version: "0.1.15", params: [] },
      } as any);
      sandbox.stub(updateHelper, "update").rejects(new Error("API rate limit exceeded"));

      await expect(
        migrateModule.ensureInstanceUpToDate("test-project", mockInstance1),
      ).to.be.rejectedWith(
        FirebaseError,
        /Failed to automatically upgrade extension instance email-1 to version 0.1.15: API rate limit exceeded. Please upgrade your extension instance manually using 'firebase ext:update email-1'/,
      );
    });

    it("should prompt user when extension reference cannot be parsed and throw if user declines", async () => {
      sandbox.stub(prompt, "confirm").resolves(false);
      const invalidRefInstance = {
        ...mockInstance1,
        config: { ...mockInstance1.config, extensionRef: "invalid-ref-format" },
      };

      await expect(
        migrateModule.ensureInstanceUpToDate("test-project", invalidRefInstance),
      ).to.be.rejectedWith(FirebaseError, /Migration cancelled/);
    });

    it("should prompt user when extension reference cannot be parsed and continue if user accepts", async () => {
      sandbox.stub(prompt, "confirm").resolves(true);
      const invalidRefInstance = {
        ...mockInstance1,
        config: { ...mockInstance1.config, extensionRef: "invalid-ref-format" },
      };

      const result = await migrateModule.ensureInstanceUpToDate("test-project", invalidRefInstance);

      expect(result).to.equal(invalidRefInstance);
    });
  });
});
