import { RepositoryFileSystem } from "../../../../frameworks/compose/discover/filesystem";
import { expect } from "chai";

describe("RepositoryFileSystem", () => {
  let fileSystem: RepositoryFileSystem;

  before(() => {
    fileSystem = new RepositoryFileSystem("./src/frameworks/compose/discover/testapps/expressApp");
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

      const expected = {
        name: "expressapp",
        version: "1.0.0",
        description: "",
        main: "index.js",
        scripts: {
          test: 'echo "Error: no test specified" && exit 1',
        },
        keywords: [],
        author: "",
        license: "ISC",
        dependencies: {
          express: "^4.18.2",
        },
      };

      expect(JSON.parse(fileContent)).to.deep.equal(expected);
    });
  });
});
