import * as sinon from "sinon";
import { expect } from "chai";
import * as api from "../api";
import * as nock from "nock";
import { sendFcmMessage } from "./sendMessage";
import { FirebaseError } from "../error";

const TEST_PROJECT_ID = "test-project-id";
const TEST_TOKEN = "test-token";
const TEST_TOPIC = "test-topic";
const TEST_TITLE = "test-title";
const TEST_BODY = "test-body";
const TEST_IMAGE = "test-image";
const TEST_MESSAGE_ID = "test-message-id";

describe("sendFcmMessage", () => {
  let sandbox: sinon.SinonSandbox;

  beforeEach(() => {
    sandbox = sinon.createSandbox();
  });

  afterEach(() => {
    sandbox.restore();
    nock.cleanAll();
  });

  it("should send a message with a token", async () => {
    const scope = nock(api.messagingApiOrigin())
      .post(`/v1/projects/${TEST_PROJECT_ID}/messages:send`)
      .reply(200, { name: TEST_MESSAGE_ID });

    const result = await sendFcmMessage(TEST_PROJECT_ID, {
      token: TEST_TOKEN,
      title: TEST_TITLE,
      body: TEST_BODY,
      image: TEST_IMAGE,
    });

    expect(result).to.equal(TEST_MESSAGE_ID);
    expect(scope.isDone()).to.be.true;
  });

  it("should send a message with a topic", async () => {
    const scope = nock(api.messagingApiOrigin())
      .post(`/v1/projects/${TEST_PROJECT_ID}/messages:send`)
      .reply(200, { name: TEST_MESSAGE_ID });

    const result = await sendFcmMessage(TEST_PROJECT_ID, {
      topic: TEST_TOPIC,
      title: TEST_TITLE,
      body: TEST_BODY,
      image: TEST_IMAGE,
    });

    expect(result).to.equal(TEST_MESSAGE_ID);
    expect(scope.isDone()).to.be.true;
  });

  it("should throw an error if no token or topic is provided", async () => {
    await expect(
      sendFcmMessage(TEST_PROJECT_ID, {
        title: TEST_TITLE,
        body: TEST_BODY,
        image: TEST_IMAGE,
      }),
    ).to.be.rejectedWith(FirebaseError, "Must supply either token or topic to send FCM message.");
  });

  it("should handle API errors", async () => {
    const scope = nock(api.messagingApiOrigin())
      .post(`/v1/projects/${TEST_PROJECT_ID}/messages:send`)
      .reply(500, { error: "Internal Server Error" });

    await expect(
      sendFcmMessage(TEST_PROJECT_ID, {
        token: TEST_TOKEN,
        title: TEST_TITLE,
        body: TEST_BODY,
        image: TEST_IMAGE,
      }),
    ).to.be.rejectedWith(
      FirebaseError,
      `Failed to send message to '${TEST_TOKEN}' for the project '${TEST_PROJECT_ID}'.`,
    );
    expect(scope.isDone()).to.be.true;
  });
});
