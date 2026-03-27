import { expect } from "chai";
import * as sinon from "sinon";

import { EmulatorRegistry } from "./registry";
import { Client } from "../apiv2";
import { HubExport, ExportMetadata } from "./hubExport";

describe("HubExport", () => {
  describe("exportFirestore", () => {
    let sandbox: sinon.SinonSandbox;
    let postStub: sinon.SinonStub;
    let getStub: sinon.SinonStub;

    beforeEach(() => {
      sandbox = sinon.createSandbox();
    });

    afterEach(() => {
      sandbox.restore();
    });

    function stubClient(opts: { databases?: Array<{ name: string }>; listError?: Error }) {
      postStub = sandbox.stub().resolves({ body: {} });
      getStub = sandbox.stub().resolves({
        body: { databases: opts.databases ?? [] },
      });
      if (opts.listError) {
        getStub.rejects(opts.listError);
      }

      sandbox.stub(EmulatorRegistry, "client").callsFake((_emulator, options) => {
        const apiVersion = options?.apiVersion;
        if (apiVersion === "v1") {
          return { get: getStub } as unknown as Client;
        }
        return { post: postStub } as unknown as Client;
      });

      sandbox.stub(EmulatorRegistry, "isRunning").returns(true);
    }

    it("should export all listed databases", async () => {
      stubClient({
        databases: [
          { name: "projects/my-project/databases/(default)" },
          { name: "projects/my-project/databases/my-other-db" },
        ],
      });

      const exporter = new HubExport("my-project", {
        path: "/tmp/export",
        initiatedBy: "test",
      });

      const metadata: ExportMetadata = {
        version: "1.0.0",
        firestore: {
          version: "1.0.0",
          path: "firestore_export",
          metadata_file: "firestore_export/firestore_export.overall_export_metadata",
        },
      };

      await exporter["exportFirestore"](metadata);

      expect(postStub.callCount).to.equal(2);
      expect(postStub.firstCall.args[1]).to.deep.include({
        database: "projects/my-project/databases/(default)",
      });
      expect(postStub.secondCall.args[1]).to.deep.include({
        database: "projects/my-project/databases/my-other-db",
      });
    });

    it("should fall back to (default) when listing databases fails", async () => {
      stubClient({
        listError: new Error("connection refused"),
      });

      const exporter = new HubExport("my-project", {
        path: "/tmp/export",
        initiatedBy: "test",
      });

      const metadata: ExportMetadata = {
        version: "1.0.0",
        firestore: {
          version: "1.0.0",
          path: "firestore_export",
          metadata_file: "firestore_export/firestore_export.overall_export_metadata",
        },
      };

      await exporter["exportFirestore"](metadata);

      expect(postStub.callCount).to.equal(1);
      expect(postStub.firstCall.args[1]).to.deep.include({
        database: "projects/my-project/databases/(default)",
      });
    });

    it("should fall back to (default) when database list is empty", async () => {
      stubClient({
        databases: [],
      });

      const exporter = new HubExport("my-project", {
        path: "/tmp/export",
        initiatedBy: "test",
      });

      const metadata: ExportMetadata = {
        version: "1.0.0",
        firestore: {
          version: "1.0.0",
          path: "firestore_export",
          metadata_file: "firestore_export/firestore_export.overall_export_metadata",
        },
      };

      await exporter["exportFirestore"](metadata);

      expect(postStub.callCount).to.equal(1);
      expect(postStub.firstCall.args[1]).to.deep.include({
        database: "projects/my-project/databases/(default)",
      });
    });

    it("should continue exporting remaining databases when one fails", async () => {
      stubClient({
        databases: [
          { name: "projects/my-project/databases/(default)" },
          { name: "projects/my-project/databases/failing-db" },
          { name: "projects/my-project/databases/healthy-db" },
        ],
      });

      postStub.onSecondCall().rejects(new Error("export failed"));

      const exporter = new HubExport("my-project", {
        path: "/tmp/export",
        initiatedBy: "test",
      });

      const metadata: ExportMetadata = {
        version: "1.0.0",
        firestore: {
          version: "1.0.0",
          path: "firestore_export",
          metadata_file: "firestore_export/firestore_export.overall_export_metadata",
        },
      };

      await exporter["exportFirestore"](metadata);

      expect(postStub.callCount).to.equal(3);
      expect(postStub.thirdCall.args[1]).to.deep.include({
        database: "projects/my-project/databases/healthy-db",
      });
    });
  });
});
