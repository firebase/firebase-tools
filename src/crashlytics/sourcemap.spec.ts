import * as chai from "chai";
import * as sinon from "sinon";
import * as fs from "fs";
import * as path from "path";
import * as tmp from "tmp";
import * as childProcess from "child_process";

import {
  checkGoogleAppID,
  getAppVersion,
  normalizeFileName,
  getLinkedSourceMapPath,
  findSourceMapMappings,
  CommandOptions,
  uploadMap,
  uploadSourceMaps,
  UploadRequest,
} from "./sourcemap";
import { FirebaseError } from "../error";
import * as utils from "../utils";
import { Config } from "../config";
import { RC } from "../rc";
import * as archiver from "../archiveFile";
import * as gcs from "../gcp/storage";
import { Client, ClientResponse } from "../apiv2";

function mockCommandOptions(options: Partial<CommandOptions> = {}): CommandOptions {
  return {
    configPath: "",
    only: "",
    except: "",
    config: {} as unknown as Config,
    filteredTargets: [],
    force: false,
    nonInteractive: true,
    debug: false,
    rc: {} as unknown as RC,
    ...options,
  };
}

const expect = chai.expect;

describe("crashlytics:sourcemap helpers", () => {
  let sandbox: sinon.SinonSandbox;

  beforeEach(() => {
    sandbox = sinon.createSandbox();
  });

  afterEach(() => {
    sandbox.restore();
  });

  describe("checkGoogleAppID", () => {
    it("should throw a FirebaseError if app ID is not set", () => {
      expect(() => checkGoogleAppID(mockCommandOptions({}))).to.throw(
        FirebaseError,
        "set --app <appId> to a valid Firebase application id",
      );
    });

    it("should not throw if app ID is set", () => {
      expect(() => checkGoogleAppID(mockCommandOptions({ app: "1:12345:web:abc" }))).to.not.throw();
    });
  });

  describe("normalizeFileName", () => {
    it("should replace all slashes with hyphens", () => {
      expect(normalizeFileName("path/to/some/file.js")).to.equal("path-to-some-file.js");
      expect(normalizeFileName("file.js")).to.equal("file.js");
    });
  });

  describe("getAppVersion", () => {
    let commandExistsSyncStub: sinon.SinonStub;
    let execSyncStub: sinon.SinonStub;

    beforeEach(() => {
      commandExistsSyncStub = sandbox.stub(utils, "commandExistsSync");
      execSyncStub = sandbox.stub(childProcess, "execSync");
    });

    it("should return the custom appVersion if provided", () => {
      expect(getAppVersion(mockCommandOptions({ appVersion: "2.3.4" }))).to.equal("2.3.4");
    });

    it("should fall back to git commit hash if available", () => {
      commandExistsSyncStub.withArgs("git").returns(true);
      execSyncStub.withArgs("git rev-parse HEAD").returns(Buffer.from("abc123456"));

      expect(getAppVersion(mockCommandOptions({}))).to.equal("abc123456");
    });

    it("should fall back to package.json version if git is not available", () => {
      commandExistsSyncStub.withArgs("git").returns(false);
      commandExistsSyncStub.withArgs("npm").returns(true);
      execSyncStub.withArgs("npm pkg get version").returns(Buffer.from("1.0.1"));

      expect(getAppVersion(mockCommandOptions({}))).to.equal("1.0.1");
    });

    it("should return 'unset' if both git and npm fallback fail", () => {
      commandExistsSyncStub.withArgs("git").returns(false);
      commandExistsSyncStub.withArgs("npm").returns(false);

      expect(getAppVersion(mockCommandOptions({}))).to.equal("unset");
    });
  });

  describe("getLinkedSourceMapPath", () => {
    it("should return undefined for empty files", async () => {
      const tmpFile = tmp.fileSync({ postfix: ".js" });
      try {
        const result = await getLinkedSourceMapPath(tmpFile.name);
        expect(result).to.be.undefined;
      } finally {
        tmpFile.removeCallback();
      }
    });

    it("should extract correct sourceMappingURL from standard format", async () => {
      const tmpFile = tmp.fileSync({ postfix: ".js" });
      fs.writeFileSync(tmpFile.name, "console.log('hello');\n//# sourceMappingURL=main.js.map");
      try {
        const result = await getLinkedSourceMapPath(tmpFile.name);
        expect(result).to.equal(path.join(path.dirname(tmpFile.name), "main.js.map"));
      } finally {
        tmpFile.removeCallback();
      }
    });

    it("should extract correct sourceMappingURL with trailing newlines/spaces", async () => {
      const tmpFile = tmp.fileSync({ postfix: ".js" });
      fs.writeFileSync(
        tmpFile.name,
        "console.log('hello');\n//@ sourceMappingURL=sub/other.js.map  \n\n ",
      );
      try {
        const result = await getLinkedSourceMapPath(tmpFile.name);
        expect(result).to.equal(path.join(path.dirname(tmpFile.name), "sub/other.js.map"));
      } finally {
        tmpFile.removeCallback();
      }
    });
  });

  describe("findSourceMapMappings", () => {
    it("should construct mappings correctly for linked files", async () => {
      const tmpJs = tmp.fileSync({ postfix: ".js" });
      const jsName = path.basename(tmpJs.name);
      const mapName = `${jsName}.map`;
      const tmpMap = path.join(path.dirname(tmpJs.name), mapName);

      fs.writeFileSync(tmpJs.name, `console.log('hello');\n//# sourceMappingURL=${mapName}`);
      fs.writeFileSync(tmpMap, '{"version":3}');

      try {
        const files = [{ name: tmpJs.name }, { name: tmpMap }];
        const rootDir = path.dirname(tmpJs.name);
        const results = await findSourceMapMappings(files, rootDir);

        expect(results).to.have.lengthOf(1);
        expect(results[0]).to.deep.equal({
          mapFilePath: tmpMap,
          obfuscatedFilePath: jsName,
        });
      } finally {
        tmpJs.removeCallback();
        try {
          fs.unlinkSync(tmpMap);
        } catch (e) {
          // ignore
        }
      }
    });

    it("should include unlinked map files as themselves", async () => {
      const tmpMap = tmp.fileSync({ postfix: ".js.map" });
      fs.writeFileSync(tmpMap.name, '{"version":3}');
      const mapName = path.basename(tmpMap.name);

      try {
        const files = [{ name: tmpMap.name }];
        const rootDir = path.dirname(tmpMap.name);
        const results = await findSourceMapMappings(files, rootDir);

        expect(results).to.have.lengthOf(1);
        expect(results[0]).to.deep.equal({
          mapFilePath: tmpMap.name,
          obfuscatedFilePath: mapName,
        });
      } finally {
        tmpMap.removeCallback();
      }
    });
  });

  describe("uploadMap", () => {
    let archiveFileStub: sinon.SinonStub;
    let uploadObjectStub: sinon.SinonStub;
    let clientPatchStub: sinon.SinonStub;
    let logLabeledWarningStub: sinon.SinonStub;
    const tempFiles: tmp.FileResult[] = [];

    function mockUploadRequest(overrides: Partial<UploadRequest> = {}): UploadRequest {
      return {
        projectId: "test-project",
        mappingFile: "path/to/file.js.map",
        obfuscatedFilePath: "path/to/file.js",
        bucketName: "test-bucket",
        appVersion: "1.0.0",
        options: mockCommandOptions({ app: "1:12345:web:abc" }),
        ...overrides,
      };
    }

    beforeEach(() => {
      archiveFileStub = sandbox.stub(archiver, "archiveFile").callsFake(() => {
        const tmpFile = tmp.fileSync({ postfix: ".zip" });
        fs.writeFileSync(tmpFile.name, "dummy-content");
        tempFiles.push(tmpFile);
        return Promise.resolve(tmpFile.name);
      });

      uploadObjectStub = sandbox
        .stub(gcs, "uploadObject")
        .callsFake((source: { file: string }, bucketName: string) => {
          return Promise.resolve({
            bucket: bucketName,
            object: path.basename(source.file),
            generation: "123",
          });
        });

      clientPatchStub = sandbox.stub(Client.prototype, "patch").resolves({
        status: 200,
        response: {} as unknown as ClientResponse<unknown>["response"],
        body: {},
      } as unknown as ClientResponse<unknown>);
      logLabeledWarningStub = sandbox.stub(utils, "logLabeledWarning");
    });

    afterEach(() => {
      for (const file of tempFiles) {
        try {
          file.removeCallback();
        } catch {
          // ignore
        }
      }
      tempFiles.length = 0;
    });

    it("should archive, upload, and register a source map successfully", async () => {
      const request = mockUploadRequest({
        mappingFile: "/mock-root/path/to/file.js.map",
        obfuscatedFilePath: "path/to/file.js",
        options: mockCommandOptions({
          app: "1:12345:web:abc",
          projectRoot: "/mock-root",
        }),
      });

      const result = await uploadMap(request);

      const expectedUid = utils.murmurHashV3("1:12345:web:abc-1.0.0-path/to/file.js");
      const expectedName = `projects/test-project/locations/global/mappingFiles/${expectedUid}`;

      expect(result).to.be.true;
      expect(archiveFileStub.callCount).to.equal(1);
      expect(archiveFileStub.firstCall.args).to.deep.equal([
        "path/to/file.js.map",
        {
          archivedFileName: "mapping.js.map",
        },
      ]);
      expect(uploadObjectStub.callCount).to.equal(1);
      const uploadArg = uploadObjectStub.firstCall.args[0] as { file: string };
      expect(uploadArg.file).to.equal("1:12345:web:abc-1.0.0-path-to-file.js.zip");
      expect(uploadObjectStub.firstCall.args[1]).to.equal("test-bucket");
      expect(clientPatchStub.callCount).to.equal(1);
      expect(clientPatchStub.firstCall.args[0]).to.match(
        /^projects\/test-project\/locations\/global\/mappingFiles\/\w+$/,
      );
      expect(clientPatchStub.firstCall.args[1] as unknown).to.deep.equal({
        name: expectedName,
        appId: "1:12345:web:abc",
        version: "1.0.0",
        obfuscatedFilePath: "/path/to/file.js",
        fileUri: "gs://test-bucket/1:12345:web:abc-1.0.0-path-to-file.js.zip",
      });
      expect(clientPatchStub.firstCall.args[2]).to.deep.equal({
        queryParams: { allowMissing: "true" },
      });
    });

    it("should normalize Next.js paths and ignore dev segments in obfuscated path", async () => {
      const request = mockUploadRequest({
        mappingFile: "/mock-root/path/to/file.js.map",
        obfuscatedFilePath: "path/to/.next/dev/file.js",
        options: mockCommandOptions({
          app: "1:12345:web:abc",
          projectRoot: "/mock-root",
        }),
      });

      const result = await uploadMap(request);

      expect(result).to.be.true;
      const uploadArg = uploadObjectStub.firstCall.args[0] as { file: string };
      expect(uploadArg.file).to.equal("1:12345:web:abc-1.0.0-path-to-_next-file.js.zip");
      const patchArg = clientPatchStub.firstCall.args[1] as {
        obfuscatedFilePath: string;
        fileUri: string;
      };
      expect(patchArg.obfuscatedFilePath).to.equal("/path/to/_next/file.js");
      expect(patchArg.fileUri).to.equal(
        "gs://test-bucket/1:12345:web:abc-1.0.0-path-to-_next-file.js.zip",
      );
    });

    it("should return false and log a warning when upload fails with attemptsRemaining === 0", async () => {
      uploadObjectStub.rejects(new Error("upload failed"));
      const request = mockUploadRequest();

      const result = await uploadMap(request, 0);

      expect(result).to.be.false;
      expect(logLabeledWarningStub.callCount).to.equal(1);
      expect(logLabeledWarningStub.firstCall.args[1]).to.contain("Failed to upload mapping file");
    });

    it("should return false and not log a warning when upload fails with attemptsRemaining > 0", async () => {
      uploadObjectStub.rejects(new Error("upload failed"));
      const request = mockUploadRequest();

      const result = await uploadMap(request, 1);

      expect(result).to.be.false;
      expect(logLabeledWarningStub.callCount).to.equal(0);
    });

    it("should return false and log a warning when registerSourceMap fails with general error", async () => {
      clientPatchStub.rejects(new Error("registration failed"));
      const request = mockUploadRequest();

      const result = await uploadMap(request, 0);

      expect(result).to.be.false;
      expect(logLabeledWarningStub.callCount).to.equal(1);
      expect(logLabeledWarningStub.firstCall.args[1]).to.contain("Failed to register source map");
    });

    it("should return true and ignore 409 status errors from registerSourceMap", async () => {
      clientPatchStub.rejects(new FirebaseError("already exists", { status: 409 }));
      const request = mockUploadRequest();

      const result = await uploadMap(request);

      expect(result).to.be.true;
      expect(logLabeledWarningStub.callCount).to.equal(0);
    });
  });

  describe("uploadSourceMaps", () => {
    let archiveFileStub: sinon.SinonStub;
    let uploadObjectStub: sinon.SinonStub;
    let clientPatchStub: sinon.SinonStub;
    let logLabeledWarningStub: sinon.SinonStub;
    const tempFiles: tmp.FileResult[] = [];

    beforeEach(() => {
      archiveFileStub = sandbox.stub(archiver, "archiveFile").callsFake(() => {
        const tmpFile = tmp.fileSync({ postfix: ".zip" });
        fs.writeFileSync(tmpFile.name, "dummy-content");
        tempFiles.push(tmpFile);
        return Promise.resolve(tmpFile.name);
      });

      uploadObjectStub = sandbox
        .stub(gcs, "uploadObject")
        .callsFake((source: { file: string }, bucketName: string) => {
          return Promise.resolve({
            bucket: bucketName,
            object: path.basename(source.file),
            generation: "123",
          });
        });

      clientPatchStub = sandbox.stub(Client.prototype, "patch").resolves({
        status: 200,
        response: {} as unknown as ClientResponse<unknown>["response"],
        body: {},
      } as unknown as ClientResponse<unknown>);
      logLabeledWarningStub = sandbox.stub(utils, "logLabeledWarning");
    });

    afterEach(() => {
      for (const file of tempFiles) {
        try {
          file.removeCallback();
        } catch {
          // ignore
        }
      }
      tempFiles.length = 0;
    });

    it("should upload multiple source maps in parallel successfully", async () => {
      const mappings = [
        { mapFilePath: "/mock-root/file1.js.map", obfuscatedFilePath: "file1.js" },
        { mapFilePath: "/mock-root/file2.js.map", obfuscatedFilePath: "file2.js" },
      ];
      const request = {
        projectId: "test-project",
        bucketName: "test-bucket",
        appVersion: "1.0.0",
        options: mockCommandOptions({
          app: "1:12345:web:abc",
          projectRoot: "/mock-root",
        }),
      };

      const result = await uploadSourceMaps(mappings, request);

      expect(result).to.deep.equal({
        successCount: 2,
        failedFiles: [],
      });
      expect(archiveFileStub.callCount).to.equal(2);
      expect(uploadObjectStub.callCount).to.equal(2);
      expect(clientPatchStub.callCount).to.equal(2);
    });

    it("should retry once on failure if wait step succeeds", async () => {
      const mappings = [{ mapFilePath: "/mock-root/file1.js.map", obfuscatedFilePath: "file1.js" }];
      const request = {
        projectId: "test-project",
        bucketName: "test-bucket",
        appVersion: "1.0.0",
        options: mockCommandOptions({
          app: "1:12345:web:abc",
          projectRoot: "/mock-root",
          retryDelay: 1,
        }),
      };

      uploadObjectStub.onFirstCall().rejects(new Error("transient upload error"));
      uploadObjectStub.onSecondCall().resolves({
        bucket: "test-bucket",
        object: "mock-object.zip",
        generation: "123",
      });

      const result = await uploadSourceMaps(mappings, request);

      expect(result).to.deep.equal({
        successCount: 1,
        failedFiles: [],
      });
      expect(archiveFileStub.callCount).to.equal(2);
      expect(uploadObjectStub.callCount).to.equal(2);
      expect(clientPatchStub.callCount).to.equal(1);
      expect(logLabeledWarningStub.callCount).to.equal(0);
    });

    it("should track failed files if retry attempt also fails", async () => {
      const mappings = [
        { mapFilePath: "/mock-root/file1.js.map", obfuscatedFilePath: "file1.js" },
        { mapFilePath: "/mock-root/file2.js.map", obfuscatedFilePath: "file2.js" },
      ];
      const request = {
        projectId: "test-project",
        bucketName: "test-bucket",
        appVersion: "1.0.0",
        options: mockCommandOptions({
          app: "1:12345:web:abc",
          projectRoot: "/mock-root",
          retryDelay: 1,
        }),
      };

      uploadObjectStub.callsFake((source: { file: string }, bucketName: string) => {
        if (source.file.includes("file2.js")) {
          return Promise.reject(new Error("permanent upload error"));
        }
        return Promise.resolve({
          bucket: bucketName,
          object: source.file,
          generation: "123",
        });
      });

      const result = await uploadSourceMaps(mappings, request);

      expect(result).to.deep.equal({
        successCount: 1,
        failedFiles: ["/mock-root/file2.js.map"],
      });
      expect(archiveFileStub.callCount).to.equal(3);
      expect(clientPatchStub.callCount).to.equal(1);
      expect(logLabeledWarningStub.callCount).to.equal(1);
    });
  });
});
