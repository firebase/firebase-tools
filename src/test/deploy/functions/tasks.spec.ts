import { expect } from "chai";
import * as sinon from "sinon";

import { DeploymentTimer } from "../../../deploy/functions/deploymentTimer";
import { ErrorHandler } from "../../../deploy/functions/errorHandler";
import { FirebaseError } from "../../../error";
import * as backend from "../../../deploy/functions/backend";
import * as tasks from "../../../deploy/functions/tasks";

describe("Function Deployment tasks", () => {
  const CLOUD_FUNCTION: backend.FunctionSpec = {
    apiVersion: 1,
    id: "id",
    region: "region",
    project: "project",
    entryPoint: "function",
    runtime: "nodejs14",
    trigger: {
      allowInsecure: true,
    },
  };

  describe("functionsDeploymentHandler", () => {
    let sandbox: sinon.SinonSandbox;
    let timerStub: sinon.SinonStubbedInstance<DeploymentTimer>;
    let errorHandlerStub: sinon.SinonStubbedInstance<ErrorHandler>;

    beforeEach(() => {
      sandbox = sinon.createSandbox();
      timerStub = sandbox.createStubInstance(DeploymentTimer);
      errorHandlerStub = sandbox.createStubInstance(ErrorHandler);
    });

    afterEach(() => {
      sandbox.restore();
    });

    it("should execute the task and time it", async () => {
      const run = sinon.spy();
      const functionName = backend.functionName(CLOUD_FUNCTION);
      const testTask: tasks.DeploymentTask = {
        run,
        fn: CLOUD_FUNCTION,
        operationType: "create",
      };

      const handler = tasks.functionsDeploymentHandler(timerStub, errorHandlerStub);
      await handler(testTask);

      expect(timerStub.startTimer).to.have.been.calledWith(functionName);
      expect(run).to.have.been.called;
      expect(timerStub.endTimer).to.have.been.calledWith(functionName);
      expect(errorHandlerStub.record).not.to.have.been.called;
    });

    it("should throw quota errors", async () => {
      const originalError = {
        name: "Quota Exceeded",
        message: "an error occurred",
        context: {
          response: {
            statusCode: 429,
          },
        },
      };
      const run = sinon.spy(() => {
        throw new FirebaseError("an error occurred", {
          original: originalError,
        });
      });
      const testTask: tasks.DeploymentTask = {
        run,
        fn: CLOUD_FUNCTION,
        operationType: "create",
      };

      const handler = tasks.functionsDeploymentHandler(timerStub, errorHandlerStub);

      await expect(handler(testTask)).to.eventually.be.rejected;

      expect(run).to.have.been.called;
      expect(errorHandlerStub.record).not.to.have.been.called;
    });

    it("should handle other errors", async () => {
      const originalError = {
        name: "Some Other Error",
        message: "an error occurred",
        context: {
          response: {
            statusCode: 500,
          },
        },
      };
      const run = sinon.spy(() => {
        throw new FirebaseError("an error occurred", {
          original: originalError,
        });
      });
      const functionName = backend.functionName(CLOUD_FUNCTION);
      const testTask: tasks.DeploymentTask = {
        run,
        fn: CLOUD_FUNCTION,
        operationType: "create",
      };

      const handler = tasks.functionsDeploymentHandler(timerStub, errorHandlerStub);
      await handler(testTask);

      expect(timerStub.startTimer).to.have.been.calledWith(functionName);
      expect(run).to.have.been.called;
      expect(timerStub.endTimer).to.have.been.calledWith(functionName);
      expect(errorHandlerStub.record).to.have.been.calledWith("error", functionName, "create");
    });
  });

  describe("schedulerDeploymentHandler", () => {
    const sandbox = sinon.createSandbox();
    let errorHandlerStub: sinon.SinonStubbedInstance<ErrorHandler>;

    beforeEach(() => {
      errorHandlerStub = sandbox.createStubInstance(ErrorHandler);
    });

    afterEach(() => {
      sandbox.restore();
    });

    it("should execute the task", async () => {
      const run = sinon.spy();
      const testTask: tasks.DeploymentTask = {
        run,
        fn: CLOUD_FUNCTION,
        operationType: "upsert schedule",
      };

      const handler = tasks.schedulerDeploymentHandler(errorHandlerStub);
      await handler(testTask);

      expect(run).to.have.been.called;
      expect(errorHandlerStub.record).not.to.have.been.called;
    });

    it("should throw quota errors", async () => {
      const run = sinon.spy(() => {
        throw new FirebaseError("an error occurred", {
          status: 429,
        });
      });
      const testTask: tasks.DeploymentTask = {
        run,
        fn: CLOUD_FUNCTION,
        operationType: "upsert schedule",
      };

      const handler = tasks.schedulerDeploymentHandler(errorHandlerStub);
      await expect(handler(testTask)).to.eventually.be.rejected;

      expect(run).to.have.been.called;
      expect(errorHandlerStub.record).not.to.have.been.called;
    });

    it("should ignore 404 errors", async () => {
      const run = sinon.spy(() => {
        throw new FirebaseError("an error occurred", {
          status: 404,
        });
      });
      const testTask: tasks.DeploymentTask = {
        run,
        fn: CLOUD_FUNCTION,
        operationType: "upsert schedule",
      };

      const handler = tasks.schedulerDeploymentHandler(errorHandlerStub);
      await handler(testTask);

      expect(run).to.have.been.called;
      expect(errorHandlerStub.record).not.to.have.been.called;
    });

    it("should handle other errors", async () => {
      const run = sinon.spy(() => {
        throw new FirebaseError("an error occurred", {
          status: 500,
        });
      });
      const functionName = backend.functionName(CLOUD_FUNCTION);
      const testTask: tasks.DeploymentTask = {
        run,
        fn: CLOUD_FUNCTION,
        operationType: "upsert schedule",
      };

      const handler = tasks.schedulerDeploymentHandler(errorHandlerStub);
      await handler(testTask);

      expect(run).to.have.been.called;
      expect(errorHandlerStub.record).to.have.been.calledWith(
        "error",
        functionName,
        "upsert schedule"
      );
    });
  });
});
