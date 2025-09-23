import * as tmp from "tmp";
import { expect } from "chai";
import { rmSync } from "node:fs";
import { join } from "node:path";
import * as fs from "fs-extra";
import { stringify } from "yaml";
import { parseTestFiles } from "./parseTestFiles";
import { readTemplateSync } from "../templates";
import { Browser } from "./types";
import { FirebaseError } from "../error";

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
    it("throws an error for invalid targetUri", async () => {
      writeFile(
        "my_test.yaml",
        stringify({
          defaultConfig: { route: "/mypage" },
          tests: [{ testName: "my test", steps: [{ goal: "click a button" }] }],
        }),
      );
      await expect(parseTestFiles(tempdir.name, "foo.com")).to.be.rejectedWith(
        FirebaseError,
        "Invalid URL",
      );
    });

    it("ignores invalid files", async () => {
      writeFile(
        "my_test.yaml",
        stringify({
          defaultConfig: { route: "/mypage" },
          tests: [{ testName: "my test", steps: [{ goal: "click a button" }] }],
        }),
      );
      writeFile("my_test2.yaml", "foo");
      const tests = await parseTestFiles(tempdir.name, "http://www.foo.com");
      expect(tests).to.eql([
        {
          testCase: {
            displayName: "my test",
            startUri: "http://www.foo.com/mypage",
            instructions: {
              steps: [
                {
                  goal: "click a button",
                },
              ],
            },
          },
          testExecution: [{ config: { browser: Browser.CHROME } }],
        },
      ]);
    });

    it("parses the sample test case file", async () => {
      writeFile("smoke_test.yaml", readTemplateSync("init/apptesting/smoke_test.yaml"));
      const tests = await parseTestFiles(tempdir.name, "http://www.foo.com");
      expect(tests).to.eql([
        {
          testCase: {
            displayName: "Smoke test",
            startUri: "http://www.foo.com",
            instructions: {
              steps: [
                {
                  goal: "View the provided application",
                  hint: "No additional actions should be necessary",
                  successCriteria: "The application should load with no obvious errors",
                },
              ],
            },
          },
          testExecution: [{ config: { browser: Browser.CHROME } }],
        },
      ]);
    });

    it("parses multiple test case files", async () => {
      writeFile(
        "my_test.yaml",
        stringify({ tests: [{ testName: "my test", steps: [{ goal: "click a button" }] }] }),
      );
      writeFile(
        "my_test2.yaml",
        stringify({
          defaultConfig: { browsers: ["CHROME"] },
          tests: [
            { testName: "my second test", steps: [{ goal: "click a button" }] },
            {
              testName: "my third test",
              testConfig: { browsers: ["firefox"], route: "/mypage" },
              steps: [{ goal: "type something" }],
            },
          ],
        }),
      );

      const tests = await parseTestFiles(tempdir.name, "https://www.foo.com");
      expect(tests).to.eql([
        {
          testCase: {
            displayName: "my test",
            startUri: "https://www.foo.com",
            instructions: {
              steps: [
                {
                  goal: "click a button",
                },
              ],
            },
          },
          testExecution: [{ config: { browser: "CHROME" } }],
        },
        {
          testCase: {
            displayName: "my second test",
            startUri: "https://www.foo.com",
            instructions: {
              steps: [
                {
                  goal: "click a button",
                },
              ],
            },
          },
          testExecution: [{ config: { browser: "CHROME" } }],
        },

        {
          testCase: {
            displayName: "my third test",
            startUri: "https://www.foo.com/mypage",
            instructions: {
              steps: [
                {
                  goal: "type something",
                },
              ],
            },
          },
          testExecution: [{ config: { browser: "firefox" } }],
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

    async function getTestCaseNames(filenameFilter = "", testCaseFilter = "") {
      const tests = await parseTestFiles(
        tempdir.name,
        "https://www.foo.com",
        filenameFilter,
        testCaseFilter,
      );
      return tests.map((t) => t.testCase.displayName);
    }

    it("returns an empty list if no match", async () => {
      writeFile("aaa", createBasicTest(["axx", "ayy", "azz"]));
      writeFile("bbb", createBasicTest(["bxx", "byy", "bzz"]));
      expect(await getTestCaseNames("yyy")).to.eql([]);
    });

    it("filters on filename", async () => {
      writeFile("aaa", createBasicTest(["axx", "ayy", "azz"]));
      writeFile("bbb", createBasicTest(["bxx", "byy", "bzz"]));
      expect(await getTestCaseNames("aaa")).to.eql(["axx", "ayy", "azz"]);
    });

    it("filters on test case name", async () => {
      writeFile("aaa", createBasicTest(["axx", "ayy", "azz"]));
      writeFile("bbb", createBasicTest(["bxx", "byy", "bzz"]));
      expect(await getTestCaseNames("", ".xx")).to.eql(["axx", "bxx"]);
    });

    it("filters on filename and test case name", async () => {
      writeFile("aaa", createBasicTest(["axx", "ayy", "azz"]));
      writeFile("bbb", createBasicTest(["bxx", "byy", "bzz"]));
      expect(await getTestCaseNames("a$", "xx")).to.eql(["axx"]);
    });
  });
});
