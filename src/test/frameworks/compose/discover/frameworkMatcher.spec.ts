import { RepositoryFileSystem } from "../../../../frameworks/compose/discover/filesystem";
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
  let fileSystem: RepositoryFileSystem;
  const NODE_ID = "nodejs";

  before(() => {
    fileSystem = new RepositoryFileSystem("./src/frameworks/compose/discover/testapps/expressApp");
  });

  describe("frameworkMatcher", () => {
    it("should return express FrameworkSpec after analysing express application", () => {
      const expressDependency: Record<string, string> = {
        express: "^4.18.2",
      };
      const matchedFramework = frameworkMatcher(
        NODE_ID,
        fileSystem,
        frameworkSpecs,
        expressDependency
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

      expect(matchedFramework).to.equal(expressFrameworkSpec);
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
    });
  });

  describe("filterFrameworksWithFiles", () => {
    it("should return frameworks having all the required files", () => {
      const allFrameworks: FrameworkSpec[] = [
        {
          id: "express",
          runtime: "nodejs",
          requiredDependencies: [],
          requiredFiles: ["package.json", "package-lock.json"],
        },
        {
          id: "next",
          runtime: "nodejs",
          requiredDependencies: [],
          requiredFiles: ["next.config.js", "next.config.ts"],
        },
      ];
      const actual = filterFrameworksWithFiles(allFrameworks, fileSystem);
      const expected: FrameworkSpec[] = [
        {
          id: "express",
          runtime: "nodejs",
          requiredDependencies: [],
          requiredFiles: ["package.json", "package-lock.json"],
        },
      ];

      expect(actual).to.have.deep.members(expected);
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
    });
  });
});
