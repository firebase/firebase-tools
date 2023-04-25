import { expect } from "chai";
import * as fs from "fs";
import * as path from "path";
import { unzip } from "../unzip";
import { DownloadDetails } from "../emulator/downloadableEmulators";
import { Client } from "../apiv2";
const fixturesDir = path.resolve(__dirname, "./fixtures");

const ZIP_FIXTURES_PATH = path.join(fixturesDir, "zip-files");
const ZIP_TEMPORARY_PATH = path.join(ZIP_FIXTURES_PATH, "temp");
const ZIP_UNZIPPER_PATH = path.join(ZIP_FIXTURES_PATH, "node-unzipper-testData");

describe("unzip", () => {
  let uiZipPath: string;
  let pubsubZipPath: string;
  before(function (done) {
    // eslint-disable-next-line @typescript-eslint/no-invalid-this
    this.timeout(5000);
    (async () => {
      const [uiVersion, uiRemoteUrl] = [
        DownloadDetails.ui.version,
        DownloadDetails.ui.opts.remoteUrl,
      ];
      const [pubsubVersion, pubsubRemoteUrl] = [
        DownloadDetails.pubsub.version,
        DownloadDetails.pubsub.opts.remoteUrl,
      ];

      uiZipPath = path.join(ZIP_TEMPORARY_PATH, `ui-v${uiVersion}.zip`);
      pubsubZipPath = path.join(ZIP_TEMPORARY_PATH, `pubsub-emulator-v${pubsubVersion}.zip`);

      await fs.promises.mkdir(ZIP_TEMPORARY_PATH, { recursive: true });
      if (!(await fs.promises.access(uiZipPath).catch(() => false))) {
        await downloadFile(uiRemoteUrl, uiZipPath);
      }

      if (!(await fs.promises.access(pubsubZipPath).catch(() => false))) {
        await downloadFile(pubsubRemoteUrl, pubsubZipPath);
      }
    })()
      .then(done)
      .catch(done);
  });

  after(async () => {
    // await fs.promises.rmdir(ZIP_TEMPORARY_PATH, { recursive: true });
  });

  it("should unzip a ui emulator zip file", async function () {
    // eslint-disable-next-line @typescript-eslint/no-invalid-this
    this.timeout(2000);
    await unzip(uiZipPath, path.join(ZIP_TEMPORARY_PATH, "ui"));

    const files = await fs.promises.readdir(ZIP_TEMPORARY_PATH);
    expect(files).to.include("ui");

    const uiFiles = await fs.promises.readdir(path.join(ZIP_TEMPORARY_PATH, "ui"));
    expect(uiFiles).to.include("client");
    expect(uiFiles).to.include("server");

    const serverFiles = await fs.promises.readdir(path.join(ZIP_TEMPORARY_PATH, "ui", "server"));
    expect(serverFiles).to.include("server.js");
  });

  it("should unzip a pubsub emulator zip file", async function () {
    // eslint-disable-next-line @typescript-eslint/no-invalid-this
    this.timeout(2000);
    await unzip(pubsubZipPath, path.join(ZIP_TEMPORARY_PATH, "pubsub"));

    const files = await fs.promises.readdir(ZIP_TEMPORARY_PATH);
    expect(files).to.include("pubsub");

    const pubsubFiles = await fs.promises.readdir(path.join(ZIP_TEMPORARY_PATH, "pubsub"));
    expect(pubsubFiles).to.include("pubsub-emulator");

    const pubsubEmulatorFiles = await fs.promises.readdir(
      path.join(ZIP_TEMPORARY_PATH, "pubsub", "pubsub-emulator")
    );
    expect(pubsubEmulatorFiles).to.include("bin");
    expect(pubsubEmulatorFiles).to.include("lib");

    const binFiles = await fs.promises.readdir(
      path.join(ZIP_TEMPORARY_PATH, "pubsub", "pubsub-emulator", "bin")
    );
    expect(binFiles).to.include("cloud-pubsub-emulator");
  });

  const cases = [
    { name: "compressed-cp866" },
    { name: "compressed-directory-entry" },
    { name: "compressed-flags-set" },
    { name: "compressed-standard" },
    { name: "uncompressed" },
    { name: "zip-slip" },
    { name: "zip64" },
  ];

  for (const { name } of cases) {
    it(`should unzip a zip file with ${name} case`, async () => {
      const zipPath = path.join(ZIP_UNZIPPER_PATH, name, "archive.zip");
      const unzipPath = path.join(ZIP_TEMPORARY_PATH, name);
      await unzip(zipPath, unzipPath);

      // contains a folder "inflated"
      const inflatedPath = path.join(ZIP_UNZIPPER_PATH, name, "inflated");
      expect(await fs.promises.stat(inflatedPath)).to.be.ok;

      // // inflated folder's size is "size"
      expect(await calculateFolderSize(inflatedPath)).to.eql(await calculateFolderSize(unzipPath));
    });
  }
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
          `Object DownloadDetails from src${path.sep}emulator${path.sep}downloadableEmulators.ts contains invalid URL: ${url}`
        ),
      }
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

async function calculateFolderSize(folderPath: string): Promise<number> {
  const files = await fs.promises.readdir(folderPath);
  let size = 0;
  for (const file of files) {
    const filePath = path.join(folderPath, file);
    const stat = await fs.promises.stat(filePath);
    if (stat.isDirectory()) {
      size += await calculateFolderSize(filePath);
    } else {
      size += stat.size;
    }
  }
  return size;
}
