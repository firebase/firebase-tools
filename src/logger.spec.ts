import { expect } from "chai";
import * as sinon from "sinon";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

import * as Transport from "winston-transport";

import { logger, findAvailableLogFile, resolveLogTarget, useFileLogger } from "./logger";

interface FileTransport extends Transport {
  filename?: string;
  close?: () => void;
}

interface LoggerWithTransports {
  transports: FileTransport[];
}

function getLoggerTransports(logObj: unknown): FileTransport[] {
  if (typeof logObj === "object" && logObj !== null && "transports" in logObj) {
    return (logObj as LoggerWithTransports).transports;
  }
  return [];
}

describe("logger", () => {
  const originalEnv = process.env.FIREBASE_DEBUG_PATH;
  let testTmpDir: string;

  beforeEach(() => {
    delete process.env.FIREBASE_DEBUG_PATH;
    testTmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "firebase-debug-test-"));
  });

  afterEach(() => {
    if (originalEnv !== undefined) {
      process.env.FIREBASE_DEBUG_PATH = originalEnv;
    } else {
      delete process.env.FIREBASE_DEBUG_PATH;
    }
    sinon.restore();
    if (fs.existsSync(testTmpDir)) {
      fs.rmSync(testTmpDir, { recursive: true, force: true });
    }
  });

  describe("resolveLogTarget", () => {
    it("should return default when no path or env is set", () => {
      const target = resolveLogTarget();
      expect(target.baseDir).to.equal(process.cwd());
      expect(target.baseName).to.equal("firebase-debug");
      expect(target.ext).to.equal(".log");
    });

    it("should ignore empty or whitespace-only debug path", () => {
      expect(resolveLogTarget("")).to.deep.equal({
        baseDir: process.cwd(),
        baseName: "firebase-debug",
        ext: ".log",
      });
      expect(resolveLogTarget("   ")).to.deep.equal({
        baseDir: process.cwd(),
        baseName: "firebase-debug",
        ext: ".log",
      });

      process.env.FIREBASE_DEBUG_PATH = "   ";
      expect(resolveLogTarget()).to.deep.equal({
        baseDir: process.cwd(),
        baseName: "firebase-debug",
        ext: ".log",
      });
    });

    it("should use FIREBASE_DEBUG_PATH env var when customPath is not provided", () => {
      process.env.FIREBASE_DEBUG_PATH = testTmpDir;
      const target = resolveLogTarget();
      expect(target.baseDir).to.equal(testTmpDir);
      expect(target.baseName).to.equal("firebase-debug");
      expect(target.ext).to.equal(".log");
    });

    it("should prioritize customPath over FIREBASE_DEBUG_PATH env var", () => {
      process.env.FIREBASE_DEBUG_PATH = "/env/path";
      const target = resolveLogTarget(testTmpDir);
      expect(target.baseDir).to.equal(testTmpDir);
    });

    it("should handle existing directory", () => {
      const target = resolveLogTarget(testTmpDir);
      expect(target.baseDir).to.equal(testTmpDir);
      expect(target.baseName).to.equal("firebase-debug");
      expect(target.ext).to.equal(".log");
    });

    it("should handle existing file", () => {
      const existingFile = path.join(testTmpDir, "my-log.txt");
      fs.writeFileSync(existingFile, "hello");

      const target = resolveLogTarget(existingFile);
      expect(target.baseDir).to.equal(testTmpDir);
      expect(target.baseName).to.equal("my-log");
      expect(target.ext).to.equal(".txt");
    });

    it("should handle error thrown by fs.statSync gracefully", () => {
      const existingFile = path.join(testTmpDir, "stat-error.log");
      fs.writeFileSync(existingFile, "hello");
      sinon.stub(fs, "statSync").throws(new Error("EPERM"));

      const target = resolveLogTarget(existingFile);
      expect(target.baseDir).to.equal(testTmpDir);
      expect(target.baseName).to.equal("stat-error");
      expect(target.ext).to.equal(".log");
    });

    it("should handle non-existent directory ending in separator", () => {
      const targetDir = path.join(testTmpDir, "new-dir") + path.sep;
      const target = resolveLogTarget(targetDir);
      expect(target.baseDir).to.equal(path.join(testTmpDir, "new-dir"));
      expect(target.baseName).to.equal("firebase-debug");
      expect(target.ext).to.equal(".log");
    });

    it("should handle non-existent directory without extension", () => {
      const targetDir = path.join(testTmpDir, "logs");
      const target = resolveLogTarget(targetDir);
      expect(target.baseDir).to.equal(targetDir);
      expect(target.baseName).to.equal("firebase-debug");
      expect(target.ext).to.equal(".log");
    });

    it("should handle non-existent file path with extension", () => {
      const filePath = path.join(testTmpDir, "sub", "custom-output.log");
      const target = resolveLogTarget(filePath);
      expect(target.baseDir).to.equal(path.join(testTmpDir, "sub"));
      expect(target.baseName).to.equal("custom-output");
      expect(target.ext).to.equal(".log");
    });

    it("should resolve relative paths against process.cwd()", () => {
      const target = resolveLogTarget("my-debug.log");
      expect(target.baseDir).to.equal(process.cwd());
      expect(target.baseName).to.equal("my-debug");
      expect(target.ext).to.equal(".log");
    });

    it("should expand ~ to home directory", () => {
      const target = resolveLogTarget("~/firebase-debug.log");
      expect(target.baseDir).to.equal(os.homedir());
      expect(target.baseName).to.equal("firebase-debug");
      expect(target.ext).to.equal(".log");
    });

    it("should expand ~ alone to home directory", () => {
      const target = resolveLogTarget("~");
      expect(target.baseDir).to.equal(os.homedir());
      expect(target.baseName).to.equal("firebase-debug");
      expect(target.ext).to.equal(".log");
    });
  });

  describe("findAvailableLogFile", () => {
    it("should return firebase-debug.log inside specified directory if available", () => {
      const logFile = findAvailableLogFile(testTmpDir);
      expect(logFile).to.equal(path.join(testTmpDir, "firebase-debug.log"));
    });

    it("should create directory if it does not exist", () => {
      const newDir = path.join(testTmpDir, "nested", "log-dir");
      const logFile = findAvailableLogFile(newDir);
      expect(fs.existsSync(newDir)).to.be.true;
      expect(logFile).to.equal(path.join(newDir, "firebase-debug.log"));
    });

    it("should return the custom file name when specified", () => {
      const customFile = path.join(testTmpDir, "app-debug.log");
      const logFile = findAvailableLogFile(customFile);
      expect(logFile).to.equal(customFile);
    });

    it("should fall back to numbered candidates when primary file cannot be opened", () => {
      const originalOpenSync = fs.openSync;
      const primaryFile = path.join(testTmpDir, "firebase-debug.log");
      // Create primary file
      fs.writeFileSync(primaryFile, "existing");

      sinon.stub(fs, "openSync").callsFake(((filePath: fs.PathLike, flags: fs.OpenMode) => {
        if (filePath === primaryFile) {
          const err: NodeJS.ErrnoException = new Error("Permission denied");
          err.code = "EPERM";
          throw err;
        }
        return originalOpenSync(filePath, flags);
      }) as typeof fs.openSync);

      const logFile = findAvailableLogFile(testTmpDir);
      expect(logFile).to.equal(path.join(testTmpDir, "firebase-debug.1.log"));
    });

    it("should throw an error if all candidate files fail permissions", () => {
      sinon.stub(fs, "openSync").callsFake(() => {
        const err: NodeJS.ErrnoException = new Error("Permission denied");
        err.code = "EPERM";
        throw err;
      });

      expect(() => findAvailableLogFile(testTmpDir)).to.throw(
        "Unable to obtain permissions for firebase-debug.log",
      );
    });

    it("should handle error without code property thrown by fs.openSync", () => {
      sinon.stub(fs, "openSync").callsFake(() => {
        throw new Error("unexpected error without code");
      });

      expect(() => findAvailableLogFile(testTmpDir)).to.throw(
        "Unable to obtain permissions for firebase-debug.log",
      );
    });

    it("should throw an error if parent directory is not writable", () => {
      sinon.stub(fs, "accessSync").callsFake(() => {
        const err: NodeJS.ErrnoException = new Error("Permission denied");
        err.code = "EACCES";
        throw err;
      });

      expect(() => findAvailableLogFile(testTmpDir)).to.throw(
        "Unable to obtain permissions for firebase-debug.log",
      );
    });

    it("should respect FIREBASE_DEBUG_PATH environment variable", () => {
      process.env.FIREBASE_DEBUG_PATH = path.join(testTmpDir, "env-debug.log");
      const logFile = findAvailableLogFile();
      expect(logFile).to.equal(path.join(testTmpDir, "env-debug.log"));
    });

    it("should respect FIREBASE_DEBUG_PATH when set to an existing directory", () => {
      process.env.FIREBASE_DEBUG_PATH = testTmpDir;
      const logFile = findAvailableLogFile();
      expect(logFile).to.equal(path.join(testTmpDir, "firebase-debug.log"));
    });

    it("should create directory from FIREBASE_DEBUG_PATH if it does not exist", () => {
      const nestedDir = path.join(testTmpDir, "sub", "logs");
      process.env.FIREBASE_DEBUG_PATH = nestedDir;
      const logFile = findAvailableLogFile();
      expect(fs.existsSync(nestedDir)).to.be.true;
      expect(logFile).to.equal(path.join(nestedDir, "firebase-debug.log"));
    });

    it("should create parent directory from FIREBASE_DEBUG_PATH when pointing to a file", () => {
      const targetFile = path.join(testTmpDir, "nested", "custom.log");
      process.env.FIREBASE_DEBUG_PATH = targetFile;
      const logFile = findAvailableLogFile();
      expect(fs.existsSync(path.dirname(targetFile))).to.be.true;
      expect(logFile).to.equal(targetFile);
    });

    it("should trim FIREBASE_DEBUG_PATH", () => {
      process.env.FIREBASE_DEBUG_PATH = `  ${path.join(testTmpDir, "trimmed.log")}  `;
      const logFile = findAvailableLogFile();
      expect(logFile).to.equal(path.join(testTmpDir, "trimmed.log"));
    });
  });

  describe("useFileLogger", () => {
    it("should use FIREBASE_DEBUG_PATH if set", () => {
      const targetFile = path.join(testTmpDir, "use-file-logger.log");
      process.env.FIREBASE_DEBUG_PATH = targetFile;

      const logFile = useFileLogger();
      expect(logFile).to.equal(targetFile);

      // Clean up winston transport added by useFileLogger
      const transports = getLoggerTransports(logger);
      const fileTransport = transports.find((t) => t.filename === targetFile);
      if (fileTransport) {
        logger.remove(fileTransport);
        if (fileTransport.close) {
          fileTransport.close();
        }
      }
    });

    it("should allow explicit logFile override", () => {
      const explicitFile = path.join(testTmpDir, "explicit.log");
      const logFile = useFileLogger(explicitFile);
      expect(logFile).to.equal(explicitFile);

      // Clean up winston transport
      const transports = getLoggerTransports(logger);
      const fileTransport = transports.find((t) => t.filename === explicitFile);
      if (fileTransport) {
        logger.remove(fileTransport);
        if (fileTransport.close) {
          fileTransport.close();
        }
      }
    });
  });
});
