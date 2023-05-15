import * as spawn from "cross-spawn";

import { AppSpec, Driver } from "../interfaces";

const DOCKER_STAGE_INSTALL = "installer" as const;
const DOCKER_STAGE_BUILD = "builder" as const;
// const DOCKER_STAGE_EXPORT = "exporter";

function genDockerfile(spec: AppSpec): string {
  return `FROM ${spec.baseImage} AS base

# Install Dependencies
FROM base AS ${DOCKER_STAGE_INSTALL}
WORKDIR /app
${Object.entries(spec.environmentVariables || {})
  .map((k, v) => `ENV ${k}="${v}"`)
  .join("\n")}
COPY package.json ./
RUN ${spec.installCommand};

# Build Application
FROM installer AS ${DOCKER_STAGE_BUILD}
WORKDIR /app
COPY . .
RUN ${spec.buildCommand}

# (Optional) Export installer layer for inspection
FROM scratch AS ${DOCKER_STAGE_BUILD}-export
COPY --from=installer /app /

# (Optional) Export builder layer for inspection
FROM scratch AS ${DOCKER_STAGE_BUILD}-export
COPY --from=builder /app /
`;
}

export class DockerDriver implements Driver {
  private dockerfile = "";

  constructor(readonly spec: AppSpec) {
    this.dockerfile = genDockerfile(this.spec);
  }

  private buildStage(stage: string, contextDir: string) {
    const ret = spawn.sync(
      "docker",
      ["buildx", "build", "--target", stage, "-f", "-", contextDir],
      {
        env: { ...process.env, BUILD_KIT: "1" },
        input: this.dockerfile,
        stdio: [/* stdin= */ "pipe", /* stdout= */ "inherit", /* stderr= */ "inherit"],
      }
    );
    if (ret.error) {
      throw new Error(`Failed to execute stage ${stage}`, ret.error);
    }
  }

  install(): void {
    this.buildStage(DOCKER_STAGE_INSTALL, ".");
  }

  build(): void {
    this.buildStage(DOCKER_STAGE_BUILD, ".");
  }
}
