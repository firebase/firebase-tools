import { expect } from "chai";
import { readYAMLFile } from "../../finder/find";

describe("readYAMLFile", () => {
  const filePath = "frameworkSpecTest.yml";
  it("should read the contents of a YAML file", async () => {
    const expectedData = {
      id: "express",
      runtime: "nodejs",
      webFrameworkId: "Express.js",
      requiredDependencies: [{ name: "express" }],
    };
    console.log("+++++++++HIIIIII++++++++++");
    const actualData = await readYAMLFile(filePath);

    expect(actualData).to.equal(expectedData);
  });

  it("should throw an error if the file does not exist", () => {
    const noFileExists = "noFile.yaml";
    expect(async () => {
      await readYAMLFile(noFileExists);
    }).throw("No such file or directory exists.");
  });
});
