import { firstOf } from "../functional";
import * as engine from "./engine";

export class PythonCodebase implements engine.Codebase {
  readonly runtimeName = "python";
  readonly frameworkName: string;
  constructor(private entrypoint: string, private readonly frameworks: engine.Framework[]) {
    this.frameworkName = frameworks.length ? frameworks[0].name : "python";
  }

  packageManagerInstallCommand(): string | null {
    return "python -m ensurepip";
  }

  // Would a python app ever override these?
  installCommand(): string | null {
    return firstOf(this.frameworks, "installCommand") || "pip install -r requirements.txt";
  }

  buildCommand(): string | null {
    return firstOf(this.frameworks, "buildCommand") ?? null;
  }

  devCommand(): string | null {
    const override = firstOf(this.frameworks, "devCommand");
    if (override) {
      return override;
    }
    return `python ${this.entrypoint}`;
  }
}

export class PythonRuntime implements engine.Runtime {
  private frameworks: engine.Framework[] | null = null;
  loadFrameworks(): Promise<void> {
    // TODO: make data driven
    this.frameworks = [
      {
        name: "core:flask",
        parent: "python",
        dependencies: [{ name: "flask" }],
      },
      {
        name: "core:django",
        parent: "python",
        dependencies: [{ name: "django" }],
      },
    ];
    return Promise.resolve();
  }

  async detectCodebase(fs: engine.FileSystem): Promise<engine.Codebase | null> {
    const [requirements, hasMain, hasApp] = await Promise.all([
      engine.readOrNull(fs, "requirements.txt"),
      fs.exists("main.py"),
      fs.exists("app.py"),
    ] as const);
    const entrypoint = hasMain ? "main.py" : hasApp ? "app.py" : null;
    if (!requirements || !entrypoint) {
      return null;
    }
    // TODO: get a real parser per https://pip.pypa.io/en/stable/reference/requirements-file-format/
    // I don't know if we want to support all edge cases because this brings in networking.
    // Maybe we should fall back to some more expensive solution that involves executing processes
    // to inspect what is actually installed?
    if (!this.frameworks) {
      await this.loadFrameworks();
    }
    const dependencies = Object.fromEntries(requirements.split("\n").map((line) => [line, "head"]));
    const matcher = new engine.FrameworkMatcher("python", fs, this.frameworks!, dependencies);
    const matches = await matcher.match();
    return new PythonCodebase(entrypoint, matches);
  }
}
