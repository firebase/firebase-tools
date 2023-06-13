import { MockFileSystem } from "./mockFileSystem";
import { expect } from "chai";

describe("MockFileSystem", () => {
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

      expect(fileExists).to.be.true;
      expect(fileSystem.getExistsCache("package.json")).to.be.true;
    });

    it("should return false if file does not exist in the directory", async () => {
      const fileExists = await fileSystem.exists("nonexistent.txt");

      expect(fileExists).to.be.false;
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
      expect(fileSystem.getContentCache("package.json")).to.equal(expected);
    });
  });
});
