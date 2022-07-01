/**
 * Copyright (c) 2022 Google LLC
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy of
 * this software and associated documentation files (the "Software"), to deal in
 * the Software without restriction, including without limitation the rights to
 * use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of
 * the Software, and to permit persons to whom the Software is furnished to do so,
 * subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS
 * FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR
 * COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER
 * IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN
 * CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
 */

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
