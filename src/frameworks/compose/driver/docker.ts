import * as fs from "node:fs";
import * as path from "node:path";
import * as spawn from "cross-spawn";

import { AppBundle, AppSpec, Driver, Hook } from "../interfaces";

const ADAPTER_SCRIPTS_PATH = "./.firebase/adapters" as const;
const BUNDLE_PATH = "./.firebase/bundle.json" as const;

const DOCKER_STAGE_INSTALL = "installer" as const;
const DOCKER_STAGE_BUILD = "builder" as const;

export class DockerDriver implements Driver {
  private dockerfile = "";
  private lastDockerStage = "";

  constructor(readonly spec: AppSpec) {
    this.dockerfile = `FROM ${spec.baseImage} AS base\n`;
    this.lastDockerStage = "base";
  }

  private addDockerStage(stage: string, cmds: string[]): void {
    this.dockerfile += `FROM ${this.lastDockerStage} AS ${stage}\n`;
    this.dockerfile += cmds.join("\n");
  }

  private buildStage(
    stage: string,
    contextDir: string,
    extraArgs: string[] = [],
    outputOnly = true
  ): void {
    if (!outputOnly) {
      this.lastDockerStage = stage;
    }
    const ret = spawn.sync(
      "docker",
      ["buildx", "build", "--target", stage, "-f", "-", contextDir, ...extraArgs],
      {
        env: { ...process.env, ...this.spec.environmentVariables, BUILD_KIT: "1" },
        input: this.dockerfile,
        stdio: [/* stdin= */ "pipe", /* stdout= */ "inherit", /* stderr= */ "inherit"],
      }
    );
    if (ret.error) {
      throw new Error(`Failed to execute stage ${stage}`, ret.error);
    }
  }

  install(): void {
    this.addDockerStage(DOCKER_STAGE_INSTALL, [
      "WORKDIR /app",
      ...Object.entries(this.spec.environmentVariables || {}).map(([k, v]) => `ENV ${k}="${v}`),
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

  execHook(bundle: AppBundle, hook: Hook): AppBundle {
    // prepare hook execution by writing the node script locally
    const hookScript = `hook-${new Date()}.js`;
    if (!fs.existsSync(ADAPTER_SCRIPTS_PATH)) {
      fs.mkdirSync(ADAPTER_SCRIPTS_PATH, { recursive: true });
    }
    const hookScriptSrc = `
const bundleDir = path.dirname("${BUNDLE_PATH}");
if (!fs.existsSync(bundleDir)) {
  fs.mkdirSync(path.dirname("${BUNDLE_PATH}"));
}
const bundle = (${hook.toString()})(${JSON.stringify(bundle)});
fs.writeFileSync("${BUNDLE_PATH}", JSON.stringify(bundle));
`;
    fs.writeFileSync(path.join(ADAPTER_SCRIPTS_PATH, hookScript), hookScriptSrc);

    // add new docker stage to run the node script
    const hookStage = path.basename(hookScript, ".js");
    this.addDockerStage(hookStage, [
      `RUN --mount=source=${ADAPTER_SCRIPTS_PATH},target=/framework/adapters ` +
        `NODE_PATH=./node_modules node /framework/adapters/${hookScript}`,
    ]);
    this.buildStage(hookStage, ".");

    // Manually add output only stage.
    this.dockerfile = `
FROM scratch as ${hookStage}-export
COPY --from=${hookStage} /${BUNDLE_PATH} /bundle.json
`;
    // execute the stage that outputs generated .output.json locally
    this.buildStage(hookStage, ".", ["--output", "./.firebase"], true);
    return bundle;
  }
}
