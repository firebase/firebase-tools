import { expect } from "chai";
import * as engine from "../../tails/engine";

describe("python", () => {
  it("detects flask", async () => {
    const fs = new engine.MockFileSystem({
      "requirements.txt": "firebase\nflask",
      "main.py": "",
    });
    const codebase = await engine.detect(fs);
    expect(codebase).is.not.null;
    expect(codebase?.frameworkName).equals("core:flask");
    expect(codebase?.runtimeName).equals("python");
    expect(codebase?.packageManagerInstallCommand()).equals("python -m ensurepip");
    expect(codebase?.installCommand()).equals("pip install -r requirements.txt");
    expect(codebase?.buildCommand()).to.be.null;
    expect(codebase?.devCommand()).equals("python main.py");
  });

  it("detects django", async () => {
    const fs = new engine.MockFileSystem({
      "requirements.txt": "firebase\ndjango",
      "app.py": "",
    });
    const codebase = await engine.detect(fs);
    expect(codebase).is.not.null;
    expect(codebase?.frameworkName).equals("core:django");
    expect(codebase?.runtimeName).equals("python");
    expect(codebase?.packageManagerInstallCommand()).equals("python -m ensurepip");
    expect(codebase?.installCommand()).equals("pip install -r requirements.txt");
    expect(codebase?.buildCommand()).to.be.null;
    expect(codebase?.devCommand()).equals("python app.py");
  });

  it("detets python", async () => {
    const fs = new engine.MockFileSystem({
      "requirements.txt": "firebase",
      "main.py": "",
    });
    const codebase = await engine.detect(fs);
    expect(codebase).is.not.null;
    expect(codebase?.frameworkName).equals("python");
    expect(codebase?.runtimeName).equals("python");
    expect(codebase?.packageManagerInstallCommand()).equals("python -m ensurepip");
    expect(codebase?.installCommand()).equals("pip install -r requirements.txt");
    expect(codebase?.buildCommand()).to.be.null;
    expect(codebase?.devCommand()).equals("python main.py");
  });
});
