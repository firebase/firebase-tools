
import * as assert from "assert";
import {
  ExecutionParamsService,
  executionArgsJSON,
} from "../../../../../data-connect/execution/execution-params";
import { firebaseSuite, firebaseTest } from "../../../../utils/test_hooks";
import { OperationDefinitionNode, parse } from "graphql";
import { ExtensionBrokerImpl } from "../../../../../extension-broker";
import { AnalyticsLogger } from "../../../../../analytics";
import { SinonSpy, spy } from "sinon";

firebaseSuite("ExecutionParamsService.applyDetectedFixes", () => {
  firebaseTest("should remove undefined variables", async () => {
    const broker = {
      send: () => {},
      on: () => ({ dispose: () => {} }),
    } as any;
    const analyticsLogger = {
      logger: {
        logUsage: () => {},
      },
    } as any;
    const sendSpy = spy(broker, "send");

    executionArgsJSON.value = JSON.stringify({
      name: "test",
      unused: "value",
    });

    const ast = parse(`
      query MyQuery($name: String) {
        users(name: $name) {
          id
        }
      }
    `).definitions[0] as OperationDefinitionNode;

    const service = new ExecutionParamsService(broker, analyticsLogger);
    await service.applyDetectedFixes(ast);

    const expectedJSON = JSON.stringify({ name: "test" }, null, 2);
    assert.equal(executionArgsJSON.value, expectedJSON);
    assert.ok(sendSpy.calledOnce);
    assert.deepEqual(sendSpy.getCall(0).args, [
      "notifyVariables",
      {
        variables: expectedJSON,
        fixes: ["Removed undefined variables: $unused"],
      },
    ]);
  });

  firebaseTest("should add missing required variables", async () => {
    const broker = {
      send: () => {},
      on: () => ({ dispose: () => {} }),
    } as any;
    const analyticsLogger = {
      logger: {
        logUsage: () => {},
      },
    } as any;
    const sendSpy = spy(broker, "send");

    executionArgsJSON.value = JSON.stringify({});

    const ast = parse(`
      query MyQuery($name: String!) {
        users(name: $name) {
          id
        }
      }
    `).definitions[0] as OperationDefinitionNode;

    const service = new ExecutionParamsService(broker, analyticsLogger);
    await service.applyDetectedFixes(ast);

    const expectedJSON = JSON.stringify({ name: "" }, null, 2);
    assert.equal(executionArgsJSON.value, expectedJSON);
    assert.ok(sendSpy.calledOnce);
    assert.deepEqual(sendSpy.getCall(0).args, [
      "notifyVariables",
      {
        variables: expectedJSON,
        fixes: ["Included required variables: $name"],
      },
    ]);
  });

  firebaseTest("should do nothing if no fixes are needed", async () => {
    const broker = {
      send: () => {},
      on: () => ({ dispose: () => {} }),
    } as any;
    const analyticsLogger = {
      logger: {
        logUsage: () => {},
      },
    } as any;
    const sendSpy = spy(broker, "send");

    const originalJSON = JSON.stringify({ name: "test" });
    executionArgsJSON.value = originalJSON;

    const ast = parse(`
      query MyQuery($name: String) {
        users(name: $name) {
          id
        }
      }
    `).definitions[0] as OperationDefinitionNode;

    const service = new ExecutionParamsService(broker, analyticsLogger);
    await service.applyDetectedFixes(ast);

    assert.equal(executionArgsJSON.value, originalJSON);
    assert.ok(sendSpy.notCalled);
  });
});

