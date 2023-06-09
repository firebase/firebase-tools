import { MockFileSystem } from "./mockFileSystem";
import { expect } from "chai";

describe("RepositoryFileSystem", () => {
  let fileSystem: MockFileSystem;

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
    });
  });

  describe("exists", () => {
    it("should return true if file exists in the directory ", async () => {
      const fileExists = await fileSystem.exists("package.json");

      expect(fileExists).to.equal(true);
    });

    it("should return false if file does not exist in the directory", async () => {
      const fileExists = await fileSystem.exists("nonexistent.txt");

      expect(fileExists).to.equal(false);
    });
  });

  describe("read", () => {
    it("should read and return the contents of the file", async () => {
      const fileContent = await fileSystem.read("package.json");

      const expected = JSON.stringify({
        name: "expressapp",
        version: "1.0.0",
        scripts: {
          test: 'echo "Error: no test specified" && exit 1',
        },
        dependencies: {
          express: "^4.18.2",
        },
      });

      expect(fileContent).to.equal(expected);
    });
  });
});
