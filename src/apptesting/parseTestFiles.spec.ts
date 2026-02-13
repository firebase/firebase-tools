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
          tests: [{ displayName: "my test", steps: [{ goal: "click a button" }] }],
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
          tests: [{ displayName: "my test", steps: [{ goal: "click a button" }] }],
        }),
      );
      writeFile("my_test2.yaml", "foo");
      const tests = await parseTestFiles(tempdir.name, "http://www.foo.com");
      expect(tests).to.eql([
        {
          testCase: {
            id: undefined,
            prerequisiteTestCaseId: undefined,
            displayName: "my test",
            startUri: "http://www.foo.com/mypage",
            steps: [
              {
                goal: "click a button",
              },
            ],
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
            id: undefined,
            prerequisiteTestCaseId: undefined,
            displayName: "Smoke test",
            startUri: "http://www.foo.com",
            steps: [
              {
                goal: "View the provided application",
                hint: "No additional actions should be necessary",
                finalScreenAssertion: "The application should load with no obvious errors",
              },
            ],
          },
          testExecution: [{ config: { browser: Browser.CHROME } }],
        },
      ]);
    });

    it("parses multiple test case files", async () => {
      writeFile(
        "my_test.yaml",
        stringify({ tests: [{ displayName: "my test", steps: [{ goal: "click a button" }] }] }),
      );
      writeFile(
        "my_test2.yaml",
        stringify({
          defaultConfig: { browsers: ["CHROME"] },
          tests: [
            { displayName: "my second test", steps: [{ goal: "click a button" }] },
            {
              displayName: "my third test",
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
            id: undefined,
            prerequisiteTestCaseId: undefined,
            displayName: "my test",
            startUri: "https://www.foo.com",
            steps: [
              {
                goal: "click a button",
              },
            ],
          },
          testExecution: [{ config: { browser: "CHROME" } }],
        },
        {
          testCase: {
            id: undefined,
            prerequisiteTestCaseId: undefined,
            displayName: "my second test",
            startUri: "https://www.foo.com",
            steps: [
              {
                goal: "click a button",
              },
            ],
          },
          testExecution: [{ config: { browser: "CHROME" } }],
        },

        {
          testCase: {
            id: undefined,
            prerequisiteTestCaseId: undefined,
            displayName: "my third test",
            startUri: "https://www.foo.com/mypage",
            steps: [
              {
                goal: "type something",
              },
            ],
          },
          testExecution: [{ config: { browser: "firefox" } }],
        },
      ]);
    });
  });

  describe("filtering", () => {
    function createBasicTest(displayNames: string[]) {
      return stringify({
        tests: displayNames.map((displayName) => ({
          displayName,
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

  describe("prerequisite test cases", () => {
    it("merges the steps from the prerequisite test case", async () => {
      writeFile(
        "my_test.yaml",
        stringify({
          tests: [
            {
              id: "my-first-test",
              displayName: "my first test",
              steps: [{ goal: "do something first" }],
            },
            {
              displayName: "my second test",
              prerequisiteTestCaseId: "my-first-test",
              steps: [{ goal: "do something second" }],
            },
          ],
        }),
      );

      const tests = await parseTestFiles(tempdir.name, "https://www.foo.com");
      expect(tests.length).to.equal(2);
      const secondTest = tests[1];
      expect(secondTest.testCase.steps).to.eql([
        { goal: "do something first" },
        { goal: "do something second" },
      ]);
    });

    it("throws an error for a non-existent prerequisite test case", async () => {
      writeFile(
        "my_test.yaml",
        stringify({
          tests: [
            {
              displayName: "my second test",
              prerequisiteTestCaseId: "my-first-test",
              steps: [{ goal: "do something second" }],
            },
          ],
        }),
      );

      await expect(parseTestFiles(tempdir.name, "https://www.foo.com")).to.be.rejectedWith(
        FirebaseError,
        "Invalid prerequisiteTestCaseId. There is no test case with id my-first-test",
      );
    });

    it("handles an undefined prerequisite test case id", async () => {
      writeFile(
        "my_test.yaml",
        stringify({
          tests: [
            {
              displayName: "my test",
              steps: [{ goal: "do something" }],
            },
          ],
        }),
      );

      const tests = await parseTestFiles(tempdir.name, "https://www.foo.com");
      expect(tests.length).to.equal(1);
      expect(tests[0].testCase.steps).to.eql([{ goal: "do something" }]);
    });

    it("works correctly with filtering", async () => {
      writeFile(
        "my_test.yaml",
        stringify({
          tests: [
            {
              id: "my-first-test",
              displayName: "my first test",
              steps: [{ goal: "do something first" }],
            },
            {
              displayName: "my second test",
              prerequisiteTestCaseId: "my-first-test",
              steps: [{ goal: "do something second" }],
            },
          ],
        }),
      );

      const tests = await parseTestFiles(
        tempdir.name,
        "https://www.foo.com",
        /* filePattern= */ "",
        /* namePattern= */ "my second test",
      );
      expect(tests.length).to.equal(1);
      const secondTest = tests[0];
      expect(secondTest.testCase.steps).to.eql([
        { goal: "do something first" },
        { goal: "do something second" },
      ]);
    });

    it("works correctly with multiple levels of prerequisites", async () => {
      writeFile(
        "my_test.yaml",
        stringify({
          tests: [
            {
              id: "my-first-test",
              displayName: "my first test",
              steps: [{ goal: "do something first" }],
            },
            {
              id: "my-second-test",
              displayName: "my second test",
              prerequisiteTestCaseId: "my-first-test",
              steps: [{ goal: "do something second" }],
            },
            {
              displayName: "my third test",
              prerequisiteTestCaseId: "my-second-test",
              steps: [{ goal: "do something third" }],
            },
          ],
        }),
      );

      const tests = await parseTestFiles(tempdir.name, "https://www.foo.com");
      expect(tests.length).to.equal(3);
      const thirdTest = tests[2];
      expect(thirdTest.testCase.steps).to.eql([
        { goal: "do something first" },
        { goal: "do something second" },
        { goal: "do something third" },
      ]);
    });

    it("throws error if there is a circular depedency", async () => {
      writeFile(
        "my_test.yaml",
        stringify({
          tests: [
            {
              id: "my-first-test",
              displayName: "my first test",
              prerequisiteTestCaseId: "my-second-test",
              steps: [{ goal: "do something first" }],
            },
            {
              id: "my-second-test",
              displayName: "my second test",
              prerequisiteTestCaseId: "my-first-test",
              steps: [{ goal: "do something second" }],
            },
          ],
        }),
      );

      await expect(parseTestFiles(tempdir.name, "https://www.foo.com")).to.be.rejectedWith(
        FirebaseError,
        "Detected a cycle in prerequisite test cases.",
      );
    });
  });
});
