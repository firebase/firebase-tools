import { expect } from "chai";
import * as sinon from "sinon";
import { listRollout, parseRolloutList } from "../rolloutlist";
import { Client } from "../../apiv2";
import { FirebaseError } from "../../error";
import { RemoteConfigRollout } from "../interfaces";

describe("Rollout Listing", () => {
    let sandbox: sinon.SinonSandbox;

    const PROJECT_ID = "test-project-id-456";
    const NAMESPACE = "firebase";
    const EXPECTED_PATH = `/projects/${PROJECT_ID}/namespaces/${NAMESPACE}/rollouts`;

    const MOCK_ROLLOUT_1: RemoteConfigRollout = {
        name: `projects/${PROJECT_ID}/namespaces/${NAMESPACE}/rollouts/rollout-1`,
        definition: {
            displayName: "Rollout One",
            description: "First test rollout",
            service: "remoteconfig.googleapis.com",
            controlVariant: { name: "control", weight: 50 },
            enabledVariant: { name: "enabled", weight: 50 },
        },
        state: "RUNNING",
        createTime: "2023-01-01T00:00:00Z",
        startTime: "2023-01-01T01:00:00Z",
        endTime: "2023-01-30T01:00:00Z",
        lastUpdateTime: "2023-01-02T00:00:00Z",
        etag: "etag-1",
    };

    const MOCK_ROLLOUT_2: RemoteConfigRollout = {
        name: `projects/${PROJECT_ID}/namespaces/${NAMESPACE}/rollouts/rollout-2`,
        definition: {
            displayName: "Rollout Two",
            description: "Second test rollout",
            service: "remoteconfig.googleapis.com",
            controlVariant: { name: "variant_a", weight: 100 },
            enabledVariant: { name: "variant_b", weight: 0 },
        },
        state: "STOPPED",
        createTime: "2023-02-01T00:00:00Z",
        startTime: "2023-02-01T01:00:00Z",
        endTime: "2023-02-15T01:00:00Z",
        lastUpdateTime: "2023-02-02T00:00:00Z",
        etag: "etag-2",
    };

    beforeEach(() => {
        sandbox = sinon.createSandbox();
    });

    afterEach(() => {
        sandbox.restore();
    });

    describe("listRollout", () => {
        it("should resolve with a list of rollouts on success", async () => {
            const expectedResponse = { rollouts: [MOCK_ROLLOUT_1, MOCK_ROLLOUT_2] };
            const listStub = sandbox.stub(Client.prototype, "request").resolves({ body: expectedResponse });

            const result = await listRollout(PROJECT_ID, NAMESPACE);

            expect(result).to.deep.equal(expectedResponse);
            expect(listStub).to.have.been.calledOnceWith({
                method: "GET",
                path: EXPECTED_PATH,
                queryParams: sinon.match.any,
                timeout: 30000,
            });
        });

        it("should construct the query parameters correctly", async () => {
            const listStub = sandbox.stub(Client.prototype, "request").resolves({ body: {} });
            const pageSize = "10";
            const pageToken = "next-page-token";
            const filter = "state=RUNNING";

            await listRollout(PROJECT_ID, NAMESPACE, pageToken, pageSize, filter);

            const params = listStub.firstCall.args[0].queryParams;
            expect(params.get("page_size")).to.equal(pageSize);
            expect(params.get("page_token")).to.equal(pageToken);
            expect(params.get("filter")).to.equal(filter);
        });

        it("should throw a FirebaseError on API failure", async () => {
            const apiError = new Error("API call failed!");
            sandbox.stub(Client.prototype, "request").rejects(apiError);

            await expect(listRollout(PROJECT_ID, NAMESPACE)).to.be.rejectedWith(
                FirebaseError,
                `Failed to get Remote Config rollouts for project ${PROJECT_ID}. Error: ${apiError.message}`
            );
        });
    });

    describe("parseRolloutList", () => {
        it("should return a formatted table string for a list of rollouts", () => {
            const tableString = parseRolloutList([MOCK_ROLLOUT_1, MOCK_ROLLOUT_2]);

            expect(tableString).to.be.a("string");
            // Check for key data points from both mock objects
            expect(tableString).to.include("Rollout One");
            expect(tableString).to.include("etag-1");
            expect(tableString).to.include("Rollout Two");
            expect(tableString).to.include("etag-2");
            expect(tableString).to.include("Display Name"); // Header check
        });

        it('should return a "No rollouts found" message for an empty list', () => {
            const result = parseRolloutList([]);
            expect(result).to.equal("\x1b[31mNo rollouts found.\x1b[0m");
        });

        it('should return a "No rollouts found" message for a null input', () => {
            // Coercing to any to test runtime robustness
            const result = parseRolloutList(null as any);
            expect(result).to.equal("\x1b[31mNo rollouts found.\x1b[0m");
        });
    });
});
