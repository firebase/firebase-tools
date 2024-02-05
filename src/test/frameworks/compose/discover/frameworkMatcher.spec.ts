import { MockFileSystem } from "./mockFileSystem";
import { expect } from "chai";
import {
  frameworkMatcher,
  removeEmbededFrameworks,
  filterFrameworksWithFiles,
  filterFrameworksWithDependencies,
} from "../../../../frameworks/compose/discover/frameworkMatcher";
import { frameworkSpecs } from "../../../../frameworks/compose/discover/frameworkSpec";
import { FrameworkSpec } from "../../../../frameworks/compose/discover/types";

describe("frameworkMatcher", () => {
  let fileSystem: MockFileSystem;
  const NODE_ID = "nodejs";

  before(() => {
    fileSystem = new MockFileSystem({
      "package.json": JSON.stringify({
        name: "expressapp",
        version: "1.0.0",
        scripts: {
          test: 'echo "Error: no test specified" && exit 1',
        },
        dependencies: {
          express: "^4.18.2",
        },
      }),
      "package-lock.json": "Unused: contents of package-lock file",
    });
  });

  describe("frameworkMatcher", () => {
    it("should return express FrameworkSpec after analysing express application", async () => {
      const expressDependency: Record<string, string> = {
        express: "^4.18.2",
      };
      const matchedFramework = await frameworkMatcher(
        NODE_ID,
        fileSystem,
        frameworkSpecs,
        expressDependency,
      );
      const expressFrameworkSpec: FrameworkSpec = {
        id: "express",
        runtime: "nodejs",
        webFrameworkId: "Express.js",
        requiredDependencies: [
          {
            name: "express",
          },
        ],
      };

      expect(matchedFramework).to.deep.equal(expressFrameworkSpec);
    });
  });

  describe("removeEmbededFrameworks", () => {
    it("should return frameworks after removing embeded frameworks", () => {
      const allFrameworks: FrameworkSpec[] = [
        {
          id: "express",
          runtime: "nodejs",
          requiredDependencies: [],
        },
        {
          id: "next",
          runtime: "nodejs",
          requiredDependencies: [],
          embedsFrameworks: ["react"],
        },
        {
          id: "react",
          runtime: "nodejs",
          requiredDependencies: [],
        },
      ];
      const actual = removeEmbededFrameworks(allFrameworks);
      const expected: FrameworkSpec[] = [
        {
          id: "express",
          runtime: "nodejs",
          requiredDependencies: [],
        },
        {
          id: "next",
          runtime: "nodejs",
          requiredDependencies: [],
          embedsFrameworks: ["react"],
        },
      ];

      expect(actual).to.have.deep.members(expected);
      expect(actual).to.have.length(2);
    });
  });

  describe("filterFrameworksWithFiles", () => {
    it("should return frameworks having all the required files", async () => {
      const allFrameworks: FrameworkSpec[] = [
        {
          id: "express",
          runtime: "nodejs",
          requiredDependencies: [],
          requiredFiles: [["package.json", "package-lock.json"]],
        },
        {
          id: "next",
          runtime: "nodejs",
          requiredDependencies: [],
          requiredFiles: [["next.config.js"], "next.config.ts"],
        },
      ];
      const actual = await filterFrameworksWithFiles(allFrameworks, fileSystem);
      const expected: FrameworkSpec[] = [
        {
          id: "express",
          runtime: "nodejs",
          requiredDependencies: [],
          requiredFiles: [["package.json", "package-lock.json"]],
        },
      ];

      expect(actual).to.have.deep.members(expected);
      expect(actual).to.have.length(1);
    });
  });

  describe("filterFrameworksWithDependencies", () => {
    it("should return frameworks having required dependencies with in the project dependencies", () => {
      const allFrameworks: FrameworkSpec[] = [
        {
          id: "express",
          runtime: "nodejs",
          requiredDependencies: [
            {
              name: "express",
            },
          ],
        },
        {
          id: "next",
          runtime: "nodejs",
          requiredDependencies: [
            {
              name: "next",
            },
          ],
        },
      ];
      const projectDependencies: Record<string, string> = {
        express: "^4.18.2",
      };
      const actual = filterFrameworksWithDependencies(allFrameworks, projectDependencies);
      const expected: FrameworkSpec[] = [
        {
          id: "express",
          runtime: "nodejs",
          requiredDependencies: [
            {
              name: "express",
            },
          ],
        },
      ];

      expect(actual).to.have.deep.members(expected);
      expect(actual).to.have.length(1);
    });
  });
});
