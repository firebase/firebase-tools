import { expect } from "chai";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import * as tar from "tar";
import { createArchive } from "./archive";
import { unzip } from "./unzip";

/**
 * Reads external POSIX mode bits for each entry from a ZIP archive's Central Directory.
 */
function readZipEntryModes(zipPath: string): Record<string, number> {
  const buf = fs.readFileSync(zipPath);
  const modes: Record<string, number> = {};
  const cdSig = 0x02014b50;
  for (let i = 0; i <= buf.length - 46; i++) {
    if (buf.readUInt32LE(i) !== cdSig) {
      continue;
    }
    const nameLen = buf.readUInt16LE(i + 28);
    const extraLen = buf.readUInt16LE(i + 30);
    const commentLen = buf.readUInt16LE(i + 32);
    const externalAttr = buf.readUInt32LE(i + 38);
    const name = buf.subarray(i + 46, i + 46 + nameLen).toString("utf8");
    modes[name] = (externalAttr >>> 16) & 0xffff;
    i += 45 + nameLen + extraLen + commentLen;
  }
  return modes;
}

describe("createArchive", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "firebase-archive-test-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("creates a valid zip archive with files, buffers, and POSIX executable modes", async () => {
    const srcFile = path.join(tmpDir, "script.sh");
    fs.writeFileSync(srcFile, "#!/bin/sh\necho hi\n", "utf8");

    const zipPath = path.join(tmpDir, "out.zip");
    const outStream = fs.createWriteStream(zipPath);
    const archive = createArchive("zip", outStream);
    archive.file(srcFile, { name: "bin\\script.sh", mode: 0o755 });
    archive.append('{"hello":"world"}', { name: ".runtimeconfig.json", mode: 0o644 });
    await archive.finalize();

    const extractDir = path.join(tmpDir, "extracted-zip");
    fs.mkdirSync(extractDir);
    await unzip(zipPath, extractDir);

    expect(fs.readFileSync(path.join(extractDir, "bin", "script.sh"), "utf8")).to.equal(
      "#!/bin/sh\necho hi\n",
    );
    expect(fs.readFileSync(path.join(extractDir, ".runtimeconfig.json"), "utf8")).to.equal(
      '{"hello":"world"}',
    );

    const modes = readZipEntryModes(zipPath);
    expect(modes["bin/script.sh"]).to.equal(fs.constants.S_IFREG | 0o755);
    expect(modes[".runtimeconfig.json"]).to.equal(fs.constants.S_IFREG | 0o644);
  });

  it("creates a valid tar.gz archive with files, buffers, and POSIX executable modes", async () => {
    const srcFile = path.join(tmpDir, "server");
    fs.writeFileSync(srcFile, "binary-content", "utf8");

    const tarPath = path.join(tmpDir, "out.tar.gz");
    const outStream = fs.createWriteStream(tarPath);
    const archive = createArchive("tar.gz", outStream);
    archive.file(srcFile, { name: "bin/server", mode: 0o755 });
    archive.append('{"env":"prod"}', { name: ".runtimeconfig.json", mode: 0o644 });
    await archive.finalize();

    const entries: Record<string, number | undefined> = {};
    await tar.list({
      file: tarPath,
      onentry: (entry) => {
        entries[entry.path] = entry.mode;
      },
    });
    expect(entries["bin/server"]).to.equal(0o755);
    expect(entries[".runtimeconfig.json"]).to.equal(0o644);

    const extractDir = path.join(tmpDir, "extracted-tar");
    fs.mkdirSync(extractDir);
    await tar.extract({ file: tarPath, cwd: extractDir });
    expect(fs.readFileSync(path.join(extractDir, "bin", "server"), "utf8")).to.equal(
      "binary-content",
    );
    expect(fs.readFileSync(path.join(extractDir, ".runtimeconfig.json"), "utf8")).to.equal(
      '{"env":"prod"}',
    );
  });

  it("rejects finalize() when a source file does not exist", async () => {
    const missing = path.join(tmpDir, "missing.txt");

    const zipPath = path.join(tmpDir, "missing.zip");
    const zipArchive = createArchive("zip", fs.createWriteStream(zipPath));
    zipArchive.file(missing, { name: "missing.txt" });
    await expect(zipArchive.finalize()).to.be.rejected;

    const tarPath = path.join(tmpDir, "missing.tar.gz");
    const tarArchive = createArchive("tar.gz", fs.createWriteStream(tarPath));
    tarArchive.file(missing, { name: "missing.txt" });
    await expect(tarArchive.finalize()).to.be.rejected;
  });
});
