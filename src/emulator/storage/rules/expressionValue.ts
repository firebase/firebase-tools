interface ExpressionListValue {
  values: ExpressionValue[];
}

interface ExpressionSetValue {
  values: ExpressionValue[];
}

interface ExpressionMapValue {
  fields: { [s: string]: ExpressionValue };
}

interface ExpressionPathValue {
  segments: ExpressionPathSegmentValue[];
}

interface ExpressionPathSegmentGlobCaptureValue {
  variable_name: string;
  bound_value: ExpressionPathValue;
}

interface ExpressionPathSegmentCapture {
  variable_name: string;
  bound_value: string;
}

interface ExpressionPathSegmentSimple {
  simple: string;
}
type ExpressionPathSegmentValue =
  | ExpressionPathSegmentCapture
  | ExpressionPathSegmentGlobCaptureValue
  | ExpressionPathSegmentSimple;

interface ConstraintValue {
  comparator: "UNSET_COMPARATOR" | "EQ" | "NEQ" | "GT" | "GTE" | "LT" | "LTE" | "LIST_CONTAINS";
  value: ExpressionValue;
}

export interface ExpressionValue {
  null_value?: null | 0;
  bool_value?: boolean;
  int_value?: number;
  float_value?: number;
  string_value?: string;
  bytes_value?: Buffer;
  path_value?: ExpressionPathValue;
  duration_value?: {
    seconds: number;
    nanos: number;
  };
  timestamp_value?: string;
  latlng_value?: {
    latitude: number;
    longitude: number;
  };
  map_value?: ExpressionMapValue;
  list_value?: ExpressionListValue;
  set_value?: ExpressionSetValue;
  constraint_value?: ConstraintValue;
}
