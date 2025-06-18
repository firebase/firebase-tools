import * as tmp from "tmp";
import { expect } from "chai";
import { rmSync } from "node:fs";
import { parseTestFiles } from "./parseTestFiles";
import { join } from "node:path";
import * as fs from "fs-extra";
import { readTemplateSync } from "../templates";
import { stringify } from "yaml";

describe("parseTestFiles", () => {
  let tempdir: tmp.DirResult;

  beforeEach(() => {
    tempdir = tmp.dirSync();
  });

  afterEach(() => {
    rmSync(tempdir.name, { recursive: true });
  });

  function writeFile(filename: string, content: string) {
    const file = join(tempdir.name, filename);
    fs.writeFileSync(file, content);
  }

  describe("parsing", () => {
    it("ignores invalid files", () => {
      writeFile(
        "my_test.yaml",
        stringify({ tests: [{ testName: "my test", steps: [{ goal: "click a button" }] }] }),
      );
      writeFile("my_test2.yaml", "foo");
      const testDefs = parseTestFiles(tempdir.name);
      expect(testDefs).to.eql([
        {
          id: `${tempdir.name}/my_test.yaml#my test`,
          steps: [
            {
              goal: "click a button",
              hint: undefined,
              successCriteria: undefined,
            },
          ],
          testConfig: {
            browsers: undefined,
          },
          testName: "my test",
        },
      ]);
    });

    it("parses the sample test case file", () => {
      writeFile("smoke_test.yaml", readTemplateSync("init/apptesting/smoke_test.yaml"));
      const testDefs = parseTestFiles(tempdir.name);
      expect(testDefs).to.eql([
        {
          id: `${tempdir.name}/smoke_test.yaml#Smoke test`,
          steps: [
            {
              goal: "View the provided application",
              hint: "No additional actions should be necessary",
              successCriteria: "The application should load with no obvious errors",
            },
          ],
          testConfig: {
            browsers: undefined,
          },
          testName: "Smoke test",
        },
      ]);
    });

    it("parses multiple test case files", () => {
      writeFile(
        "my_test.yaml",
        stringify({ tests: [{ testName: "my test", steps: [{ goal: "click a button" }] }] }),
      );
      writeFile(
        "my_test2.yaml",
        stringify({
          defaultConfig: { browsers: ["chrome"] },
          tests: [
            { testName: "my second test", steps: [{ goal: "click a button" }] },
            {
              testName: "my third test",
              testConfig: { browsers: ["firefox"] },
              steps: [{ goal: "type something" }],
            },
          ],
        }),
      );

      const testDefs = parseTestFiles(tempdir.name);
      expect(testDefs).to.eql([
        {
          id: `${tempdir.name}/my_test.yaml#my test`,
          steps: [
            {
              goal: "click a button",
              hint: undefined,
              successCriteria: undefined,
            },
          ],
          testConfig: {
            browsers: undefined,
          },
          testName: "my test",
        },
        {
          id: `${tempdir.name}/my_test2.yaml#my second test`,
          steps: [
            {
              goal: "click a button",
              hint: undefined,
              successCriteria: undefined,
            },
          ],
          testConfig: {
            browsers: ["chrome"],
          },
          testName: "my second test",
        },
        {
          id: `${tempdir.name}/my_test2.yaml#my third test`,
          steps: [
            {
              goal: "type something",
              hint: undefined,
              successCriteria: undefined,
            },
          ],
          testConfig: {
            browsers: ["firefox"],
          },
          testName: "my third test",
        },
      ]);
    });
  });

  describe("filtering", () => {
    function createBasicTest(testNames: string[]) {
      return stringify({
        tests: testNames.map((testName) => ({
          testName,
          steps: [{ goal: "do something" }],
        })),
      });
    }

    function getTestCaseNames(filenameFilter = "", testCaseFilter = "") {
      return parseTestFiles(tempdir.name, filenameFilter, testCaseFilter).map((t) => t.testName);
    }

    it("returns an empty list if no match", () => {
      writeFile("aaa", createBasicTest(["axx", "ayy", "azz"]));
      writeFile("bbb", createBasicTest(["bxx", "byy", "bzz"]));
      expect(getTestCaseNames("yyy")).to.eql([]);
    });

    it("filters on filename", () => {
      writeFile("aaa", createBasicTest(["axx", "ayy", "azz"]));
      writeFile("bbb", createBasicTest(["bxx", "byy", "bzz"]));
      expect(getTestCaseNames("aaa")).to.eql(["axx", "ayy", "azz"]);
    });

    it("filters on test case name", () => {
      writeFile("aaa", createBasicTest(["axx", "ayy", "azz"]));
      writeFile("bbb", createBasicTest(["bxx", "byy", "bzz"]));
      expect(getTestCaseNames("", ".xx")).to.eql(["axx", "bxx"]);
    });

    it("filters on filename and test case name", () => {
      writeFile("aaa", createBasicTest(["axx", "ayy", "azz"]));
      writeFile("bbb", createBasicTest(["bxx", "byy", "bzz"]));
      expect(getTestCaseNames("a$", "xx")).to.eql(["axx"]);
    });
  });
});
