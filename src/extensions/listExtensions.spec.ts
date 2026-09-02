import { stripVTControlCharacters } from "util";
import { expect } from "chai";
import * as sinon from "sinon";

import * as experiments from "../experiments";
import * as extensionsApi from "./extensionsApi";
import * as replacementRegistry from "./replacementRegistry";
import { listExtensions } from "./listExtensions";
import { logger } from "../logger";

const MOCK_INSTANCES = [
  {
    name: "projects/my-test-proj/instances/image-resizer",
    createTime: "2019-05-19T00:20:10.416947Z",
    updateTime: "2019-05-19T00:20:10.416947Z",
    state: "ACTIVE",
    config: {
      extensionRef: "firebase/storage-resize-images",
      name: "projects/my-test-proj/instances/image-resizer/configurations/95355951-397f-4821-a5c2-9c9788b2cc63",
      createTime: "2019-05-19T00:20:10.416947Z",
      params: {
        IMG_BUCKET: "my-test-proj.firebasestorage.app",
        IMG_SIZES: "200x200,400x400",
        DELETE_ORIGINAL_FILE: "false",
      },
      systemParams: {
        "firebaseextensions.v1beta.function/location": "us-central1",
      },
      source: {
        state: "ACTIVE",
        spec: {
          version: "0.1.0",
          author: {
            authorName: "Firebase",
            url: "https://firebase.google.com",
          },
        },
      },
    },
  },
  {
    name: "projects/my-test-proj/instances/image-resizer-1",
    createTime: "2019-06-19T00:20:10.416947Z",
    updateTime: "2019-06-19T00:21:06.722782Z",
    state: "ACTIVE",
    config: {
      extensionRef: "firebase/image-resizer",
      name: "projects/my-test-proj/instances/image-resizer-1/configurations/5b1fb749-764d-4bd1-af60-bb7f22d27860",
      createTime: "2019-06-19T00:21:06.722782Z",
      params: {
        IMG_BUCKET: "my-test-proj.firebasestorage.app",
        IMG_SIZES: "300x300",
        DELETE_ORIGINAL_FILE: "true",
      },
      systemParams: {
        "firebaseextensions.v1beta.function/location": "us-central1",
      },
      source: {
        spec: {
          version: "0.1.0",
        },
      },
    },
  },
];

// Locates the table log call and strips ANSI styling so row parsing
// works consistently in both TTY and non-TTY test runners.
function findTableOutput(stub: sinon.SinonStub): string {
  const call = stub.args.find(
    (args) => typeof args[0] === "string" && args[0].includes("Extension"),
  );
  expect(call).to.not.be.undefined;
  return typeof call?.[0] === "string" ? stripVTControlCharacters(call[0]) : "";
}

const PROJECT_ID = "my-test-proj";

