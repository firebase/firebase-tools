import * as fs from "node:fs";
import * as path from "node:path";
import * as spawn from "cross-spawn";

import { AppBundle, AppSpec, Driver, Hook } from "../interfaces";
import { BUNDLE_PATH, genHookScript } from "./hooks";

const ADAPTER_SCRIPTS_PATH = "./.firebase/adapters" as const;

const DOCKER_STAGE_INSTALL = "installer" as const;
const DOCKER_STAGE_BUILD = "builder" as const;

export class DockerDriver implements Driver {
  private dockerfile = "";
  private lastDockerStage = "";

  constructor(readonly spec: AppSpec) {
    this.dockerfile = `FROM ${spec.baseImage} AS base\n`;
    this.lastDockerStage = "base";
  }

  private addDockerStage(stage: string, cmds: string[], fromImg?: string): void {
    this.dockerfile += `FROM ${fromImg ?? this.lastDockerStage} AS ${stage}\n`;
    this.dockerfile += cmds.join("\n");
    this.dockerfile += "\n";
  }

  private execDocker(cmd: string[], args: string[], contextDir: string) {
    console.log(`executing docker: ${cmd.join(" ")} ${args.join(" ")} ${contextDir}`);
    console.log(this.dockerfile);
    return spawn.sync("docker", [...cmd, ...args, "-f", "-", contextDir], {
      env: { ...process.env, ...this.spec.environmentVariables, BUILD_KIT: "1" },
      input: this.dockerfile,
      stdio: [/* stdin= */ "pipe", /* stdout= */ "inherit", /* stderr= */ "inherit"],
    });
  }

  private buildStage(stage: string, contextDir: string): void {
    console.log(`Building stage: ${stage}`);
    const ret = this.execDocker(["buildx", "build"], ["--target", stage], contextDir);
    if (ret.error) {
      throw new Error(`Failed to execute stage ${stage}`, ret.error);
    }
    this.lastDockerStage = stage;
  }

  private exportBundle(contextDir: string): AppBundle {
    const stage = `${this.lastDockerStage}-export`;
    this.addDockerStage(
      stage,
      [`COPY --from=${this.lastDockerStage} ${BUNDLE_PATH} /bundle.json`],
      "scratch"
    );
    const ret = this.execDocker(
      ["buildx", "build"],
      ["--target", stage, "--output", path.dirname(BUNDLE_PATH)],
      contextDir
    );
    if (ret.error) {
      throw new Error(`Failed to export bundle from ${this.lastDockerStage}`, ret.error);
    }
    return JSON.parse(fs.readFileSync(BUNDLE_PATH, "utf8")) as AppBundle;
  }

  install(): void {
    this.addDockerStage(DOCKER_STAGE_INSTALL, [
      "WORKDIR /app",
      ...Object.entries(this.spec.environmentVariables || {}).map(([k, v]) => `ENV ${k}="${v}"`),
      "COPY package.json ./",
      `RUN ${this.spec.installCommand}`,
    ]);
    this.buildStage(DOCKER_STAGE_INSTALL, ".");
  }

  build(): void {
    this.addDockerStage(DOCKER_STAGE_BUILD, [
      "WORKDIR /app",
      "COPY . .",
      `RUN ${this.spec.buildCommand}`,
    ]);
    this.buildStage(DOCKER_STAGE_BUILD, ".");
  }

  export(bundle: AppBundle): void {
    const startCmd = bundle.server?.start.cmd;
    if (startCmd) {
      const exportStage = "exporter";
      this.addDockerStage(
        exportStage,
        [
          `COPY --from=${DOCKER_STAGE_BUILD} /app .`,
          "WORKDIR /app",
          `CMD [${startCmd.map((c) => `"${c}"`).join(", ")}]`,
        ],
        this.spec.baseImage
      );
      const imageName = "us-central1-docker.pkg.dev/danielylee-test-6/composer-demo/node";
      let ret = this.execDocker(
        ["buildx", "build"],
        ["--target", exportStage, "-t", imageName],
        "."
      );
      if (ret.error) {
        throw new Error(`Failed to build image ${imageName}`, ret.error);
      }
      ret = this.execDocker(["push"], [imageName], ".");
      if (ret.error) {
        throw new Error(`Failed to push image ${imageName}`, ret.error);
      }
    }
  }

  execHook(bundle: AppBundle, hook: Hook): AppBundle {
    // Prepare hook execution by writing the node script locally
    const hookScript = `hook-${Date.now()}.js`;
    const hookScriptSrc = genHookScript(bundle, hook);

    if (!fs.existsSync(ADAPTER_SCRIPTS_PATH)) {
      fs.mkdirSync(ADAPTER_SCRIPTS_PATH, { recursive: true });
    }
    fs.writeFileSync(path.join(ADAPTER_SCRIPTS_PATH, hookScript), hookScriptSrc);

    // Execute the hook inside the docker sandbox
    const hookStage = path.basename(hookScript, ".js");
    this.addDockerStage(hookStage, [
      `RUN --mount=source=${ADAPTER_SCRIPTS_PATH},target=/framework/adapters ` +
        `NODE_PATH=./node_modules node /framework/adapters/${hookScript}`,
    ]);
    this.buildStage(hookStage, ".");

    // Pull out generated bundle from the Docker sandbox.
    return this.exportBundle(".");
  }
}
