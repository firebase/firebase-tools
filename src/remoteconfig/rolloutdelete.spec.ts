import { expect } from "chai";
import * as sinon from "sinon";
import { deleteRollout } from "../rolloutdelete";
import { Client } from "../../apiv2";
import { FirebaseError } from "../../error";

describe("deleteRollout", () => {
    let sandbox: sinon.SinonSandbox;

    const PROJECT_ID = "test-project-id-123";
    const NAMESPACE = "firebase";
    const ROLLOUT_ID = "rollout-abc-789";
    const EXPECTED_PATH = `/projects/${PROJECT_ID}/namespaces/${NAMESPACE}/rollouts/${ROLLOUT_ID}`;

    beforeEach(() => {
        sandbox = sinon.createSandbox();
    });

    afterEach(() => {
        sandbox.restore();
    });

    it("should resolve when the rollout is deleted successfully", async () => {
        const deleteStub = sandbox.stub(Client.prototype, "request").resolves({ body: {} });

        await deleteRollout(PROJECT_ID, NAMESPACE, ROLLOUT_ID);

        expect(deleteStub).to.have.been.calledOnceWith({
            method: "DELETE",
            path: EXPECTED_PATH,
            timeout: 30000,
        });
    });

    it("should throw a specific FirebaseError if the rollout is currently running", async () => {
        const runningError = new Error("Failed request: Rollout is running and cannot be deleted.");
        sandbox.stub(Client.prototype, "request").rejects(runningError);

        await expect(deleteRollout(PROJECT_ID, NAMESPACE, ROLLOUT_ID)).to.be.rejectedWith(
            FirebaseError,
            `Rollout '${ROLLOUT_ID}' is currently running and cannot be deleted. You must stop the rollout before deleting it.`,
        );
    });

    it("should throw a generic FirebaseError for other API errors", async () => {
        const genericError = new Error("Permission denied.");
        sandbox.stub(Client.prototype, "request").rejects(genericError);

        await expect(deleteRollout(PROJECT_ID, NAMESPACE, ROLLOUT_ID)).to.be.rejectedWith(
            FirebaseError,
            `Failed to delete Remote Config rollout '${ROLLOUT_ID}'. Cause: Permission denied.`,
        );
    });

    it("should correctly construct the API path", async () => {
        const deleteStub = sandbox.stub(Client.prototype, "request").resolves({ body: {} });

        await deleteRollout(PROJECT_ID, NAMESPACE, ROLLOUT_ID);

        const callArgs = deleteStub.firstCall.args[0];
        expect(callArgs.path).to.equal(
            "/projects/test-project-id-123/namespaces/firebase/rollouts/rollout-abc-789",
        );
    });
});