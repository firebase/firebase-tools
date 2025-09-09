import { expect } from "chai";
import * as sinon from "sinon";
import { get_documents } from "./get_documents";
import * as gcpFirestore from "../../../gcp/firestore";
import { toContent } from "../../util";

const MOCK_DOC = {
  name: `projects/test-project/databases/(default)/documents/users/test-user`,
  fields: {
    first: { stringValue: "Ada" },
    last: { stringValue: "Lovelace" },
    born: { integerValue: "1815" },
    address: {
      mapValue: {
        fields: {
          city: { stringValue: "London" },
          street: { stringValue: "Piccadilly" },
        },
      },
    },
    hobbies: {
      arrayValue: {
        values: [{ stringValue: "math" }, { stringValue: "programming" }],
      },
    },
  },
  createTime: "2024-01-01T00:00:00.000000Z",
  updateTime: "2024-01-01T00:00:00.000000Z",
};

const CONVERTED_MOCK_DOC = {
  __path__: "users/test-user",
  first: "Ada",
  last: "Lovelace",
  born: 1815,
  address: {
    city: "London",
    street: "Piccadilly",
  },
  hobbies: ["math", "programming"],
};

describe("get_documents tool", () => {
  const projectId = "test-project";
  let getDocumentsStub: sinon.SinonStub;

  beforeEach(() => {
    getDocumentsStub = sinon.stub(gcpFirestore, "getDocuments");
  });

  afterEach(() => {
    sinon.restore();
  });

  it("should call getDocuments without select fields when none are provided", async () => {
    getDocumentsStub.resolves({ documents: [MOCK_DOC], missing: [] });

    const result = await get_documents.fn({ paths: ["users/test-user"] }, { projectId } as any);

    expect(getDocumentsStub).to.have.been.calledOnceWith(
      projectId,
      ["users/test-user"],
      undefined, // database
      undefined, // emulatorUrl
      undefined, // selectFields
    );
    expect(result).to.deep.equal(toContent(CONVERTED_MOCK_DOC));
  });

  it("should call getDocuments without select fields for an empty array", async () => {
    getDocumentsStub.resolves({ documents: [MOCK_DOC], missing: [] });

    await get_documents.fn({ paths: ["users/test-user"], select: [] }, { projectId } as any);

    expect(getDocumentsStub).to.have.been.calledOnceWith(
      projectId,
      ["users/test-user"],
      undefined, // database
      undefined, // emulatorUrl
      [], // selectFields
    );
  });

  it("should call getDocuments with top-level fields", async () => {
    getDocumentsStub.resolves({ documents: [], missing: [] });

    await get_documents.fn(
      { paths: ["users/test-user"], select: ["first", "born"] },
      { projectId } as any,
    );

    expect(getDocumentsStub).to.have.been.calledOnceWith(
      projectId,
      ["users/test-user"],
      undefined, // database
      undefined, // emulatorUrl
      ["first", "born"], // selectFields
    );
  });

  it("should call getDocuments with nested fields", async () => {
    getDocumentsStub.resolves({ documents: [], missing: [] });

    await get_documents.fn(
      { paths: ["users/test-user"], select: ["address.city"] },
      { projectId } as any,
    );

    expect(getDocumentsStub).to.have.been.calledOnceWith(
      projectId,
      ["users/test-user"],
      undefined, // database
      undefined, // emulatorUrl
      ["address.city"], // selectFields
    );
  });
});
