export interface StatusErrorResponse {
  readonly code: number;
  readonly message: string;
}

export interface FirebaseModel {
  readonly name: string /* The fully qualified resource name of the Firebase model */;
  displayName?: string; // Optional input during update with mask. Required otherwise.
  tags?: string[];
  readonly createTime: string;
  readonly updateTime: string;
  readonly etag: string;
  readonly modelHash?: string;
  state?: {
    readonly validationError?: StatusErrorResponse;
    published?: boolean;
  };

  tfliteModel?: {
    // These are mutually exclusive model sources
    gcsTfliteUri?: string;
    automlModel?: string;

    readonly sizeBytes: number;
  };
}

export interface ModelsPage {
  models: FirebaseModel[];
  nextPageToken?: string;
}
