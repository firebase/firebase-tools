import { expect } from "chai";
import * as sinon from "sinon";
import { consult_assistant } from "./consult_assistant";
import * as fdcExperience from "../../../gemini/fdcExperience";
import { toContent } from "../../util";

describe("consult_assistant tool", () => {
  const projectId = "test-project";
  const prompt = "How do I do something?";

  let chatWithFirebaseStub: sinon.SinonStub;

  beforeEach(() => {
    chatWithFirebaseStub = sinon.stub(fdcExperience, "chatWithFirebase");
  });

  afterEach(() => {
    sinon.restore();
  });

  it("should call the assistant and return the result", async () => {
    const response = "This is how you do it.";
    chatWithFirebaseStub.resolves(response);

    const result = await (consult_assistant as any)._fn({ prompt }, { projectId });

    expect(chatWithFirebaseStub).to.be.calledWith(prompt, projectId);
    expect(result).to.deep.equal(toContent(response));
  });
});
