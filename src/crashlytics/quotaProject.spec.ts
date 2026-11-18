import { expect } from "chai";
import * as sinon from "sinon";

import { ClientRequestOptions } from "../apiv2";
import { CRASHLYTICS_API_CLIENT } from "./utils";
import { getIssue, updateIssue } from "./issues";
import { batchGetEvents, listEvents } from "./events";
import { createNote, deleteNote, listNotes } from "./notes";
import { getReport, listReports, reportsCache } from "./reports";
import { State } from "./types";

// The Crashlytics API rejects user credentials without a quota project
// (https://github.com/firebase/firebase-tools/issues/11545), so every request
// must name the app's project in `x-goog-user-project`. Asserted on the
// request options, since the test nock helper does not check headers.
describe("Crashlytics quota project header", () => {
  const appId = "1:1234567890:android:abcdef1234567890";
  const projectNumber = "1234567890";
  let requestStub: sinon.SinonStub;

  beforeEach(() => {
    requestStub = sinon.stub(CRASHLYTICS_API_CLIENT, "request").resolves({
      status: 200,
      response: new Response(),
      body: { events: [], notes: [], reports: [] },
    });
  });

  afterEach(() => {
    requestStub.restore();
    reportsCache.clear();
  });

  const calls: [string, () => Promise<unknown>][] = [
    ["getIssue", () => getIssue(appId, "issue")],
    ["updateIssue", () => updateIssue(appId, "issue", State.CLOSED)],
    ["listEvents", () => listEvents(appId, {})],
    ["batchGetEvents", () => batchGetEvents(appId, ["event"])],
    ["createNote", () => createNote(appId, "issue", "note")],
    ["deleteNote", () => deleteNote(appId, "issue", "note")],
    ["listNotes", () => listNotes(appId, "issue")],
    ["listReports", () => listReports(appId)],
    [
      "getReport",
      () => {
        reportsCache.set(appId, {
          reports: [{ name: `projects/${projectNumber}/apps/${appId}/reports/topIssues` }],
        });
        return getReport("topIssues", appId, {});
      },
    ],
  ];

  for (const [name, call] of calls) {
    it(`${name} sends the app's project as the quota project`, async () => {
      await call();

      expect(requestStub).to.have.been.calledOnce;
      const options = requestStub.firstCall.args[0] as ClientRequestOptions<unknown>;
      const headers = options.headers;
      expect(headers).to.include({ "x-goog-user-project": projectNumber });
    });
  }
});
