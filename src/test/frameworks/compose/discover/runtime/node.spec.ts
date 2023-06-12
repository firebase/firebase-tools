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
        node: ">=18.5.4",
      };
      const actualImage = nodeJSRuntime.getNodeImage(version);
      const expectedImage = "node:18-slim";

      expect(actualImage).to.deep.equal(expectedImage);
    });

    it("should return node Image", () => {
      const version: Record<string, string> = {
        node: "^18.0.2",
      };
      const actualImage = nodeJSRuntime.getNodeImage(version);
      const expectedImage = "node:18-slim";

      expect(actualImage).to.deep.equal(expectedImage);
    });

    it("should return latest node Image", () => {
      const version: Record<string, string> = {
        node: "18.8.2",
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
    it("should return direct and transitive dependencies", async () => {
      const fileSystem = new MockFileSystem({
        "package.json": JSON.stringify({
          dependencies: {
            express: "^4.18.2",
          },
          devDependencies: {
            nodemon: "^2.0.12",
            mocha: "^9.1.1",
          },
        }),
        "package-lock.json": JSON.stringify({
          packages: {
            "node_modules/express": {
              dependencies: {
                accepts: "~1.3.8",
                "array-flatten": "1.1.1",
              },
            },
            "node_modules/nodemon": {
              dependencies: {
                chokidar: "^3.5.2",
                debug: "^3.2.7",
              },
            },
            "node_modules/mocha": {
              dependencies: {
                "escape-string-regexp": "4.0.0",
                "find-up": "5.0.0",
              },
            },
          },
        }),
      });
      const packageJSON: PackageJSON = {
        dependencies: {
          express: "^4.18.2",
        },
        devDependencies: {
          nodemon: "^2.0.12",
          mocha: "^9.1.1",
        },
      };
      const actual = await nodeJSRuntime.getDependencies(fileSystem, packageJSON, "npm");
      const expected = {
        express: "^4.18.2",
        nodemon: "^2.0.12",
        mocha: "^9.1.1",
        accepts: "~1.3.8",
        "array-flatten": "1.1.1",
        chokidar: "^3.5.2",
        debug: "^3.2.7",
        "escape-string-regexp": "4.0.0",
        "find-up": "5.0.0",
      };

      expect(actual).to.deep.equal(expected);
    });
  });

  describe("detectedCommands", () => {
    it("should commands required to run the app.", () => {
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

      const actual = nodeJSRuntime.detectedCommands("npm", scripts, matchedFramework);
      const expected = {
        build: {
          cmd: "next build",
        },
        dev: {
          cmd: "next dev",
          env: { NODE_ENV: "dev" },
        },
        run: {
          cmd: "next start",
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
            node: ">=18.5.2",
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
        installCommand: "npm ci",
        detectedCommands: {
          build: {
            cmd: "next build",
          },
          dev: {
            cmd: "next dev",
            env: { NODE_ENV: "dev" },
          },
          run: {
            cmd: "next start",
            env: { NODE_ENV: "production" },
          },
        },
      };

      expect(actual).to.deep.equal(expected);
    });
  });
});
