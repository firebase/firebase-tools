// AvailableMemory suffixes and their byte count.
type MemoryUnit = "" | "k" | "M" | "G" | "T" | "Ki" | "Mi" | "Gi" | "Ti";
const BYTES_PER_UNIT: Record<MemoryUnit, number> = {
  "": 1,
  k: 1e3,
  M: 1e6,
  G: 1e9,
  T: 1e12,
  Ki: 1 << 10,
  Mi: 1 << 20,
  Gi: 1 << 30,
  Ti: 1 << 40,
};
/**
 * Returns the float-precision number of Mebi(not Mega)bytes in a
 * Kubernetes-style quantity
 * Must serve the same results as
 * https://github.com/kubernetes/kubernetes/blob/master/staging/src/k8s.io/apimachinery/pkg/api/resource/quantity.go
 */

export function mebibytes(memory: string): number {
  const re = /^([0-9]+(\.[0-9]*)?)(Ki|Mi|Gi|Ti|k|M|G|T|([eE]([0-9]+)))?$/;
  const matches = re.exec(memory);
  if (!matches) {
    throw new Error(`Invalid memory quantity "${memory}""`);
  }
  const quantity = Number.parseFloat(matches[1]);
  let bytes: number;
  if (matches[5]) {
    bytes = quantity * Math.pow(10, Number.parseFloat(matches[5]));
  } else {
    const suffix = matches[3] || "";
    bytes = quantity * BYTES_PER_UNIT[suffix as MemoryUnit];
  }
  return bytes / (1 << 20);
}

export interface PlaintextEnvVar {
  name: string;
  value: string;
}

export interface SecretEnvVar {
  name: string;
  valueSource: {
    secretKeyRef: {
      secret: string; // Secret name
      version?: string; // Optional version, defaults to latest
    };
  };
}

export type EnvVar = PlaintextEnvVar | SecretEnvVar;

export type ResourceType = "cpu" | "memory" | "nvidia.com/gpu";

export interface Container {
  name?: string;
  image: string;
  command?: string[];
  args?: string[];
  env: EnvVar[];
  workingDir?: string;
  resources: {
    limits: Record<ResourceType, string>;
  };
  cpuIdle?: boolean;
  startupCpuBoost?: boolean;
}
