import { expect } from "chai";
import * as sinon from "sinon";

import * as tasks from "../../../deploy/functions/tasks";
import { DeploymentTimer } from "../../../deploy/functions/deploymentTimer";
import { ErrorHandler } from "../../../deploy/functions/errorHandler";
import { FirebaseError } from "../../../error";

describe("Function Deployment tasks", () => {
  describe("functionsDeploymentHandler", () => {
    const sandbox = sinon.createSandbox();
    let timerStub: sinon.SinonStubbedInstance<DeploymentTimer>;
    let errorHandlerStub: sinon.SinonStubbedInstance<ErrorHandler>;
    beforeEach(() => {
      timerStub = sandbox.createStubInstance(DeploymentTimer);
      errorHandlerStub = sandbox.createStubInstance(ErrorHandler);
    });
    afterEach(() => {
      sandbox.restore();
    });
    it("should execute the task and time it", async () => {
      const testTask: any = sinon.spy();
      const functionName = "myFunc";
      testTask.functionName = functionName;
      testTask.operationType = "create";

      const handler = tasks.functionsDeploymentHandler(timerStub, errorHandlerStub);

      await handler(testTask);

      expect(timerStub.startTimer).to.have.been.calledWith(functionName);
      expect(testTask).to.have.been.called;
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
      const testTask: any = sinon.spy(() => {
        throw new FirebaseError("an error occurred", {
          original: originalError,
        });
      });
      const functionName = "myFunc";
      testTask.functionName = functionName;
      testTask.operationType = "create";

      const handler = tasks.functionsDeploymentHandler(timerStub, errorHandlerStub);

      await expect(handler(testTask)).to.eventually.be.rejected;

      expect(testTask).to.have.been.called;
      expect(errorHandlerStub.record).not.to.have.been.called;
    });
    it("should handle other errors", async () => {
      const originalError = {
        name: "Something else",
        message: "an error occurred",
        context: {
          response: {
            statusCode: 500,
          },
        },
      };
      const testTask: any = sinon.spy(() => {
        throw new FirebaseError("an error occurred", {
          original: originalError,
        });
      });
      const functionName = "myFunc";
      testTask.functionName = functionName;
      testTask.operationType = "create";

      const handler = tasks.functionsDeploymentHandler(timerStub, errorHandlerStub);

      await handler(testTask);

      expect(timerStub.startTimer).to.have.been.calledWith(functionName);
      expect(testTask).to.have.been.called;
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
      const testTask: any = sinon.spy();
      const functionName = "myFunc";
      testTask.functionName = functionName;
      testTask.operationType = "upsert schedule";

      const handler = tasks.schedulerDeploymentHandler(errorHandlerStub);

      await handler(testTask);

      expect(testTask).to.have.been.called;
      expect(errorHandlerStub.record).not.to.have.been.called;
    });

    it("should throw quota errors", async () => {
      const testTask: any = sinon.spy(() => {
        throw new FirebaseError("an error occurred", {
          status: 429,
        });
      });
      const functionName = "myFunc";
      testTask.functionName = functionName;
      testTask.operationType = "upsert schedule";

      const handler = tasks.schedulerDeploymentHandler(errorHandlerStub);

      await expect(handler(testTask)).to.eventually.be.rejected;

      expect(testTask).to.have.been.called;
      expect(errorHandlerStub.record).not.to.have.been.called;
    });

    it("should ignore 404 errors", async () => {
      const testTask: any = sinon.spy(() => {
        throw new FirebaseError("an error occurred", {
          status: 404,
        });
      });
      const functionName = "myFunc";
      testTask.functionName = functionName;
      testTask.operationType = "upsert schedule";

      const handler = tasks.schedulerDeploymentHandler(errorHandlerStub);

      await handler(testTask);

      expect(testTask).to.have.been.called;
      expect(errorHandlerStub.record).not.to.have.been.called;
    });

    it("should handle other errors", async () => {
      const testTask: any = sinon.spy(() => {
        throw new FirebaseError("an error occurred", {
          status: 500,
        });
      });
      const functionName = "myFunc";
      testTask.functionName = functionName;
      testTask.operationType = "upsert schedule";

      const handler = tasks.schedulerDeploymentHandler(errorHandlerStub);

      await handler(testTask);

      expect(testTask).to.have.been.called;
      expect(errorHandlerStub.record).to.have.been.calledWith(
        "error",
        functionName,
        "upsert schedule"
      );
    });
  });
});
