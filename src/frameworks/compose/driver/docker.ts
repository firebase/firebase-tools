import * as fs from "node:fs";
import * as path from "node:path";
import * as spawn from "cross-spawn";

import { AppBundle, Driver, Hook } from "../interfaces";
import { BUNDLE_PATH, genHookScript } from "./hooks";
import { RuntimeSpec } from "../discover/types";

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

  fromLastStage(name: string): DockerfileBuilder {
    return this.from(this.lastStage, name);
  }

  /**
   *  Last `from` but does not update the lastStage.
   */
  tempFrom(image: string, name?: string): DockerfileBuilder {
    this.dockerfile += `FROM ${image}`;
    if (name) {
      this.dockerfile += ` AS ${name}`;
    }
    this.dockerfile += "\n";
    return this;
  }

  workdir(dir: string): DockerfileBuilder {
    this.dockerfile += `WORKDIR ${dir}\n`;
    return this;
  }

  copyForFirebase(src: string, dest: string, from?: string): DockerfileBuilder {
    if (from) {
      this.dockerfile += `COPY --chown=firebase:firebase --from=${from} ${src} ${dest}\n`;
    } else {
      this.dockerfile += `COPY --chown=firebase:firebase ${src} ${dest}\n`;
    }
    return this;
  }

  copyFrom(src: string, dest: string, from: string) {
    this.dockerfile += `COPY --from=${from} ${src} ${dest}\n`;
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
    this.dockerfile += `CMD [${cmds.map((c) => `"${c}"`).join(", ")}]\n`;
    return this;
  }

  user(user: string): DockerfileBuilder {
    this.dockerfile += `USER ${user}\n`;
    return this;
  }

  toString(): string {
    return this.dockerfile;
  }
}

export class DockerDriver implements Driver {
  private dockerfileBuilder;

  constructor(readonly spec: RuntimeSpec) {
    this.dockerfileBuilder = new DockerfileBuilder();
    this.dockerfileBuilder.from(spec.baseImage, "base").user("firebase");
  }

  private execDockerPush(args: string[]) {
    console.debug(JSON.stringify({ message: `executing docker build: ${args.join(" ")}` }));
    console.info(
      JSON.stringify({ foo: "bar", message: `executing docker build: ${args.join(" ")}` }),
    );
    console.error(JSON.stringify({ message: `executing docker build: ${args.join(" ")}` }));
    return spawn.sync("docker", ["push", ...args], {
      stdio: [/* stdin= */ "pipe", /* stdout= */ "inherit", /* stderr= */ "inherit"],
    });
  }

  private execDockerBuild(args: string[], contextDir: string) {
    console.log(`executing docker build: ${args.join(" ")} ${contextDir}`);
    console.log(this.dockerfileBuilder.toString());
    return spawn.sync("docker", ["buildx", "build", ...args, "-f", "-", contextDir], {
      env: { ...process.env, ...this.spec.environmentVariables },
      input: this.dockerfileBuilder.toString(),
      stdio: [/* stdin= */ "pipe", /* stdout= */ "inherit", /* stderr= */ "inherit"],
    });
  }

  private buildStage(stage: string, contextDir: string, tag?: string): void {
    console.log(`Building stage: ${stage}`);
    const args = ["--target", stage];
    if (tag) {
      args.push("--tag", tag);
    }
    const ret = this.execDockerBuild(args, contextDir);
    if (ret.error || ret.status !== 0) {
      throw new Error(`Failed to execute stage ${stage}: error=${ret.error} status=${ret.status}`);
    }
  }

  private exportBundle(stage: string, contextDir: string): AppBundle {
    const exportStage = `${stage}-export`;
    this.dockerfileBuilder
      .tempFrom("scratch", exportStage)
      .copyFrom(BUNDLE_PATH, "/bundle.json", stage);
    const ret = this.execDockerBuild(
      ["--target", exportStage, "--output", ".firebase/.output"],
      contextDir,
    );
    if (ret.error || ret.status !== 0) {
      throw new Error(`Failed to export bundle ${stage}: error=${ret.error} status=${ret.status}`);
    }
    return JSON.parse(fs.readFileSync("./.firebase/.output/bundle.json", "utf8")) as AppBundle;
  }

  install(): void {
    if (this.spec.installCommand) {
      this.dockerfileBuilder
        .fromLastStage(DOCKER_STAGE_INSTALL)
        .workdir("/home/firebase/app")
        .envs(this.spec.environmentVariables || {})
        .copyForFirebase("package.json", ".");
      if (this.spec.packageManagerInstallCommand) {
        this.dockerfileBuilder.run(this.spec.packageManagerInstallCommand);
      }
      this.dockerfileBuilder.run(this.spec.installCommand);
      this.buildStage(DOCKER_STAGE_INSTALL, ".");
    }
  }

  build(): void {
    if (this.spec.detectedCommands?.build) {
      this.dockerfileBuilder
        .fromLastStage(DOCKER_STAGE_BUILD)
        .copyForFirebase(".", ".")
        .run(this.spec.detectedCommands.build.cmd);
      this.buildStage(DOCKER_STAGE_BUILD, ".");
    }
  }

  export(bundle: AppBundle): void {
    const startCmd = bundle.server?.start.cmd;
    if (startCmd) {
      const exportStage = "exporter";
      this.dockerfileBuilder
        .from(this.spec.baseImage, exportStage)
        .workdir("/home/firebase/app")
        .copyForFirebase("/home/firebase/app", ".", DOCKER_STAGE_BUILD)
        .cmd(startCmd);
      const imageName = `us-docker.pkg.dev/${process.env.PROJECT_ID}/test/demo-nodappe`;
      this.buildStage(exportStage, ".", imageName);
      const ret = this.execDockerPush([imageName]);
      if (ret.error || ret.status !== 0) {
        throw new Error(
          `Failed to push image ${imageName}: error=${ret.error} status=${ret.status}`,
        );
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
        `source=${ADAPTER_SCRIPTS_PATH},target=/framework/adapters`,
      );
    this.buildStage(hookStage, ".");
    return this.exportBundle(hookStage, ".");
  }
}
