import { ComparisonResult } from "./compare";

export interface ComparisonSlot {
  index: number;
  backendIds: string[];
}

export interface SecretMapping {
  originalName: string;
  mockSecretName: string;
  mockValue: string;
}

export interface DashboardComparisonResult extends ComparisonResult {
  diffChanges?: Array<{
    value: string;
    added: boolean;
    removed: boolean;
  }>;
}

export interface CompareResponse {
  testCase: string;
  variantA: string;
  variantB: string;
  urlA: string;
  urlB: string;
  results: DashboardComparisonResult[];
}

export interface VariantMetadata {
  id: string;
  localBuild: boolean;
  runtime: string;
}

export interface MatrixResponse {
  testCase: string;
  variants: string[];
  variantsMetadata: Record<string, VariantMetadata>;
  matrix: Record<string, Record<string, number | null>>;
}
