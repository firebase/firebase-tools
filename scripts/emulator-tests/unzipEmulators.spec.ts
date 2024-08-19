import { expect } from "chai";
import * as fs from "fs";
import * as path from "path";
import { unzip } from "../../src/unzip";
import { DownloadDetails } from "../../src/emulator/downloadableEmulators";
import { Client } from "../../src/apiv2";
import { tmpdir } from "os";

describe("unzipEmulators", () => {
  let tempDir: string;

  before(async () => {
    tempDir = await fs.promises.mkdtemp(path.join(tmpdir(), "firebasetest-"));
  });

  after(async () => {
    await fs.promises.rmdir(tempDir, { recursive: true });
  });

  it("should unzip a ui emulator zip file", async () => {
    const [uiVersion, uiRemoteUrl] = [
      DownloadDetails.ui.version,
      DownloadDetails.ui.opts.remoteUrl,
    ];

    const uiZipPath = path.join(tempDir, `ui-v${uiVersion}.zip`);

    await fs.promises.mkdir(tempDir, { recursive: true });
    if (!(await fs.promises.access(uiZipPath).catch(() => false))) {
      await downloadFile(uiRemoteUrl, uiZipPath);
    }

    await unzip(uiZipPath, path.join(tempDir, "ui"));

    const files = await fs.promises.readdir(tempDir);
    expect(files).to.include("ui");

    const uiFiles = await fs.promises.readdir(path.join(tempDir, "ui"));
    expect(uiFiles).to.include("client");
    expect(uiFiles).to.include("server");

    const serverFiles = await fs.promises.readdir(path.join(tempDir, "ui", "server"));
    expect(serverFiles).to.include("server.mjs");
  }).timeout(10000);

  it("should unzip a pubsub emulator zip file", async () => {
    const [pubsubVersion, pubsubRemoteUrl] = [
      DownloadDetails.pubsub.version,
      DownloadDetails.pubsub.opts.remoteUrl,
    ];

    const pubsubZipPath = path.join(tempDir, `pubsub-emulator-v${pubsubVersion}.zip`);

    if (!(await fs.promises.access(pubsubZipPath).catch(() => false))) {
      await downloadFile(pubsubRemoteUrl, pubsubZipPath);
    }

    await unzip(pubsubZipPath, path.join(tempDir, "pubsub"));

    const files = await fs.promises.readdir(tempDir);
    expect(files).to.include("pubsub");

    const pubsubFiles = await fs.promises.readdir(path.join(tempDir, "pubsub"));
    expect(pubsubFiles).to.include("pubsub-emulator");

    const pubsubEmulatorFiles = await fs.promises.readdir(
      path.join(tempDir, "pubsub", "pubsub-emulator"),
    );
    expect(pubsubEmulatorFiles).to.include("bin");
    expect(pubsubEmulatorFiles).to.include("lib");

    const binFiles = await fs.promises.readdir(
      path.join(tempDir, "pubsub", "pubsub-emulator", "bin"),
    );
    expect(binFiles).to.include("cloud-pubsub-emulator");
  }).timeout(10000);
});

async function downloadFile(url: string, targetPath: string): Promise<string> {
  const u = new URL(url);
  const c = new Client({ urlPrefix: u.origin, auth: false });

  const writeStream = fs.createWriteStream(targetPath);

  const res = await c.request<void, NodeJS.ReadableStream>({
    method: "GET",
    path: u.pathname,
    queryParams: u.searchParams,
    responseType: "stream",
    resolveOnHTTPError: true,
  });

  if (res.status !== 200) {
    throw new Error(
      `Download failed, file "${url}" does not exist. status ${
        res.status
      }: ${await res.response.text()}`,
      {
        cause: new Error(
          `Object DownloadDetails from src${path.sep}emulator${path.sep}downloadableEmulators.ts contains invalid URL: ${url}`,
        ),
      },
    );
  }

  return new Promise<string>((resolve, reject) => {
    writeStream.on("finish", () => {
      resolve(targetPath);
    });
    writeStream.on("error", (err) => {
      reject(err);
    });
    res.body.pipe(writeStream);
  });
}
