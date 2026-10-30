import { expect } from "chai";
import * as fs from "fs";
import * as path from "path";
import * as sinon from "sinon";
import * as tar from "tar";
import * as tmp from "tmp";
import * as localbuilds from "../../apphosting/localbuilds";
import { buildLocally, PackagedLocalBuild } from "./localBuild";

/** Writes `contents` to `file` in `dir`, creating folders as needed. */
function writeFile(dir: string, file: string, contents = ""): void {
  fs.mkdirSync(path.dirname(path.join(dir, file)), { recursive: true });
  fs.writeFileSync(path.join(dir, file), contents);
}

/** Returns the files in `dir` and its subfolders, relative to `dir`, with forward slashes. */
function listFiles(dir: string, subdir = ""): string[] {
  return fs.readdirSync(path.join(dir, subdir), { withFileTypes: true }).flatMap((entry) => {
    const file = subdir ? `${subdir}/${entry.name}` : entry.name;
    return entry.isDirectory() ? listFiles(dir, file) : [file];
  });
}

/** Returns the paths in a tarball. */
function tarEntries(archive: string): string[] {
  const entries: string[] = [];
  tar.list({ file: archive, sync: true, onentry: (entry) => entries.push(entry.path) });
  return entries;
}

describe("buildLocally", () => {
  const env = { API_URL: { value: "https://api.example.com" } };
  let tmpDir: tmp.DirResult;
  let projectDir: string;
  let scratchDir: string;
  let localBuildStub: sinon.SinonStub;
  /** The files in the scratch copy of the project when the build ran. */
  let copiedFiles: string[];

  beforeEach(() => {
    tmpDir = tmp.dirSync({ unsafeCleanup: true });
    projectDir = path.join(tmpDir.name, "project");
    scratchDir = path.join(tmpDir.name, "scratch");
    writeFile(projectDir, ".gitignore", "*.pem\n");
    writeFile(projectDir, "firebase.json", "{}");
    writeFile(projectDir, "web/package.json", "{}");
    writeFile(projectDir, "web/app/page.tsx", "export default function Page() {}");
    writeFile(projectDir, "web/key.pem", "secret");
    writeFile(projectDir, "web/node_modules/next/index.js");
    copiedFiles = [];
    // Stands in for Universal Maker: notes what was copied, then writes output like a Next.js build
    // of the app in options.rootDir.
    localBuildStub = sinon
      .stub(localbuilds, "localBuild")
      .callsFake((projectId, dir, env, options) => {
        copiedFiles = listFiles(scratchDir);
        const app = options?.rootDir ? `${options.rootDir}/` : "";
        writeFile(dir, `${app}.next/standalone/server.js`, "server");
        return Promise.resolve({
          outputFiles: [`${app}.next/standalone`],
          buildConfig: { runCommand: `node ${app}.next/standalone/server.js` },
        });
      });
  });

  afterEach(() => {
    sinon.restore();
    tmpDir.removeCallback();
  });

  /** Builds the app in `rootDir`, a folder in the project. */
  function build(rootDir: string): Promise<PackagedLocalBuild> {
    const config = { backendId: "web", rootDir, ignore: ["node_modules"], localBuild: true };
    return buildLocally("my-project", projectDir, config, env, {
      scratchDir,
      allowLocalBuildSecrets: true,
    });
  }

  it("builds a copy of the project without ignored files, and tars the output", async () => {
    const { archive, buildConfig } = await build("web");

    expect(localBuildStub).to.have.been.calledOnceWith("my-project", scratchDir, env, {
      nonInteractive: undefined,
      allowLocalBuildSecrets: true,
      rootDir: "web",
    });
    // node_modules is ignored by the config, and key.pem by .gitignore.
    expect(copiedFiles).to.have.members([
      ".gitignore",
      "firebase.json",
      "web/package.json",
      "web/app/page.tsx",
    ]);
    expect(tarEntries(archive)).to.deep.equal(["web/.next/standalone/server.js"]);
    expect(buildConfig).to.deep.equal({ runCommand: "node web/.next/standalone/server.js" });
  });

  it("deletes the copy afterwards", async () => {
    await build("web");

    expect(fs.existsSync(scratchDir)).to.be.false;
  });

  it("deletes the copy and reports the error if the build fails", async () => {
    localBuildStub.rejects(new Error("next build failed"));

    await expect(build("web")).to.be.rejectedWith("next build failed");

    expect(fs.existsSync(scratchDir)).to.be.false;
  });

  it("reports the build's error, not the cleanup's, when both fail", async () => {
    localBuildStub.rejects(new Error("next build failed"));
    // The first rmSync clears any copy left by an earlier run. The second is the cleanup.
    sinon
      .stub(fs, "rmSync")
      .callThrough()
      .onSecondCall()
      .throws(new Error("EBUSY: resource busy or locked"));

    await expect(build("web")).to.be.rejectedWith("next build failed");
  });
});
