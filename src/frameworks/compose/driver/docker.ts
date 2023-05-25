import * as fs from "node:fs";
import * as path from "node:path";
import * as spawn from "cross-spawn";

import { AppBundle, AppSpec, Driver, Hook } from "../interfaces";
import { BUNDLE_PATH, genHookScript } from "./hooks";

const ADAPTER_SCRIPTS_PATH = "./.firebase/adapters" as const;

const DOCKER_STAGE_INSTALL = "installer" as const;
const DOCKER_STAGE_BUILD = "builder" as const;

export class DockerfileBuilder {
  private dockerfile = "";
  private lastStage = "";

  from(image: string, name?: string): DockerfileBuilder {
    this.dockerfile += `FROM ${image}`;
    if (name) {
      this.dockerfile += ` AS ${name}`;
      this.lastStage = name;
    }
    this.dockerfile += "\n";

    return this;
  }

  fromLastStage(image: string): DockerfileBuilder {
    return this.from(image, this.lastStage);
  }

  workdir(dir: string): DockerfileBuilder {
    this.dockerfile += `WORKDIR ${dir}\n`;
    return this;
  }

  copy(src: string, dest: string, from?: string): DockerfileBuilder {
    if (from) {
      this.dockerfile += `COPY --from=${from} ${src} ${dest}\n`;
    } else {
      this.dockerfile += `COPY ${src} ${dest}\n`;
    }
    return this;
  }

  run(cmd: string, mount?: string): DockerfileBuilder {
    if (mount) {
      this.dockerfile += `RUN --mount=${mount} ${cmd}\n`;
    } else {
      this.dockerfile += `RUN ${cmd}\n`;
    }
    return this;
  }

  env(key: string, value: string): DockerfileBuilder {
    this.dockerfile += `ENV ${key}="${value}"\n`;
    return this;
  }

  envs(envs: Record<string, string>): DockerfileBuilder {
    for (const [key, value] of Object.entries(envs)) {
      this.env(key, value);
    }
    return this;
  }

  cmd(cmds: string[]): DockerfileBuilder {
    this.dockerfile = `CMD [${cmds.map((c) => `"${c}"`).join(", ")}]`;
    return this;
  }

  toString(): string {
    return this.dockerfile;
  }
}

export class DockerDriver implements Driver {
  private dockerfile = "";
  private dockerfileBuilder;
  private lastDockerStage = "";

  constructor(readonly spec: AppSpec) {
    this.dockerfile = `FROM ${spec.baseImage} AS base\n`;
    this.lastDockerStage = "base";

    this.dockerfileBuilder = new DockerfileBuilder();
    this.dockerfileBuilder.from(spec.baseImage, "base");
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

  private buildStage(stage: string, contextDir: string, extraArgs?: string[]): void {
    console.log(`Building stage: ${stage}`);
    const ret = this.execDocker(
      ["buildx", "build"],
      ["--target", stage, ...(extraArgs || [])],
      contextDir
    );
    if (ret.error) {
      throw new Error(`Failed to execute stage ${stage}`, ret.error);
    }
    this.lastDockerStage = stage;
  }

  private exportBundle(contextDir: string): AppBundle {
    const stage = `${this.lastDockerStage}-export`;
    this.dockerfileBuilder.from("scratch", stage).copy(BUNDLE_PATH, "/bundle.json");
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
    this.dockerfileBuilder
      .fromLastStage(DOCKER_STAGE_INSTALL)
      .workdir("/app")
      .envs(this.spec.environmentVariables || {})
      .copy("package.json", ".")
      .run(this.spec.installCommand);

    this.addDockerStage(DOCKER_STAGE_INSTALL, [
      "WORKDIR /app",
      ...Object.entries(this.spec.environmentVariables || {}).map(([k, v]) => `ENV ${k}="${v}"`),
      "COPY package.json ./",
      `RUN ${this.spec.installCommand}`,
    ]);
    this.buildStage(DOCKER_STAGE_INSTALL, ".");
  }

  build(): void {
    this.dockerfileBuilder
      .fromLastStage(DOCKER_STAGE_BUILD)
      .workdir("/app")
      .copy(".", ".")
      .run(this.spec.buildCommand);

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
      this.dockerfileBuilder
        .from(this.spec.baseImage, exportStage)
        .copy("/app", ".", DOCKER_STAGE_BUILD)
        .cmd(startCmd);

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
      this.buildStage(exportStage, ".", ["--t", imageName]);
      const ret = this.execDocker(["push"], [imageName], ".");
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
    this.dockerfileBuilder
      .fromLastStage(hookStage)
      .run(
        `NODE_PATH=./node_modules node /framework/adapters/${hookScript}`,
        `source=${ADAPTER_SCRIPTS_PATH},target=/framework/adapters`
      );
    this.addDockerStage(hookStage, [
      `RUN --mount=source=${ADAPTER_SCRIPTS_PATH},target=/framework/adapters ` +
        `NODE_PATH=./node_modules node /framework/adapters/${hookScript}`,
    ]);
    this.buildStage(hookStage, ".");

    // Pull out generated bundle from the Docker sandbox.
    return this.exportBundle(".");
  }
}
