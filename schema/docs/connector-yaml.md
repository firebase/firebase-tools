# Schema Docs

|                           |             |
| ------------------------- | ----------- |
| **Type**                  | `object`    |
| **Required**              | No          |
| **Additional properties** | Not allowed |

**Description:** connector.yaml is how you configure a connector for your Firebase Data Connect service.

| Property                       | Pattern | Type   | Deprecated | Definition | Title/Description                              |
| ------------------------------ | ------- | ------ | ---------- | ---------- | ---------------------------------------------- |
| - [connectorId](#connectorId ) | No      | string | No         | -          | The ID of the Firebase Data Connect connector. |
| - [generate](#generate )       | No      | object | No         | -          | -                                              |

## <a name="connectorId"></a>1. Property `root > connectorId`

|              |          |
| ------------ | -------- |
| **Type**     | `string` |
| **Required** | No       |

**Description:** The ID of the Firebase Data Connect connector.

## <a name="generate"></a>2. Property `root > generate`

|                           |             |
| ------------------------- | ----------- |
| **Type**                  | `object`    |
| **Required**              | No          |
| **Additional properties** | Not allowed |

| Property                                    | Pattern | Type        | Deprecated | Definition | Title/Description                            |
| ------------------------------------------- | ------- | ----------- | ---------- | ---------- | -------------------------------------------- |
| - [javascriptSdk](#generate_javascriptSdk ) | No      | Combination | No         | -          | Configuration for a generated Javascript SDK |
| - [dartSdk](#generate_dartSdk )             | No      | Combination | No         | -          | Configuration for a generated Dart SDK       |
| - [kotlinSdk](#generate_kotlinSdk )         | No      | Combination | No         | -          | Configuration for a generated Kotlin SDK     |
| - [swiftSdk](#generate_swiftSdk )           | No      | Combination | No         | -          | Configuration for a generated Swift SDK      |
| - [llmTools](#generate_llmTools )           | No      | Combination | No         | -          | -                                            |

### <a name="generate_javascriptSdk"></a>2.1. Property `root > generate > javascriptSdk`

|                           |                  |
| ------------------------- | ---------------- |
| **Type**                  | `combining`      |
| **Required**              | No               |
| **Additional properties** | Any type allowed |

**Description:** Configuration for a generated Javascript SDK

| One of(Option)                                    |
| ------------------------------------------------- |
| [javascriptSdk](#generate_javascriptSdk_oneOf_i0) |
| [item 1](#generate_javascriptSdk_oneOf_i1)        |

#### <a name="generate_javascriptSdk_oneOf_i0"></a>2.1.1. Property `root > generate > javascriptSdk > oneOf > javascriptSdk`

|                           |                             |
| ------------------------- | --------------------------- |
| **Type**                  | `object`                    |
| **Required**              | No                          |
| **Additional properties** | Any type allowed            |
| **Defined in**            | #/definitions/javascriptSdk |

| Property                                                             | Pattern | Type   | Deprecated | Definition | Title/Description                                                                |
| -------------------------------------------------------------------- | ------- | ------ | ---------- | ---------- | -------------------------------------------------------------------------------- |
| - [outputDir](#generate_javascriptSdk_oneOf_i0_outputDir )           | No      | string | No         | -          | Path to the directory where generated files should be written to.                |
| - [package](#generate_javascriptSdk_oneOf_i0_package )               | No      | string | No         | -          | The package name to use for the generated code.                                  |
| - [packageJSONDir](#generate_javascriptSdk_oneOf_i0_packageJSONDir ) | No      | string | No         | -          | The directory containining the package.json to install the generated package in. |
| - [](#generate_javascriptSdk_oneOf_i0_additionalProperties )         | No      | object | No         | -          | -                                                                                |

##### <a name="generate_javascriptSdk_oneOf_i0_outputDir"></a>2.1.1.1. Property `root > generate > javascriptSdk > oneOf > item 0 > outputDir`

|              |          |
| ------------ | -------- |
| **Type**     | `string` |
| **Required** | No       |

**Description:** Path to the directory where generated files should be written to.

##### <a name="generate_javascriptSdk_oneOf_i0_package"></a>2.1.1.2. Property `root > generate > javascriptSdk > oneOf > item 0 > package`

|              |          |
| ------------ | -------- |
| **Type**     | `string` |
| **Required** | No       |

**Description:** The package name to use for the generated code.

##### <a name="generate_javascriptSdk_oneOf_i0_packageJSONDir"></a>2.1.1.3. Property `root > generate > javascriptSdk > oneOf > item 0 > packageJSONDir`

|              |          |
| ------------ | -------- |
| **Type**     | `string` |
| **Required** | No       |

**Description:** The directory containining the package.json to install the generated package in.

#### <a name="generate_javascriptSdk_oneOf_i1"></a>2.1.2. Property `root > generate > javascriptSdk > oneOf > item 1`

|              |         |
| ------------ | ------- |
| **Type**     | `array` |
| **Required** | No      |

|                      | Array restrictions |
| -------------------- | ------------------ |
| **Min items**        | N/A                |
| **Max items**        | N/A                |
| **Items unicity**    | False              |
| **Additional items** | False              |
| **Tuple validation** | See below          |

| Each item of this array must be                         | Description |
| ------------------------------------------------------- | ----------- |
| [javascriptSdk](#generate_javascriptSdk_oneOf_i1_items) | -           |

##### <a name="generate_javascriptSdk_oneOf_i1_items"></a>2.1.2.1. root > generate > javascriptSdk > oneOf > item 1 > javascriptSdk

|                           |                                                                     |
| ------------------------- | ------------------------------------------------------------------- |
| **Type**                  | `object`                                                            |
| **Required**              | No                                                                  |
| **Additional properties** | Any type allowed                                                    |
| **Same definition as**    | [generate_javascriptSdk_oneOf_i0](#generate_javascriptSdk_oneOf_i0) |

### <a name="generate_dartSdk"></a>2.2. Property `root > generate > dartSdk`

|                           |                  |
| ------------------------- | ---------------- |
| **Type**                  | `combining`      |
| **Required**              | No               |
| **Additional properties** | Any type allowed |

**Description:** Configuration for a generated Dart SDK

| One of(Option)                        |
| ------------------------------------- |
| [dartSdk](#generate_dartSdk_oneOf_i0) |
| [item 1](#generate_dartSdk_oneOf_i1)  |

#### <a name="generate_dartSdk_oneOf_i0"></a>2.2.1. Property `root > generate > dartSdk > oneOf > dartSdk`

|                           |                       |
| ------------------------- | --------------------- |
| **Type**                  | `object`              |
| **Required**              | No                    |
| **Additional properties** | Any type allowed      |
| **Defined in**            | #/definitions/dartSdk |

| Property                                               | Pattern | Type   | Deprecated | Definition | Title/Description                                                 |
| ------------------------------------------------------ | ------- | ------ | ---------- | ---------- | ----------------------------------------------------------------- |
| - [outputDir](#generate_dartSdk_oneOf_i0_outputDir )   | No      | string | No         | -          | Path to the directory where generated files should be written to. |
| - [package](#generate_dartSdk_oneOf_i0_package )       | No      | string | No         | -          | The package name to use for the generated code.                   |
| - [](#generate_dartSdk_oneOf_i0_additionalProperties ) | No      | object | No         | -          | -                                                                 |

##### <a name="generate_dartSdk_oneOf_i0_outputDir"></a>2.2.1.1. Property `root > generate > dartSdk > oneOf > item 0 > outputDir`

|              |          |
| ------------ | -------- |
| **Type**     | `string` |
| **Required** | No       |

**Description:** Path to the directory where generated files should be written to.

##### <a name="generate_dartSdk_oneOf_i0_package"></a>2.2.1.2. Property `root > generate > dartSdk > oneOf > item 0 > package`

|              |          |
| ------------ | -------- |
| **Type**     | `string` |
| **Required** | No       |

**Description:** The package name to use for the generated code.

#### <a name="generate_dartSdk_oneOf_i1"></a>2.2.2. Property `root > generate > dartSdk > oneOf > item 1`

|              |         |
| ------------ | ------- |
| **Type**     | `array` |
| **Required** | No      |

|                      | Array restrictions |
| -------------------- | ------------------ |
| **Min items**        | N/A                |
| **Max items**        | N/A                |
| **Items unicity**    | False              |
| **Additional items** | False              |
| **Tuple validation** | See below          |

| Each item of this array must be             | Description |
| ------------------------------------------- | ----------- |
| [dartSdk](#generate_dartSdk_oneOf_i1_items) | -           |

##### <a name="generate_dartSdk_oneOf_i1_items"></a>2.2.2.1. root > generate > dartSdk > oneOf > item 1 > dartSdk

|                           |                                                         |
| ------------------------- | ------------------------------------------------------- |
| **Type**                  | `object`                                                |
| **Required**              | No                                                      |
| **Additional properties** | Any type allowed                                        |
| **Same definition as**    | [generate_dartSdk_oneOf_i0](#generate_dartSdk_oneOf_i0) |

### <a name="generate_kotlinSdk"></a>2.3. Property `root > generate > kotlinSdk`

|                           |                  |
| ------------------------- | ---------------- |
| **Type**                  | `combining`      |
| **Required**              | No               |
| **Additional properties** | Any type allowed |

**Description:** Configuration for a generated Kotlin SDK

| One of(Option)                            |
| ----------------------------------------- |
| [kotlinSdk](#generate_kotlinSdk_oneOf_i0) |
| [item 1](#generate_kotlinSdk_oneOf_i1)    |

#### <a name="generate_kotlinSdk_oneOf_i0"></a>2.3.1. Property `root > generate > kotlinSdk > oneOf > kotlinSdk`

|                           |                         |
| ------------------------- | ----------------------- |
| **Type**                  | `object`                |
| **Required**              | No                      |
| **Additional properties** | Any type allowed        |
| **Defined in**            | #/definitions/kotlinSdk |

| Property                                                 | Pattern | Type   | Deprecated | Definition | Title/Description                                                 |
| -------------------------------------------------------- | ------- | ------ | ---------- | ---------- | ----------------------------------------------------------------- |
| - [outputDir](#generate_kotlinSdk_oneOf_i0_outputDir )   | No      | string | No         | -          | Path to the directory where generated files should be written to. |
| - [package](#generate_kotlinSdk_oneOf_i0_package )       | No      | string | No         | -          | The package name to use for the generated code.                   |
| - [](#generate_kotlinSdk_oneOf_i0_additionalProperties ) | No      | object | No         | -          | -                                                                 |

##### <a name="generate_kotlinSdk_oneOf_i0_outputDir"></a>2.3.1.1. Property `root > generate > kotlinSdk > oneOf > item 0 > outputDir`

|              |          |
| ------------ | -------- |
| **Type**     | `string` |
| **Required** | No       |

**Description:** Path to the directory where generated files should be written to.

##### <a name="generate_kotlinSdk_oneOf_i0_package"></a>2.3.1.2. Property `root > generate > kotlinSdk > oneOf > item 0 > package`

|              |          |
| ------------ | -------- |
| **Type**     | `string` |
| **Required** | No       |

**Description:** The package name to use for the generated code.

#### <a name="generate_kotlinSdk_oneOf_i1"></a>2.3.2. Property `root > generate > kotlinSdk > oneOf > item 1`

|              |         |
| ------------ | ------- |
| **Type**     | `array` |
| **Required** | No      |

|                      | Array restrictions |
| -------------------- | ------------------ |
| **Min items**        | N/A                |
| **Max items**        | N/A                |
| **Items unicity**    | False              |
| **Additional items** | False              |
| **Tuple validation** | See below          |

| Each item of this array must be                 | Description |
| ----------------------------------------------- | ----------- |
| [kotlinSdk](#generate_kotlinSdk_oneOf_i1_items) | -           |

##### <a name="generate_kotlinSdk_oneOf_i1_items"></a>2.3.2.1. root > generate > kotlinSdk > oneOf > item 1 > kotlinSdk

|                           |                                                             |
| ------------------------- | ----------------------------------------------------------- |
| **Type**                  | `object`                                                    |
| **Required**              | No                                                          |
| **Additional properties** | Any type allowed                                            |
| **Same definition as**    | [generate_kotlinSdk_oneOf_i0](#generate_kotlinSdk_oneOf_i0) |

### <a name="generate_swiftSdk"></a>2.4. Property `root > generate > swiftSdk`

|                           |                  |
| ------------------------- | ---------------- |
| **Type**                  | `combining`      |
| **Required**              | No               |
| **Additional properties** | Any type allowed |

**Description:** Configuration for a generated Swift SDK

| One of(Option)                          |
| --------------------------------------- |
| [swiftSdk](#generate_swiftSdk_oneOf_i0) |
| [item 1](#generate_swiftSdk_oneOf_i1)   |

#### <a name="generate_swiftSdk_oneOf_i0"></a>2.4.1. Property `root > generate > swiftSdk > oneOf > swiftSdk`

|                           |                        |
| ------------------------- | ---------------------- |
| **Type**                  | `object`               |
| **Required**              | No                     |
| **Additional properties** | Any type allowed       |
| **Defined in**            | #/definitions/swiftSdk |

| Property                                                | Pattern | Type   | Deprecated | Definition | Title/Description                                                 |
| ------------------------------------------------------- | ------- | ------ | ---------- | ---------- | ----------------------------------------------------------------- |
| - [outputDir](#generate_swiftSdk_oneOf_i0_outputDir )   | No      | string | No         | -          | Path to the directory where generated files should be written to. |
| - [](#generate_swiftSdk_oneOf_i0_additionalProperties ) | No      | object | No         | -          | -                                                                 |

##### <a name="generate_swiftSdk_oneOf_i0_outputDir"></a>2.4.1.1. Property `root > generate > swiftSdk > oneOf > item 0 > outputDir`

|              |          |
| ------------ | -------- |
| **Type**     | `string` |
| **Required** | No       |

**Description:** Path to the directory where generated files should be written to.

#### <a name="generate_swiftSdk_oneOf_i1"></a>2.4.2. Property `root > generate > swiftSdk > oneOf > item 1`

|              |         |
| ------------ | ------- |
| **Type**     | `array` |
| **Required** | No      |

|                      | Array restrictions |
| -------------------- | ------------------ |
| **Min items**        | N/A                |
| **Max items**        | N/A                |
| **Items unicity**    | False              |
| **Additional items** | False              |
| **Tuple validation** | See below          |

| Each item of this array must be               | Description |
| --------------------------------------------- | ----------- |
| [swiftSdk](#generate_swiftSdk_oneOf_i1_items) | -           |

##### <a name="generate_swiftSdk_oneOf_i1_items"></a>2.4.2.1. root > generate > swiftSdk > oneOf > item 1 > swiftSdk

|                           |                                                           |
| ------------------------- | --------------------------------------------------------- |
| **Type**                  | `object`                                                  |
| **Required**              | No                                                        |
| **Additional properties** | Any type allowed                                          |
| **Same definition as**    | [generate_swiftSdk_oneOf_i0](#generate_swiftSdk_oneOf_i0) |

### <a name="generate_llmTools"></a>2.5. Property `root > generate > llmTools`

|                           |                  |
| ------------------------- | ---------------- |
| **Type**                  | `combining`      |
| **Required**              | No               |
| **Additional properties** | Any type allowed |

| One of(Option)                          |
| --------------------------------------- |
| [llmTools](#generate_llmTools_oneOf_i0) |
| [item 1](#generate_llmTools_oneOf_i1)   |

#### <a name="generate_llmTools_oneOf_i0"></a>2.5.1. Property `root > generate > llmTools > oneOf > llmTools`

|                           |                        |
| ------------------------- | ---------------------- |
| **Type**                  | `object`               |
| **Required**              | No                     |
| **Additional properties** | Any type allowed       |
| **Defined in**            | #/definitions/llmTools |

| Property                                                | Pattern | Type   | Deprecated | Definition | Title/Description                                                  |
| ------------------------------------------------------- | ------- | ------ | ---------- | ---------- | ------------------------------------------------------------------ |
| - [outputFile](#generate_llmTools_oneOf_i0_outputFile ) | No      | string | No         | -          | Path where the JSON LLM tool definitions file should be generated. |
| - [](#generate_llmTools_oneOf_i0_additionalProperties ) | No      | object | No         | -          | -                                                                  |

##### <a name="generate_llmTools_oneOf_i0_outputFile"></a>2.5.1.1. Property `root > generate > llmTools > oneOf > item 0 > outputFile`

|              |          |
| ------------ | -------- |
| **Type**     | `string` |
| **Required** | No       |

**Description:** Path where the JSON LLM tool definitions file should be generated.

#### <a name="generate_llmTools_oneOf_i1"></a>2.5.2. Property `root > generate > llmTools > oneOf > item 1`

|              |         |
| ------------ | ------- |
| **Type**     | `array` |
| **Required** | No      |

|                      | Array restrictions |
| -------------------- | ------------------ |
| **Min items**        | N/A                |
| **Max items**        | N/A                |
| **Items unicity**    | False              |
| **Additional items** | False              |
| **Tuple validation** | See below          |

| Each item of this array must be               | Description |
| --------------------------------------------- | ----------- |
| [llmTools](#generate_llmTools_oneOf_i1_items) | -           |

##### <a name="generate_llmTools_oneOf_i1_items"></a>2.5.2.1. root > generate > llmTools > oneOf > item 1 > llmTools

|                           |                                                           |
| ------------------------- | --------------------------------------------------------- |
| **Type**                  | `object`                                                  |
| **Required**              | No                                                        |
| **Additional properties** | Any type allowed                                          |
| **Same definition as**    | [generate_llmTools_oneOf_i0](#generate_llmTools_oneOf_i0) |

----------------------------------------------------------------------------------------------------------------------------
Generated using [json-schema-for-humans](https://github.com/coveooss/json-schema-for-humans) on 2025-06-17 at 07:09:43 -0700
