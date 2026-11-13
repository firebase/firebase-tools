/**
 * Some shared test utility for Queue and Stack.
 */
export interface Task {
  /**
   * The identifier added to the ordering list.
   */
  name: string;

  /**
   * Gets returned by the handler.
   * We can control the timing of this promise in test.
   */
  promise: Promise<any>;

  /**
   * Mark the task as done.
   */
  resolve: (value?: any) => void;

  /**
   * Mark the task as failed.
   */
  reject: (reason?: any) => void;

  /**
   * Mark the task as started.
   */
  startExecute: (value?: any) => void;

  /**
   * A promise that wait until this task starts executing.
   */
  startExecutePromise: Promise<any>;
}

export const createTask = (name: string, resolved: boolean) => {
  return new Promise<Task>((res) => {
    let resolve: (value?: any) => void = () => {
      throw new Error("resolve is not set");
    };
    let reject: (reason?: any) => void = () => {
      throw new Error("reject is not set");
    };
    let startExecute: (value?: any) => void = () => {
      throw new Error("startExecute is not set");
    };
    const promise = new Promise((s, j) => {
      resolve = s;
      reject = j;
    });
    const startExecutePromise = new Promise((s) => {
      startExecute = s;
    });
    res({
      name,
      promise,
      resolve,
      reject,
      startExecute,
      startExecutePromise,
    });
    if (resolved) {
      resolve();
    }
  });
};

export const createHandler = (orderList: string[]) => {
  return (task: Task) => {
    task.startExecute();
    return task.promise.then(() => {
      orderList.push(task.name);
    });
  };
};
