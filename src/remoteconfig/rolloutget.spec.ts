import { expect } from "chai";
import * as sinon from "sinon";
import { getRollout, parseRolloutIntoTable } from "./rolloutget";
import { Client } from "../apiv2";
import { FirebaseError } from "../error";
import { RemoteConfigRollout } from "./interfaces";

describe("Get Rollout", () => {
    let sandbox: sinon.SinonSandbox;

    const PROJECT_ID = "test-project-get-789";
    const NAMESPACE = "firebase";
    const ROLLOUT_ID = "rollout-def-456";
    const EXPECTED_PATH = `/projects/${PROJECT_ID}/namespaces/${NAMESPACE}/rollouts/${ROLLOUT_ID}`;

    const MOCK_ROLLOUT: RemoteConfigRollout = {
        name: `projects/${PROJECT_ID}/namespaces/${NAMESPACE}/rollouts/${ROLLOUT_ID}`,
        definition: {
            displayName: "Specific Rollout",
            description: "A single test rollout",
            service: "remoteconfig.googleapis.com",
            controlVariant: { name: "control-variant", weight: 90 },
            enabledVariant: { name: "enabled-variant", weight: 10 },
        },
        state: "HALTED",
        createTime: "2023-03-01T00:00:00Z",
        startTime: "2023-03-01T01:00:00Z",
        endTime: "2023-03-10T01:00:00Z",
        lastUpdateTime: "2023-03-05T00:00:00Z",
        etag: "etag-get-123",
    };

    beforeEach(() => {
        sandbox = sinon.createSandbox();
    });

    afterEach(() => {
        sandbox.restore();
    });

    describe("getRollout", () => {
        it("should resolve with a single rollout on success", async () => {
            const getStub = sandbox.stub(Client.prototype, "request")
                .resolves({ body: MOCK_ROLLOUT });

            const result = await getRollout(PROJECT_ID, NAMESPACE, ROLLOUT_ID);

            expect(result).to.deep.equal(MOCK_ROLLOUT);
            expect(getStub).to.have.been.calledOnceWith({
                method: "GET",
                path: EXPECTED_PATH,
                timeout: 30000,
            });
        });

        it("should throw a FirebaseError on API failure", async () => {
            const apiError = new Error("Not Found");
            sandbox.stub(Client.prototype, "request").rejects(apiError);

            await expect(
                getRollout(PROJECT_ID, NAMESPACE, ROLLOUT_ID)
            ).to.be.rejectedWith(
                FirebaseError,
                `Failed to get Remote Config Rollout with ID ${ROLLOUT_ID} for project ${PROJECT_ID}. Error: ${apiError.message}`
            );
        });
    });

    describe("parseRolloutIntoTable", () => {
        it("should return a formatted table string for a single rollout", () => {
            const tableString = parseRolloutIntoTable(MOCK_ROLLOUT);

            expect(tableString).to.be.a("string");
            // Check for key data points from the mock object
            expect(tableString).to.include("Specific Rollout");
            expect(tableString).to.include("A single test rollout");
            expect(tableString).to.include("HALTED");
            expect(tableString).to.include("control-variant");
            expect(tableString).to.include("enabled-variant");
            expect(tableString).to.include("etag-get-123");
            expect(tableString).to.include("Display Name"); // Header check
        });
    });
});
