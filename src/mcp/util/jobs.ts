export interface Job {
  status: "running" | "success" | "failed";
  progress: number;
  logs: string[];
  result?: unknown;
  error?: string;
  [key: string]: unknown;
}

class JobTracker {
  private jobs = new Map<string, Job>();

  createJob(id: string): void {
    this.jobs.set(id, {
      status: "running",
      progress: 0,
      logs: [],
    });
  }

  updateJob(id: string, updates: Partial<Job>): void {
    const job = this.jobs.get(id);
    if (job) {
      Object.assign(job, updates);
    }
  }

  addLog(id: string, log: string): void {
    const job = this.jobs.get(id);
    if (job) {
      job.logs.push(log);
    }
  }

  getJob(id: string): Job | undefined {
    return this.jobs.get(id);
  }
}

export const jobTracker = new JobTracker();
