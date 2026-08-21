import { expect } from "chai";
import * as sinon from "sinon";

import { FirebaseError } from "../error";
import { logger } from "../logger";
import * as extensionsApi from "./extensionsApi";
import * as migrateModule from "./migrate";
import { ExtensionInstance } from "./types";

describe("ext:migrate core logic (Unique Veneer)", () => {
  let sandbox: sinon.SinonSandbox;

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
        "@firebase/firestore-send-email",
      );
      expect(migrateModule.getKitPackage("firebase/firestore-send-email")).to.equal(
        "@firebase/firestore-send-email",
      );
    });

    it("should return undefined for unknown extension ref", () => {
      expect(migrateModule.getKitPackage("custom/unknown")).to.be.undefined;
    });
  });

  describe("formatExtensionsTable", () => {
    it("should format table of installed extensions correctly", () => {
      const { rows } = migrateModule.formatExtensionsTable([mockInstance1, mockInstance2]);
      expect(rows).to.have.lengthOf(1);
      expect(rows[0].extension).to.equal("firebase/firestore-send-email");
      expect(rows[0].publisher).to.equal("firebase");
      expect(rows[0].instances).to.deep.equal(["email-1", "email-2"]);
      expect(rows[0].kitPackage).to.equal("@firebase/firestore-send-email");
    });
  });

  describe("getMigratableInstances", () => {
    it("should filter out instances without associated function kits", () => {
      const migratable = migrateModule.getMigratableInstances([mockInstance1, mockUnknownInstance]);
      expect(migratable).to.have.lengthOf(1);
      expect(migratable[0].instanceId).to.equal("email-1");
      expect(migratable[0].kitPackage).to.equal("@firebase/firestore-send-email");
    });
  });

  describe("migrate flow (no flags)", () => {
    it("should notify when all extensions have already been migrated (0 instances)", async () => {
      sandbox.stub(extensionsApi, "listInstances").resolves([]);

      await migrateModule.migrate("test-project", {});

      expect((logger.info as sinon.SinonSpy).calledWith("TODO: Draw the rest of the owl")).to.be
        .false;
    });

    it("should throw error if no installed extensions can be migrated", async () => {
      sandbox.stub(extensionsApi, "listInstances").resolves([mockUnknownInstance]);

      await expect(migrateModule.migrate("test-project", {})).to.be.rejectedWith(
        FirebaseError,
        /No remaining Extensions have an associated function kit/,
      );
    });

    it("should prompt selection and output TODO when instances can be migrated", async () => {
      sandbox.stub(extensionsApi, "listInstances").resolves([mockInstance1, mockInstance2]);
      sandbox.stub(migrateModule, "promptInstanceSelection").resolves({
        instance: mockInstance1,
        instanceId: "resize-1",
        extensionRef: "firebase/storage-resize-images",
        kitPackage: "@firebase-function-kits/storage-resize-images",
      });

      await migrateModule.migrate("test-project", {});

      expect((logger.info as sinon.SinonSpy).calledWith("TODO: Draw the rest of the owl")).to.be
        .true;
    });
  });

  describe("migrate flow (--extension flag)", () => {
    it("should throw error if specified extension cannot be migrated", async () => {
      sandbox.stub(extensionsApi, "listInstances").resolves([mockUnknownInstance]);

      await expect(
        migrateModule.migrate("test-project", { extension: "my-publisher/unknown-extension" }),
      ).to.be.rejectedWith(
        FirebaseError,
        /This extension does not have an associated function kit/,
      );
    });

    it("should allow migration when --package override is passed for extension with no counterpart", async () => {
      sandbox.stub(extensionsApi, "listInstances").resolves([mockUnknownInstance]);

      await migrateModule.migrate("test-project", {
        extension: "my-publisher/unknown-extension",
        package: "@custom/override-package",
      });

      expect((logger.info as sinon.SinonSpy).calledWith("TODO: Draw the rest of the owl")).to.be
        .true;
    });

    it("should throw error if specified extension is not installed", async () => {
      sandbox.stub(extensionsApi, "listInstances").resolves([mockInstance1]);

      await expect(
        migrateModule.migrate("test-project", { extension: "non-existent-extension" }),
      ).to.be.rejectedWith(FirebaseError, /Extension non-existent-extension is not installed/);
    });

    it("should auto-select single matching instance and output TODO", async () => {
      sandbox.stub(extensionsApi, "listInstances").resolves([mockInstance1]);

      await migrateModule.migrate("test-project", { extension: "firestore-send-email" });

      expect((logger.info as sinon.SinonSpy).calledWith("TODO: Draw the rest of the owl")).to.be
        .true;
    });

    it("should prompt selection when multiple instances exist for specified extension", async () => {
      sandbox.stub(extensionsApi, "listInstances").resolves([mockInstance1, mockInstance2]);
      const promptStub = sandbox.stub(migrateModule, "promptInstanceSelection").resolves({
        instance: mockInstance1,
        instanceId: "email-1",
        extensionRef: "firebase/firestore-send-email",
        kitPackage: "@firebase/firestore-send-email",
      });

      await migrateModule.migrate("test-project", { extension: "firestore-send-email" });

      expect(promptStub.calledOnce).to.be.true;
      expect((logger.info as sinon.SinonSpy).calledWith("TODO: Draw the rest of the owl")).to.be
        .true;
    });
  });

  describe("migrate flow (--ext-instance flag)", () => {
    it("should throw error if specified instance is not found", async () => {
      sandbox.stub(extensionsApi, "listInstances").resolves([mockInstance1]);

      await expect(
        migrateModule.migrate("test-project", { extInstance: "non-existent" }),
      ).to.be.rejectedWith(FirebaseError, /Extension instance non-existent was not found/);
    });

    it("should throw error if specified instance cannot be migrated", async () => {
      sandbox.stub(extensionsApi, "listInstances").resolves([mockUnknownInstance]);

      await expect(
        migrateModule.migrate("test-project", { extInstance: "custom-ext" }),
      ).to.be.rejectedWith(
        FirebaseError,
        /This extension does not have an associated function kit/,
      );
    });

    it("should select specified instance and output TODO", async () => {
      sandbox.stub(extensionsApi, "listInstances").resolves([mockInstance1]);

      await migrateModule.migrate("test-project", { extInstance: "email-1" });

      expect((logger.info as sinon.SinonSpy).calledWith("TODO: Draw the rest of the owl")).to.be
        .true;
    });
  });
});
