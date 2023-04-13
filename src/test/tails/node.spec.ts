import { expect } from "chai";
import { MockFileSystem, detect } from "../../tails/engine";

describe("node", () => {
  it("detects bare node", async () => {
    const fs = new MockFileSystem({
      "package.json": JSON.stringify({
        scripts: {
          start: "foo",
        },
      }),
    });
    const strategy = await detect(fs);
    expect(strategy).is.not.null;
    expect(strategy?.runtimeName).equals("nodejs");
    expect(strategy?.frameworkName).equals("nodejs");
    expect(strategy?.packageManagerInstallCommand()).is.null;
    expect(strategy?.installCommand()).equals("npm install");
    expect(strategy?.buildCommand()).is.null;
    expect(strategy?.devCommand()).equals("npm run start");
  });

  it("detects bare (global) typescript and yarn", async () => {
    const fs = new MockFileSystem({
      "package.json": JSON.stringify({
        scripts: {
          start: "foo",
        },
      }),
      "tsconfig.json": "",
      "yarn.lock": "",
    });
    const strategy = await detect(fs);
    expect(strategy).is.not.null;
    expect(strategy?.runtimeName).equals("nodejs");
    expect(strategy?.frameworkName).equals("nodejs");
    expect(strategy?.packageManagerInstallCommand()).equals("npm install --global yarn typescript");
    expect(strategy?.installCommand()).equals("yarn install");
    expect(strategy?.buildCommand()).equals("tsc");
    expect(strategy?.devCommand()).equals("yarn run start");
  });

  it("detects typescript, vite, and svelte", async () => {
    const fs = new MockFileSystem({
      "package.json": JSON.stringify({
        devDependencies: {
          typescript: "latest",
        },
        dependencies: {
          vite: "latest",
          svelte: "latest",
        },
      }),
      "tsconfig.json": "",
    });
    const strategy = await detect(fs);
    expect(strategy).is.not.null;
    expect(strategy?.runtimeName).equals("nodejs");
    expect(strategy?.frameworkName).equals("core:svelte-vite");
    expect(strategy?.packageManagerInstallCommand()).is.null;
    expect(strategy?.installCommand()).equals("npm install");
    expect(strategy?.buildCommand()).equals("./node_modules/.bin/tsc && vite build");
    expect(strategy?.devCommand()).equals("vite preview");
  });

  it("Handles embedded frameworks", async () => {
    const fs = new MockFileSystem({
      "package.json": JSON.stringify({
        dependencies: {
          astrojs: "latest",
          svelte: "latest",
          react: "latest",
          "react-dom": "latest",
        },
      }),
      "tsconfig.json": "",
      "yarn.lock": "",
      "astro.config.ts": "",
    });
    const strategy = await detect(fs);
    expect(strategy).is.not.null;
    expect(strategy?.runtimeName).equals("nodejs");
    expect(strategy?.frameworkName).equals("core:astro");
    expect(strategy?.packageManagerInstallCommand()).equals("npm install --global yarn typescript");
    expect(strategy?.installCommand()).equals("yarn install");
    expect(strategy?.buildCommand()).equals("tsc && astro build");
    expect(strategy?.devCommand()).equals("astro preview");
  });
});
