import * as vscode from "vscode";

export async function waitForTaskCompletion(
  taskName: string,
): Promise<boolean> {
  return browser.executeWorkbench<Promise<boolean>>(
    (vs: typeof vscode, taskName: string) => {
      return new Promise((resolve, reject) => {
        let taskCompleted = false;

        const startListener = vs.tasks.onDidStartTask((e) => {
          if (e.execution.task.name === taskName) {
            console.log(`Task "${taskName}" started.`);
          }
        });

        const endListener = vs.tasks.onDidEndTask((e) => {
          if (e.execution.task.name === taskName) {
            console.log(`Task "${taskName}" completed.`);
            taskCompleted = true;
            resolve(taskCompleted); // Resolve the promise when the task finishes
            startListener.dispose(); // Clean up the listeners
            endListener.dispose();
          }
        });

        setTimeout(() => {
          reject(new Error(`Task "${taskName}" did not complete in time.`));
          startListener.dispose(); // Clean up in case of timeout
          endListener.dispose();
        }, 60000); // Set a timeout (e.g., 60 seconds) to prevent hanging
      });
    },
    taskName,
  );
}

export async function waitForTaskStart(taskName: string): Promise<boolean> {
  return browser.executeWorkbench<Promise<boolean>>(
    (vs: typeof vscode, taskName: string) => {
      return new Promise((resolve, reject) => {
        let taskStarted = false;

        const startListener = vs.tasks.onDidStartTask((e) => {
          if (e.execution.task.name === taskName) {
            console.log(`Task "${taskName}" started.`);
            taskStarted = true;
            resolve(taskStarted);
          }
        });

        setTimeout(() => {
          reject(new Error(`Task "${taskName}" did not start in time.`));
          startListener.dispose();
        }, 60000);
      });
    },
    taskName,
  );
}
