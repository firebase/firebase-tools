import { RepositoryFileSystem } from "../../../../frameworks/compose/discover/filesystem";
import { expect } from "chai";

describe("RepositoryFileSystem", () => {
  let fileSystem: RepositoryFileSystem;

  before(() => {
    fileSystem = new RepositoryFileSystem(
      "/Users/svnsairam/Documents/google3/firebase-tools/src/frameworks/compose/discover/nodetestapp/nodeapp"
    );
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

      expect(fileContent).to.equal(fileContent);
    });
  });
});
