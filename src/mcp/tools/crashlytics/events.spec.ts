import { expect } from "chai";
import * as sinon from "sinon";
import * as events from "../../../crashlytics/events";
import { McpContext } from "../../types";
import { batch_get_events, list_events } from "./events";

const APP_ID = "1:1234567890:android:abcdef1234567890";
const WEB_APP_ID = "1:1234567890:web:abcdef1234567890";
const ISSUE_ID = "issue-123";
const VARIANT_ID = "variant-456";
const MOCK_CONTEXT = {} as McpContext;

describe("crashlytics events tools", () => {
  let sandbox: sinon.SinonSandbox;
  let listEventsStub: sinon.SinonStub;
  let batchGetEventsStub: sinon.SinonStub;

  beforeEach(() => {
    sandbox = sinon.createSandbox();
    listEventsStub = sandbox.stub(events, "listEvents");
    batchGetEventsStub = sandbox.stub(events, "batchGetEvents");
  });

  afterEach(() => {
    sandbox.restore();
  });

  describe("list_events", () => {
    it("requires appId", async () => {
      const result = await list_events.fn(
        { appId: "", filter: { issueId: ISSUE_ID }, pageSize: 1 },
        MOCK_CONTEXT,
      );

      expect(result.isError).to.be.true;
      expect(result.content[0]).to.deep.equal({
        type: "text",
        text: "Must specify 'appId' parameter",
      });
      expect(listEventsStub.called).to.be.false;
    });

    it("requires filter.issueId when filter is omitted", async () => {
      const result = await list_events.fn({ appId: APP_ID, pageSize: 1 }, MOCK_CONTEXT);

      expect(result.isError).to.be.true;
      expect(result.content).to.deep.equal([
        {
          type: "text",
          text: "Must specify 'filter.issueId' parameter.",
        },
      ]);
      expect(listEventsStub.called).to.be.false;
    });

    it("rejects filter.issueVariantId when filter.issueId is omitted", async () => {
      const result = await list_events.fn(
        {
          appId: APP_ID,
          filter: { issueVariantId: VARIANT_ID },
          pageSize: 1,
        },
        MOCK_CONTEXT,
      );

      expect(result.isError).to.be.true;
      expect(result.content).to.deep.equal([
        {
          type: "text",
          text: "Must specify 'filter.issueId' parameter.",
        },
      ]);
      expect(listEventsStub.called).to.be.false;
    });

    it("returns an error when filter validation fails", async () => {
      const result = await list_events.fn(
        {
          appId: APP_ID,
          filter: {
            issueId: ISSUE_ID,
            versionDisplayNames: ["1.0.0"],
          },
          pageSize: 1,
        },
        MOCK_CONTEXT,
      );

      expect(result.isError).to.be.true;
      expect(result.content[0]).to.deep.include({
        type: "text",
      });
      expect((result.content[0] as { text: string }).text).to.include(
        "Error: versionDisplayNames must match pattern 'version (build)'",
      );
      expect(listEventsStub.called).to.be.false;
    });

    it("calls listEvents with filter, pageSize, and filterExpression when filter.issueId is provided", async () => {
      listEventsStub.resolves({
        events: [{ eventId: "evt-1", issue: { id: ISSUE_ID } }],
      });
      const filterExpression = 'custom_keys.env = "prod"';

      const result = await list_events.fn(
        {
          appId: WEB_APP_ID,
          filter: {
            issueId: ISSUE_ID,
            versionDisplayNames: ["1.0.0"],
          },
          filterExpression,
          pageSize: 2,
        },
        MOCK_CONTEXT,
      );

      expect(result.isError).to.be.undefined;
      expect(
        listEventsStub.calledOnceWithExactly(
          WEB_APP_ID,
          { issueId: ISSUE_ID, versionDisplayNames: ["1.0.0"] },
          2,
          filterExpression,
        ),
      ).to.be.true;
      expect((result.content[0] as { text: string }).text).to.include("evt-1");
    });
  });

  describe("batch_get_events", () => {
    it("requires appId and names", async () => {
      const result = await batch_get_events.fn({ appId: "", names: [] }, MOCK_CONTEXT);

      expect(result.isError).to.be.true;
      expect(result.content[0]).to.deep.equal({
        type: "text",
        text: "Must specify 'appId' parameter.",
      });
      expect(result.content[2]).to.deep.equal({
        type: "text",
        text: "Must provide event resource names in name parameter.",
      });
      expect(batchGetEventsStub.called).to.be.false;
    });

    it("fetches events by resource names on success", async () => {
      const names = [`projects/1234567890/apps/${APP_ID}/events/evt-1`];
      batchGetEventsStub.resolves({
        events: [{ eventId: "evt-1" }],
      });

      const result = await batch_get_events.fn({ appId: APP_ID, names }, MOCK_CONTEXT);

      expect(result.isError).to.be.undefined;
      expect(batchGetEventsStub.calledOnceWithExactly(APP_ID, names)).to.be.true;
      expect((result.content[0] as { text: string }).text).to.include("evt-1");
    });
  });
});
