import { expect } from "chai";
import * as sinon from "sinon";
import { get_documents } from "./get_documents";
import * as firestore from "../../../gcp/firestore";
import * as converter from "./converter";
import * as util from "../../util";
import { Emulators } from "../../../emulator/types";

describe("get_documents tool", () => {
  const projectId = "test-project";
  const path1 = "c/d1";
  const path2 = "c/d2";
  const doc1 = { name: `.../${path1}`, fields: {} };
  const jsonDoc1 = { __path__: path1 };
  const mockHost: any = {
    getEmulatorUrl: sinon.stub(),
  };

  let getDocumentsStub: sinon.SinonStub;
  let toJsonStub: sinon.SinonStub;
  let mcpErrorStub: sinon.SinonStub;

  beforeEach(() => {
    getDocumentsStub = sinon.stub(firestore, "getDocuments");
    toJsonStub = sinon.stub(converter, "firestoreDocumentToJson");
    mcpErrorStub = sinon.stub(util, "mcpError");
  });

  afterEach(() => {
    sinon.restore();
  });

  it("should get a single document", async () => {
    getDocumentsStub.resolves({ documents: [doc1], missing: [] });
    toJsonStub.returns(jsonDoc1);

    const result = await (get_documents as any)._fn(
      { paths: [path1] },
      { projectId, host: mockHost },
    );

    expect(getDocumentsStub).to.be.calledWith(projectId, [path1], undefined, undefined);
    expect(toJsonStub).to.be.calledWith(doc1);
    expect(result).to.deep.equal(util.toContent(jsonDoc1));
  });

  it("should get multiple documents with some missing", async () => {
    getDocumentsStub.resolves({ documents: [doc1], missing: [path2] });
    toJsonStub.withArgs(doc1).returns(jsonDoc1);

    const result = await (get_documents as any)._fn(
      { paths: [path1, path2] },
      { projectId, host: mockHost },
    );

    expect(result.content).to.be.an("array").with.lengthOf(3);
    expect(result.content[0].text).to.equal("Retrieved documents:\n\n");
    expect(result.content[2].text).to.equal(`The following documents do not exist: ${path2}`);
  });

  it("should return an error if all documents are missing", async () => {
    getDocumentsStub.resolves({ documents: [], missing: [path1] });
    await (get_documents as any)._fn({ paths: [path1] }, { projectId, host: mockHost });
    expect(mcpErrorStub).to.be.calledWith(
      `None of the specified documents were found in project '${projectId}'`,
    );
  });

  it("should return an error if no paths are provided", async () => {
    await (get_documents as any)._fn({ paths: [] }, { projectId, host: mockHost });
    expect(mcpErrorStub).to.be.calledWith("Must supply at least one document path.");
  });

  it("should use the emulator", async () => {
    const emulatorUrl = "http://localhost:8080";
    mockHost.getEmulatorUrl.withArgs(Emulators.FIRESTORE).resolves(emulatorUrl);
    getDocumentsStub.resolves({ documents: [], missing: [path1] }); // To prevent error

    await (get_documents as any)._fn(
      { paths: [path1], use_emulator: true },
      { projectId, host: mockHost },
    );

    expect(mockHost.getEmulatorUrl).to.be.calledWith(Emulators.FIRESTORE);
    expect(getDocumentsStub).to.be.calledWith(projectId, [path1], undefined, emulatorUrl);
  });
});
