import { MockFileSystem } from "../mockFileSystem";
import { expect } from "chai";
import {
  NodejsRuntime,
  PackageJSON,
} from "../../../../../frameworks/compose/discover/runtime/node";
import { FrameworkSpec } from "../../../../../frameworks/compose/discover/types";

describe("NodejsRuntime", () => {
  let nodeJSRuntime: NodejsRuntime;

  before(() => {
    nodeJSRuntime = new NodejsRuntime();
  });

  describe("getNodeImage", () => {
    it("should return a valid node Image", () => {
      const version: Record<string, string> = {
        node: "18",
      };
      const actualImage = nodeJSRuntime.getNodeImage(version);
      const expectedImage = "node:18-slim";

      expect(actualImage).to.deep.equal(expectedImage);
    });
  });

  describe("getPackageManager", () => {
    it("should return yarn package manager", async () => {
      const fileSystem = new MockFileSystem({
        "yarn.lock": "It is test file",
      });
      const actual = await nodeJSRuntime.getPackageManager(fileSystem);
      const expected = "yarn";

      expect(actual).to.equal(expected);
    });
  });

  describe("getDependencies", () => {
    it("should return direct and transitive dependencies", () => {
      const packageJSON: PackageJSON = {
        dependencies: {
          express: "^4.18.2",
        },
        devDependencies: {
          nodemon: "^2.0.12",
          mocha: "^9.1.1",
        },
      };
      const actual = nodeJSRuntime.getDependencies(packageJSON);
      const expected = {
        express: "^4.18.2",
        nodemon: "^2.0.12",
        mocha: "^9.1.1",
      };

      expect(actual).to.deep.equal(expected);
    });
  });

  describe("detectedCommands", () => {
    it("should prepend npx to framework commands", () => {
      const matchedFramework: FrameworkSpec = {
        id: "next",
        runtime: "nodejs",
        requiredDependencies: [],
        commands: {
          dev: {
            cmd: "next dev",
            env: { NODE_ENV: "dev" },
          },
        },
      };
      const scripts = {
        build: "next build",
        start: "next start",
      };

      const actual = nodeJSRuntime.detectedCommands("yarn", scripts, matchedFramework);
      const expected = {
        build: {
          cmd: "yarn run build",
        },
        dev: {
          cmd: "npx next dev",
          env: { NODE_ENV: "dev" },
        },
        run: {
          cmd: "yarn run start",
          env: { NODE_ENV: "production" },
        },
      };

      expect(actual).to.deep.equal(expected);
    });

    it("should prefer scripts over framework commands", () => {
      const matchedFramework: FrameworkSpec = {
        id: "next",
        runtime: "nodejs",
        requiredDependencies: [],
        commands: {
          build: {
            cmd: "next build testing",
          },
          run: {
            cmd: "next start testing",
            env: { NODE_ENV: "production" },
          },
          dev: {
            cmd: "next dev",
            env: { NODE_ENV: "dev" },
          },
        },
      };
      const scripts = {
        build: "next build",
        start: "next start",
      };

      const actual = nodeJSRuntime.detectedCommands("yarn", scripts, matchedFramework);
      const expected = {
        build: {
          cmd: "yarn run build",
        },
        dev: {
          cmd: "npx next dev",
          env: { NODE_ENV: "dev" },
        },
        run: {
          cmd: "yarn run start",
          env: { NODE_ENV: "production" },
        },
      };

      expect(actual).to.deep.equal(expected);
    });
  });

  describe("analyseCodebase", () => {
    it("should return runtime specs", async () => {
      const fileSystem = new MockFileSystem({
        "next.config.js": "For testing",
        "next.config.ts": "For testing",
        "package.json": JSON.stringify({
          scripts: {
            build: "next build",
            start: "next start",
          },
          dependencies: {
            next: "13.4.5",
            react: "18.2.0",
          },
          engines: {
            node: "18",
          },
        }),
        "package-lock.json": JSON.stringify({
          packages: {
            "node_modules/next": {
              dependencies: {
                accepts: "~1.3.8",
                "array-flatten": "1.1.1",
              },
            },
            "node_modules/react": {
              dependencies: {
                chokidar: "^3.5.2",
                debug: "^3.2.7",
              },
            },
          },
        }),
      });

      const allFrameworks: FrameworkSpec[] = [
        {
          id: "express",
          runtime: "nodejs",
          requiredDependencies: [{ name: "express" }],
        },
        {
          id: "next",
          runtime: "nodejs",
          requiredDependencies: [{ name: "next" }],
          requiredFiles: [["next.config.js"], "next.config.ts"],
          embedsFrameworks: ["react"],
          commands: {
            dev: {
              cmd: "next dev",
              env: { NODE_ENV: "dev" },
            },
          },
        },
      ];

      const actual = await nodeJSRuntime.analyseCodebase(fileSystem, allFrameworks);
      const expected = {
        id: "nodejs",
        baseImage: "node:18-slim",
        packageManagerInstallCommand: undefined,
        installCommand: "npm install",
        detectedCommands: {
          build: {
            cmd: "npm run build",
          },
          dev: {
            cmd: "npx next dev",
            env: { NODE_ENV: "dev" },
          },
          run: {
            cmd: "npm run start",
            env: { NODE_ENV: "production" },
          },
        },
      };

      expect(actual).to.deep.equal(expected);
    });
  });
});
