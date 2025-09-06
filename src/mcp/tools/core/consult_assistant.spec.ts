import { expect } from "chai";
import * as sinon from "sinon";
import { consult_assistant } from "./consult_assistant";
import * as fdcExperience from "../../../gemini/fdcExperience";
import { toContent } from "../../util";
import { ServerToolContext } from "../../tool";
import { ChatExperienceResponse } from "../../../gemini/types";

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
    const assistant_msg = "This is how you do it.";
    const response: ChatExperienceResponse = {
      output: {
        messages: [{ content: assistant_msg, author: "ASSISTANT" }],
      },
      outputDataContext: {
        additionalContext: { "@type": "" },
        attributionContext: {
          citationMetadata: {
            citations: [],
          },
        },
      },
    };
    chatWithFirebaseStub.resolves(response);

    const result = await consult_assistant.fn({ prompt }, { projectId } as ServerToolContext);

    expect(chatWithFirebaseStub).to.be.calledWith(prompt, projectId);
    expect(result).to.deep.equal(toContent(response));
  });
});
