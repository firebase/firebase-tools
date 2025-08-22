import { expect } from "chai";
import * as sinon from "sinon";
import { send_message } from "./send_message";
import * as messaging from "../../../messaging/sendMessage";
import * as util from "../../util";

describe("send_message tool", () => {
  const projectId = "test-project";
  const token = "test-token";
  const topic = "test-topic";
  const title = "Test Title";
  const body = "Test Body";
  const response = { success: true };

  let sendFcmMessageStub: sinon.SinonStub;
  let mcpErrorStub: sinon.SinonStub;

  beforeEach(() => {
    sendFcmMessageStub = sinon.stub(messaging, "sendFcmMessage");
    mcpErrorStub = sinon.stub(util, "mcpError");
  });

  afterEach(() => {
    sinon.restore();
  });

  it("should send a message to a registration token", async () => {
    sendFcmMessageStub.resolves(response);
    const result = await (send_message as any)._fn(
      { registration_token: token, title, body },
      { projectId },
    );
    expect(sendFcmMessageStub).to.be.calledWith(projectId, {
      token,
      topic: undefined,
      title,
      body,
    });
    expect(result).to.deep.equal(util.toContent(response));
  });

  it("should send a message to a topic", async () => {
    sendFcmMessageStub.resolves(response);
    const result = await (send_message as any)._fn({ topic, title, body }, { projectId });
    expect(sendFcmMessageStub).to.be.calledWith(projectId, {
      token: undefined,
      topic,
      title,
      body,
    });
    expect(result).to.deep.equal(util.toContent(response));
  });

  it("should return an error if no token or topic is provided", async () => {
    await (send_message as any)._fn({}, { projectId });
    expect(mcpErrorStub).to.be.calledWith(
      "Must supply either a `registration_token` or `topic` parameter to `send_message`.",
    );
  });

  it("should return an error if both token and topic are provided", async () => {
    await (send_message as any)._fn({ registration_token: token, topic }, { projectId });
    expect(mcpErrorStub).to.be.calledWith(
      "Cannot supply both `registration_token` and `topic` in a single `send_message` request.",
    );
  });
});
