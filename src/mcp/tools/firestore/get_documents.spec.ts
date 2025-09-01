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

  it("should return the full document when select is not provided", async () => {
    getDocumentsStub.resolves({ documents: [MOCK_DOC], missing: [] });

    const result = await get_documents.fn({ paths: ["users/test-user"] }, { projectId } as any);

    expect(result).to.deep.equal(toContent(CONVERTED_MOCK_DOC));
  });

  it("should return the full document when select is an empty array", async () => {
    getDocumentsStub.resolves({ documents: [MOCK_DOC], missing: [] });

    const result = await get_documents.fn(
      { paths: ["users/test-user"], select: [] },
      { projectId } as any,
    );

    expect(result).to.deep.equal(toContent(CONVERTED_MOCK_DOC));
  });

  it("should return only selected top-level fields", async () => {
    getDocumentsStub.resolves({ documents: [MOCK_DOC], missing: [] });

    const result = await get_documents.fn(
      { paths: ["users/test-user"], select: ["first", "born"] },
      { projectId } as any,
    );

    const expected = {
      __path__: "users/test-user",
      first: "Ada",
      born: 1815,
    };
    expect(result).to.deep.equal(toContent(expected));
  });

  it("should return only selected nested fields", async () => {
    getDocumentsStub.resolves({ documents: [MOCK_DOC], missing: [] });

    const result = await get_documents.fn(
      { paths: ["users/test-user"], select: ["address.city"] },
      { projectId } as any,
    );

    const expected = {
      __path__: "users/test-user",
      address: {
        city: "London",
      },
    };
    expect(result).to.deep.equal(toContent(expected));
  });

  it("should return a mix of top-level and nested fields", async () => {
    getDocumentsStub.resolves({ documents: [MOCK_DOC], missing: [] });

    const result = await get_documents.fn(
      { paths: ["users/test-user"], select: ["first", "address.city"] },
      { projectId } as any,
    );

    const expected = {
      __path__: "users/test-user",
      first: "Ada",
      address: {
        city: "London",
      },
    };
    expect(result).to.deep.equal(toContent(expected));
  });

  it("should return a full nested object when selected", async () => {
    getDocumentsStub.resolves({ documents: [MOCK_DOC], missing: [] });

    const result = await get_documents.fn(
      { paths: ["users/test-user"], select: ["address"] },
      { projectId } as any,
    );

    const expected = {
      __path__: "users/test-user",
      address: {
        city: "London",
        street: "Piccadilly",
      },
    };
    expect(result).to.deep.equal(toContent(expected));
  });

  it("should handle requests for non-existent fields gracefully", async () => {
    getDocumentsStub.resolves({ documents: [MOCK_DOC], missing: [] });

    const result = await get_documents.fn(
      { paths: ["users/test-user"], select: ["first", "nonexistent.field"] },
      { projectId } as any,
    );

    const expected = {
      __path__: "users/test-user",
      first: "Ada",
    };
    expect(result).to.deep.equal(toContent(expected));
  });

  it("should return the parent object if both parent and child are selected", async () => {
    getDocumentsStub.resolves({ documents: [MOCK_DOC], missing: [] });

    const result = await get_documents.fn(
      { paths: ["users/test-user"], select: ["address", "address.city"] },
      { projectId } as any,
    );

    const expected = {
      __path__: "users/test-user",
      address: {
        city: "London",
        street: "Piccadilly",
      },
    };
    expect(result).to.deep.equal(toContent(expected));
  });

  it("should return an array field correctly", async () => {
    getDocumentsStub.resolves({ documents: [MOCK_DOC], missing: [] });

    const result = await get_documents.fn(
      { paths: ["users/test-user"], select: ["hobbies"] },
      { projectId } as any,
    );

    const expected = {
      __path__: "users/test-user",
      hobbies: ["math", "programming"],
    };
    expect(result).to.deep.equal(toContent(expected));
  });
});