describe("listExtensions", () => {
  let listInstancesStub: sinon.SinonStub;
  let getReplacementsRegistryStub: sinon.SinonStub;

  beforeEach(() => {
    listInstancesStub = sinon.stub(extensionsApi, "listInstances");
    getReplacementsRegistryStub = sinon.stub(replacementRegistry, "getReplacementsRegistry");
    getReplacementsRegistryStub.resolves({
      replacements: {
        "firebase/storage-resize-images": {
          status: "REPLACEMENT_AVAILABLE",
          npmPackage: "@firebase-function-kits/storage-resize-images",
          extensionRepositoryUrl:
            "https://github.com/firebase/extensions/tree/kits/storage-resize-images/README.md",
        },
      },
    });
  });

  afterEach(() => {
    experiments.setEnabled("extMigrationFeatures", false);
    sinon.restore();
  });

  it("should return an empty array if no extensions have been installed", async () => {
    listInstancesStub.returns(Promise.resolve([]));

    const result = await listExtensions(PROJECT_ID);

    expect(result).to.eql([]);
  });

  describe("when extMigrationFeatures experiment is disabled (default)", () => {
    beforeEach(() => {
      experiments.setEnabled("extMigrationFeatures", false);
    });

    it("should return extension instances without replacementKit and without fetching registry", async () => {
      listInstancesStub.returns(Promise.resolve(MOCK_INSTANCES));

      const result = await listExtensions(PROJECT_ID);

      expect(getReplacementsRegistryStub.called).to.be.false;
      expect(result[0]).to.not.have.property("replacementKit");
      expect(result[1]).to.not.have.property("replacementKit");
    });

    it("should render 6-column tabular output without Replacement Kit column", async () => {
      listInstancesStub.returns(Promise.resolve(MOCK_INSTANCES));
      const loggerInfoStub = sinon.stub(logger, "info");

      await listExtensions(PROJECT_ID);

      expect(loggerInfoStub.called).to.be.true;
      const tableString = findTableOutput(loggerInfoStub);

      const rows = tableString
        .split("\n")
        .filter((line: string) => line.trim().startsWith("│"))
        .map((line: string) =>
          line
            .split("│")
            .slice(1, -1)
            .map((cell: string) => cell.trim()),
        );

      expect(rows[0]).to.have.lengthOf(6);
      expect(tableString).to.not.include("Replacement Kit");
    });
  });

  describe("when extMigrationFeatures experiment is enabled", () => {
    beforeEach(() => {
      experiments.setEnabled("extMigrationFeatures", true);
    });

    it("should return a sorted array of extension instances with replacementKit info", async () => {
      listInstancesStub.returns(Promise.resolve(MOCK_INSTANCES));

      const result = await listExtensions(PROJECT_ID);

      expect(getReplacementsRegistryStub.calledOnce).to.be.true;
      const expected = [
        {
          extension: "firebase/image-resizer",
          instanceId: "image-resizer-1",
          publisher: "firebase",
          state: "ACTIVE",
          updateTime: "2019-06-19 00:21:06",
          version: "0.1.0",
          params: {
            IMG_BUCKET: "my-test-proj.firebasestorage.app",
            IMG_SIZES: "300x300",
            DELETE_ORIGINAL_FILE: "true",
          },
          systemParams: {
            "firebaseextensions.v1beta.function/location": "us-central1",
          },
        },
        {
          extension: "firebase/storage-resize-images",
          instanceId: "image-resizer",
          publisher: "firebase",
          state: "ACTIVE",
          updateTime: "2019-05-19 00:20:10",
          version: "0.1.0",
          replacementKit: "@firebase-function-kits/storage-resize-images",
          params: {
            IMG_BUCKET: "my-test-proj.firebasestorage.app",
            IMG_SIZES: "200x200,400x400",
            DELETE_ORIGINAL_FILE: "false",
          },
          systemParams: {
            "firebaseextensions.v1beta.function/location": "us-central1",
          },
        },
      ];
      expect(result).to.eql(expected);
      // Explicitly verify unmapped extensions omit the replacementKit field completely
      expect(result[0]).to.not.have.property("replacementKit");
      expect(result[1].replacementKit).to.equal("@firebase-function-kits/storage-resize-images");
    });

    it("should render 7-column tabular output including Replacement Kit column", async () => {
      listInstancesStub.returns(Promise.resolve(MOCK_INSTANCES));
      const loggerInfoStub = sinon.stub(logger, "info");

      await listExtensions(PROJECT_ID);

      expect(loggerInfoStub.called).to.be.true;
      const tableString = findTableOutput(loggerInfoStub);

      // Extract each row between the '│' boundaries
      const rows = tableString
        .split("\n")
        .filter((line: string) => line.trim().startsWith("│"))
        .map((line: string) =>
          line
            .split("│")
            .slice(1, -1)
            .map((cell: string) => cell.trim()),
        );

      expect(rows[0]).to.have.lengthOf(7);
      // 1. Verify the 7th column header is exactly "Replacement Kit"
      expect(rows[0][6]).to.equal("Replacement Kit");

      // 2. Verify the unmapped extension row has an empty blank cell in the 7th column
      expect(rows[1][0]).to.equal("firebase/image-resizer");
      expect(rows[1][6]).to.equal("");

      // 3. Verify the mapped extension row has the replacement kit in the 7th column
      expect(rows[2][0]).to.equal("firebase/storage-resize-images");
      expect(rows[2][6]).to.include("@firebase-function-kits/storage-resize-images");
    });
  });
});
