# Schema Docs

|                           |             |
| ------------------------- | ----------- |
| **Type**                  | `object`    |
| **Required**              | No          |
| **Additional properties** | Not allowed |

**Description:** extension.yaml declares the resources and configurable parameters for a Firebase Extension.

| Property                                 | Pattern | Type            | Deprecated | Definition              | Title/Description                                                                                              |
| ---------------------------------------- | ------- | --------------- | ---------- | ----------------------- | -------------------------------------------------------------------------------------------------------------- |
| - [name](#name )                         | No      | string          | No         | -                       | ID of this extension (ie your-extension-name)                                                                  |
| - [version](#version )                   | No      | string          | No         | -                       | Version of this extension. Follows https://semver.org/.                                                        |
| - [specVersion](#specVersion )           | No      | string          | No         | -                       | Version of the extension.yaml spec that this file follows. Currently always 'v1beta'                           |
| - [license](#license )                   | No      | string          | No         | -                       | The software license agreement for this extension. Currently, only 'Apache-2.0' is permitted on extensions.dev |
| - [displayName](#displayName )           | No      | string          | No         | -                       | Human readable name for this extension (ie 'Your Extension Name')                                              |
| - [description](#description )           | No      | string          | No         | -                       | A one to two sentence description of what this extension does                                                  |
| - [icon](#icon )                         | No      | string          | No         | -                       | The file name of this extension's icon                                                                         |
| - [billingRequired](#billingRequired )   | No      | boolean         | No         | -                       | Whether this extension requires a billing to be enabled on the project it is installed on                      |
| - [tags](#tags )                         | No      | array of string | No         | -                       | A list of tags to help users find your extension in search                                                     |
| - [sourceUrl](#sourceUrl )               | No      | string          | No         | -                       | The URL of the GitHub repo hosting this code                                                                   |
| - [releaseNotesUrl](#releaseNotesUrl )   | No      | string          | No         | -                       | A URL where users can view the full changelog or release notes for this extension                              |
| - [author](#author )                     | No      | object          | No         | In #/definitions/author | -                                                                                                              |
| - [contributors](#contributors )         | No      | array           | No         | -                       | -                                                                                                              |
| - [apis](#apis )                         | No      | array           | No         | -                       | -                                                                                                              |
| - [roles](#roles )                       | No      | array           | No         | -                       | -                                                                                                              |
| - [externalServices](#externalServices ) | No      | array           | No         | -                       | -                                                                                                              |
| - [params](#params )                     | No      | array           | No         | -                       | -                                                                                                              |
| - [resources](#resources )               | No      | array           | No         | -                       | -                                                                                                              |
| - [lifecycleEvents](#lifecycleEvents )   | No      | array           | No         | -                       | -                                                                                                              |
| - [events](#events )                     | No      | array           | No         | -                       | -                                                                                                              |

## <a name="name"></a>1. Property `root > name`

|              |          |
| ------------ | -------- |
| **Type**     | `string` |
| **Required** | No       |

**Description:** ID of this extension (ie your-extension-name)

## <a name="version"></a>2. Property `root > version`

|              |          |
| ------------ | -------- |
| **Type**     | `string` |
| **Required** | No       |

**Description:** Version of this extension. Follows https://semver.org/.

## <a name="specVersion"></a>3. Property `root > specVersion`

|              |          |
| ------------ | -------- |
| **Type**     | `string` |
| **Required** | No       |

**Description:** Version of the extension.yaml spec that this file follows. Currently always 'v1beta'

## <a name="license"></a>4. Property `root > license`

|              |          |
| ------------ | -------- |
| **Type**     | `string` |
| **Required** | No       |

**Description:** The software license agreement for this extension. Currently, only 'Apache-2.0' is permitted on extensions.dev

## <a name="displayName"></a>5. Property `root > displayName`

|              |          |
| ------------ | -------- |
| **Type**     | `string` |
| **Required** | No       |

**Description:** Human readable name for this extension (ie 'Your Extension Name')

## <a name="description"></a>6. Property `root > description`

|              |          |
| ------------ | -------- |
| **Type**     | `string` |
| **Required** | No       |

**Description:** A one to two sentence description of what this extension does

## <a name="icon"></a>7. Property `root > icon`

|              |          |
| ------------ | -------- |
| **Type**     | `string` |
| **Required** | No       |

**Description:** The file name of this extension's icon

## <a name="billingRequired"></a>8. Property `root > billingRequired`

|              |           |
| ------------ | --------- |
| **Type**     | `boolean` |
| **Required** | No        |

**Description:** Whether this extension requires a billing to be enabled on the project it is installed on

## <a name="tags"></a>9. Property `root > tags`

|              |                   |
| ------------ | ----------------- |
| **Type**     | `array of string` |
| **Required** | No                |

**Description:** A list of tags to help users find your extension in search

|                      | Array restrictions |
| -------------------- | ------------------ |
| **Min items**        | N/A                |
| **Max items**        | N/A                |
| **Items unicity**    | False              |
| **Additional items** | False              |
| **Tuple validation** | See below          |

| Each item of this array must be | Description |
| ------------------------------- | ----------- |
| [tags items](#tags_items)       | -           |

### <a name="tags_items"></a>9.1. root > tags > tags items

|              |          |
| ------------ | -------- |
| **Type**     | `string` |
| **Required** | No       |

## <a name="sourceUrl"></a>10. Property `root > sourceUrl`

|              |          |
| ------------ | -------- |
| **Type**     | `string` |
| **Required** | No       |

**Description:** The URL of the GitHub repo hosting this code

## <a name="releaseNotesUrl"></a>11. Property `root > releaseNotesUrl`

|              |          |
| ------------ | -------- |
| **Type**     | `string` |
| **Required** | No       |

**Description:** A URL where users can view the full changelog or release notes for this extension

## <a name="author"></a>12. Property `root > author`

|                           |                      |
| ------------------------- | -------------------- |
| **Type**                  | `object`             |
| **Required**              | No                   |
| **Additional properties** | Not allowed          |
| **Defined in**            | #/definitions/author |

| Property                            | Pattern | Type   | Deprecated | Definition | Title/Description              |
| ----------------------------------- | ------- | ------ | ---------- | ---------- | ------------------------------ |
| - [authorName](#author_authorName ) | No      | string | No         | -          | The author's name              |
| - [email](#author_email )           | No      | string | No         | -          | A contact email for the author |
| - [url](#author_url )               | No      | string | No         | -          | URL of the author's website    |

### <a name="author_authorName"></a>12.1. Property `root > author > authorName`

|              |          |
| ------------ | -------- |
| **Type**     | `string` |
| **Required** | No       |

**Description:** The author's name

### <a name="author_email"></a>12.2. Property `root > author > email`

|              |          |
| ------------ | -------- |
| **Type**     | `string` |
| **Required** | No       |

**Description:** A contact email for the author

### <a name="author_url"></a>12.3. Property `root > author > url`

|              |          |
| ------------ | -------- |
| **Type**     | `string` |
| **Required** | No       |

**Description:** URL of the author's website

## <a name="contributors"></a>13. Property `root > contributors`

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

| Each item of this array must be | Description |
| ------------------------------- | ----------- |
| [author](#contributors_items)   | -           |

### <a name="contributors_items"></a>13.1. root > contributors > author

|                           |                   |
| ------------------------- | ----------------- |
| **Type**                  | `object`          |
| **Required**              | No                |
| **Additional properties** | Not allowed       |
| **Same definition as**    | [author](#author) |

## <a name="apis"></a>14. Property `root > apis`

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

| Each item of this array must be | Description                                                                   |
| ------------------------------- | ----------------------------------------------------------------------------- |
| [api](#apis_items)              | A Google API used by this extension. Will be enabled on extension deployment. |

### <a name="apis_items"></a>14.1. root > apis > api

|                           |                   |
| ------------------------- | ----------------- |
| **Type**                  | `object`          |
| **Required**              | No                |
| **Additional properties** | Not allowed       |
| **Defined in**            | #/definitions/api |

**Description:** A Google API used by this extension. Will be enabled on extension deployment.

| Property                          | Pattern | Type   | Deprecated | Definition | Title/Description                                                                                                       |
| --------------------------------- | ------- | ------ | ---------- | ---------- | ----------------------------------------------------------------------------------------------------------------------- |
| + [apiName](#apis_items_apiName ) | No      | string | No         | -          | Name of the Google API to enable. Should match the service name listed in https://console.cloud.google.com/apis/library |
| + [reason](#apis_items_reason )   | No      | string | No         | -          | Why this extension needs this API enabled                                                                               |

#### <a name="apis_items_apiName"></a>14.1.1. Property `root > apis > apis items > apiName`

|              |          |
| ------------ | -------- |
| **Type**     | `string` |
| **Required** | Yes      |

**Description:** Name of the Google API to enable. Should match the service name listed in https://console.cloud.google.com/apis/library

| Restrictions                      |                                                                                                         |
| --------------------------------- | ------------------------------------------------------------------------------------------------------- |
| **Must match regular expression** | ```[^\.]+\.googleapis\.com``` [Test](https://regex101.com/?regex=%5B%5E%5C.%5D%2B%5C.googleapis%5C.com) |

#### <a name="apis_items_reason"></a>14.1.2. Property `root > apis > apis items > reason`

|              |          |
| ------------ | -------- |
| **Type**     | `string` |
| **Required** | Yes      |

**Description:** Why this extension needs this API enabled

## <a name="roles"></a>15. Property `root > roles`

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

| Each item of this array must be | Description                             |
| ------------------------------- | --------------------------------------- |
| [role](#roles_items)            | An IAM role to grant to this extension. |

### <a name="roles_items"></a>15.1. root > roles > role

|                           |                    |
| ------------------------- | ------------------ |
| **Type**                  | `object`           |
| **Required**              | No                 |
| **Additional properties** | Not allowed        |
| **Defined in**            | #/definitions/role |

**Description:** An IAM role to grant to this extension.

| Property                             | Pattern | Type   | Deprecated | Definition | Title/Description                                                                                                                                  |
| ------------------------------------ | ------- | ------ | ---------- | ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| + [role](#roles_items_role )         | No      | string | No         | -          | Name of the IAM role to grant. Must be on the list of allowed roles: https://firebase.google.com/docs/extensions/publishers/access#supported-roles |
| + [reason](#roles_items_reason )     | No      | string | No         | -          | Why this extension needs this IAM role                                                                                                             |
| - [resource](#roles_items_resource ) | No      | string | No         | -          | What resource to grant this role on. If omitted, defaults to projects/${project_id}                                                                |

#### <a name="roles_items_role"></a>15.1.1. Property `root > roles > roles items > role`

|              |          |
| ------------ | -------- |
| **Type**     | `string` |
| **Required** | Yes      |

**Description:** Name of the IAM role to grant. Must be on the list of allowed roles: https://firebase.google.com/docs/extensions/publishers/access#supported-roles

| Restrictions                      |                                                                                                   |
| --------------------------------- | ------------------------------------------------------------------------------------------------- |
| **Must match regular expression** | ```[a-zA-Z]+\.[a-zA-Z]+``` [Test](https://regex101.com/?regex=%5Ba-zA-Z%5D%2B%5C.%5Ba-zA-Z%5D%2B) |

#### <a name="roles_items_reason"></a>15.1.2. Property `root > roles > roles items > reason`

|              |          |
| ------------ | -------- |
| **Type**     | `string` |
| **Required** | Yes      |

**Description:** Why this extension needs this IAM role

#### <a name="roles_items_resource"></a>15.1.3. Property `root > roles > roles items > resource`

|              |          |
| ------------ | -------- |
| **Type**     | `string` |
| **Required** | No       |

**Description:** What resource to grant this role on. If omitted, defaults to projects/${project_id}

## <a name="externalServices"></a>16. Property `root > externalServices`

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

| Each item of this array must be            | Description                             |
| ------------------------------------------ | --------------------------------------- |
| [externalService](#externalServices_items) | A non-Google API used by this extension |

### <a name="externalServices_items"></a>16.1. root > externalServices > externalService

|                           |                               |
| ------------------------- | ----------------------------- |
| **Type**                  | `object`                      |
| **Required**              | No                            |
| **Additional properties** | Not allowed                   |
| **Defined in**            | #/definitions/externalService |

**Description:** A non-Google API used by this extension

| Property                                            | Pattern | Type   | Deprecated | Definition | Title/Description                          |
| --------------------------------------------------- | ------- | ------ | ---------- | ---------- | ------------------------------------------ |
| - [name](#externalServices_items_name )             | No      | string | No         | -          | Name of the external service               |
| - [pricingUri](#externalServices_items_pricingUri ) | No      | string | No         | -          | URI to pricing information for the service |

#### <a name="externalServices_items_name"></a>16.1.1. Property `root > externalServices > externalServices items > name`

|              |          |
| ------------ | -------- |
| **Type**     | `string` |
| **Required** | No       |

**Description:** Name of the external service

#### <a name="externalServices_items_pricingUri"></a>16.1.2. Property `root > externalServices > externalServices items > pricingUri`

|              |          |
| ------------ | -------- |
| **Type**     | `string` |
| **Required** | No       |

**Description:** URI to pricing information for the service

## <a name="params"></a>17. Property `root > params`

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

| Each item of this array must be | Description                                                    |
| ------------------------------- | -------------------------------------------------------------- |
| [param](#params_items)          | A parameter that users installing this extension can configure |

### <a name="params_items"></a>17.1. root > params > param

|                           |                     |
| ------------------------- | ------------------- |
| **Type**                  | `object`            |
| **Required**              | No                  |
| **Additional properties** | Not allowed         |
| **Defined in**            | #/definitions/param |

**Description:** A parameter that users installing this extension can configure

| Property                                                          | Pattern | Type    | Deprecated | Definition | Title/Description                                                                                                                                                                                              |
| ----------------------------------------------------------------- | ------- | ------- | ---------- | ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| + [param](#params_items_param )                                   | No      | string  | No         | -          | The name of the param. This is how you reference the param in your code                                                                                                                                        |
| - [label](#params_items_label )                                   | No      | string  | No         | -          | Short description for the parameter. Displayed to users when they're prompted for the parameter's value.                                                                                                       |
| - [description](#params_items_description )                       | No      | string  | No         | -          | Detailed description for the parameter. Displayed to users when they're prompted for the parameter's value.                                                                                                    |
| - [example](#params_items_example )                               | No      | string  | No         | -          | Example value for the parameter.                                                                                                                                                                               |
| - [validationRegex](#params_items_validationRegex )               | No      | string  | No         | -          | Regular expression for validation of the parameter's user-configured value. Uses Google RE2 syntax.                                                                                                            |
| - [validationErrorMessage](#params_items_validationErrorMessage ) | No      | string  | No         | -          | Error message to display if regex validation fails.                                                                                                                                                            |
| - [default](#params_items_default )                               | No      | string  | No         | -          | Default value for the parameter if the user leaves the parameter's value blank.                                                                                                                                |
| - [required](#params_items_required )                             | No      | boolean | No         | -          | Defines whether the user can submit an empty string when they're prompted for the parameter's value. Defaults to true.                                                                                         |
| - [immutable](#params_items_immutable )                           | No      | boolean | No         | -          | Defines whether the user can change the parameter's value after installation (such as if they reconfigure the extension). Defaults to false.                                                                   |
| - [advanced](#params_items_advanced )                             | No      | boolean | No         | -          | Whether this a param for advanced users. When true, only users who choose 'advanced configuration' will see this param.                                                                                        |
| - [type](#params_items_type )                                     | No      | string  | No         | -          | The parameter type. Special parameter types might have additional requirements or different UI presentation. See https://firebase.google.com/docs/extensions/reference/extension-yaml#params for more details. |
| - [resourceType](#params_items_resourceType )                     | No      | string  | No         | -          | The type of resource to prompt the user to select. Provides a special UI treatment for the param.                                                                                                              |
| - [options](#params_items_options )                               | No      | array   | No         | -          | Options for a select or multiSelect type param.                                                                                                                                                                |

#### <a name="params_items_param"></a>17.1.1. Property `root > params > params items > param`

|              |          |
| ------------ | -------- |
| **Type**     | `string` |
| **Required** | Yes      |

**Description:** The name of the param. This is how you reference the param in your code

#### <a name="params_items_label"></a>17.1.2. Property `root > params > params items > label`

|              |          |
| ------------ | -------- |
| **Type**     | `string` |
| **Required** | No       |

**Description:** Short description for the parameter. Displayed to users when they're prompted for the parameter's value.

#### <a name="params_items_description"></a>17.1.3. Property `root > params > params items > description`

|              |          |
| ------------ | -------- |
| **Type**     | `string` |
| **Required** | No       |

**Description:** Detailed description for the parameter. Displayed to users when they're prompted for the parameter's value.

#### <a name="params_items_example"></a>17.1.4. Property `root > params > params items > example`

|              |          |
| ------------ | -------- |
| **Type**     | `string` |
| **Required** | No       |

**Description:** Example value for the parameter.

#### <a name="params_items_validationRegex"></a>17.1.5. Property `root > params > params items > validationRegex`

|              |          |
| ------------ | -------- |
| **Type**     | `string` |
| **Required** | No       |

**Description:** Regular expression for validation of the parameter's user-configured value. Uses Google RE2 syntax.

#### <a name="params_items_validationErrorMessage"></a>17.1.6. Property `root > params > params items > validationErrorMessage`

|              |          |
| ------------ | -------- |
| **Type**     | `string` |
| **Required** | No       |

**Description:** Error message to display if regex validation fails.

#### <a name="params_items_default"></a>17.1.7. Property `root > params > params items > default`

|              |          |
| ------------ | -------- |
| **Type**     | `string` |
| **Required** | No       |

**Description:** Default value for the parameter if the user leaves the parameter's value blank.

#### <a name="params_items_required"></a>17.1.8. Property `root > params > params items > required`

|              |           |
| ------------ | --------- |
| **Type**     | `boolean` |
| **Required** | No        |

**Description:** Defines whether the user can submit an empty string when they're prompted for the parameter's value. Defaults to true.

#### <a name="params_items_immutable"></a>17.1.9. Property `root > params > params items > immutable`

|              |           |
| ------------ | --------- |
| **Type**     | `boolean` |
| **Required** | No        |

**Description:** Defines whether the user can change the parameter's value after installation (such as if they reconfigure the extension). Defaults to false.

#### <a name="params_items_advanced"></a>17.1.10. Property `root > params > params items > advanced`

|              |           |
| ------------ | --------- |
| **Type**     | `boolean` |
| **Required** | No        |

**Description:** Whether this a param for advanced users. When true, only users who choose 'advanced configuration' will see this param.

#### <a name="params_items_type"></a>17.1.11. Property `root > params > params items > type`

|              |          |
| ------------ | -------- |
| **Type**     | `string` |
| **Required** | No       |

**Description:** The parameter type. Special parameter types might have additional requirements or different UI presentation. See https://firebase.google.com/docs/extensions/reference/extension-yaml#params for more details.

| Restrictions                      |                                                                                                                                                       |
| --------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Must match regular expression** | ```string\|select\|multiSelect\|secret\|selectResource``` [Test](https://regex101.com/?regex=string%7Cselect%7CmultiSelect%7Csecret%7CselectResource) |

#### <a name="params_items_resourceType"></a>17.1.12. Property `root > params > params items > resourceType`

|              |          |
| ------------ | -------- |
| **Type**     | `string` |
| **Required** | No       |

**Description:** The type of resource to prompt the user to select. Provides a special UI treatment for the param.

| Restrictions                      |                                                                                                                                                                                                                                                                                                                             |
| --------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Must match regular expression** | ```storage\.googleapis\.com\/Bucket\|firestore\.googleapis\.com\/Database\|firebasedatabase\.googleapis\.com\/DatabaseInstance``` [Test](https://regex101.com/?regex=storage%5C.googleapis%5C.com%5C%2FBucket%7Cfirestore%5C.googleapis%5C.com%5C%2FDatabase%7Cfirebasedatabase%5C.googleapis%5C.com%5C%2FDatabaseInstance) |

#### <a name="params_items_options"></a>17.1.13. Property `root > params > params items > options`

|              |         |
| ------------ | ------- |
| **Type**     | `array` |
| **Required** | No      |

**Description:** Options for a select or multiSelect type param.

|                      | Array restrictions |
| -------------------- | ------------------ |
| **Min items**        | N/A                |
| **Max items**        | N/A                |
| **Items unicity**    | False              |
| **Additional items** | False              |
| **Tuple validation** | See below          |

| Each item of this array must be            | Description |
| ------------------------------------------ | ----------- |
| [paramOption](#params_items_options_items) | -           |

##### <a name="params_items_options_items"></a>17.1.13.1. root > params > params items > options > paramOption

|                           |                           |
| ------------------------- | ------------------------- |
| **Type**                  | `object`                  |
| **Required**              | No                        |
| **Additional properties** | Not allowed               |
| **Defined in**            | #/definitions/paramOption |

| Property                                      | Pattern | Type   | Deprecated | Definition | Title/Description                                                                                           |
| --------------------------------------------- | ------- | ------ | ---------- | ---------- | ----------------------------------------------------------------------------------------------------------- |
| + [value](#params_items_options_items_value ) | No      | string | No         | -          | One of the values the user can choose. This is the value you get when you read the parameter value in code. |
| - [label](#params_items_options_items_label ) | No      | string | No         | -          | Short description of the selectable option. If omitted, defaults to value.                                  |

###### <a name="params_items_options_items_value"></a>17.1.13.1.1. Property `root > params > params items > options > options items > value`

|              |          |
| ------------ | -------- |
| **Type**     | `string` |
| **Required** | Yes      |

**Description:** One of the values the user can choose. This is the value you get when you read the parameter value in code.

###### <a name="params_items_options_items_label"></a>17.1.13.1.2. Property `root > params > params items > options > options items > label`

|              |          |
| ------------ | -------- |
| **Type**     | `string` |
| **Required** | No       |

**Description:** Short description of the selectable option. If omitted, defaults to value.

## <a name="resources"></a>18. Property `root > resources`

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

| Each item of this array must be | Description |
| ------------------------------- | ----------- |
| [resource](#resources_items)    | -           |

### <a name="resources_items"></a>18.1. root > resources > resource

|                           |                        |
| ------------------------- | ---------------------- |
| **Type**                  | `object`               |
| **Required**              | No                     |
| **Additional properties** | Not allowed            |
| **Defined in**            | #/definitions/resource |

| Property                                       | Pattern | Type   | Deprecated | Definition | Title/Description                                                                                                                             |
| ---------------------------------------------- | ------- | ------ | ---------- | ---------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| + [name](#resources_items_name )               | No      | string | No         | -          | The name of this resource                                                                                                                     |
| + [type](#resources_items_type )               | No      | string | No         | -          | What type of resource this is. See https://firebase.google.com/docs/extensions/reference/extension-yaml#resources for a full list of options. |
| + [description](#resources_items_description ) | No      | string | No         | -          | A brief description of what this resource does                                                                                                |
| + [properties](#resources_items_properties )   | No      | object | No         | -          | The properties of this resource                                                                                                               |

#### <a name="resources_items_name"></a>18.1.1. Property `root > resources > resources items > name`

|              |          |
| ------------ | -------- |
| **Type**     | `string` |
| **Required** | Yes      |

**Description:** The name of this resource

#### <a name="resources_items_type"></a>18.1.2. Property `root > resources > resources items > type`

|              |          |
| ------------ | -------- |
| **Type**     | `string` |
| **Required** | Yes      |

**Description:** What type of resource this is. See https://firebase.google.com/docs/extensions/reference/extension-yaml#resources for a full list of options.

#### <a name="resources_items_description"></a>18.1.3. Property `root > resources > resources items > description`

|              |          |
| ------------ | -------- |
| **Type**     | `string` |
| **Required** | Yes      |

**Description:** A brief description of what this resource does

#### <a name="resources_items_properties"></a>18.1.4. Property `root > resources > resources items > properties`

|                           |                  |
| ------------------------- | ---------------- |
| **Type**                  | `object`         |
| **Required**              | Yes              |
| **Additional properties** | Any type allowed |

**Description:** The properties of this resource

| Property                                                              | Pattern | Type   | Deprecated | Definition | Title/Description                                                                                                                               |
| --------------------------------------------------------------------- | ------- | ------ | ---------- | ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| - [location](#resources_items_properties_location )                   | No      | string | No         | -          | The location for this resource                                                                                                                  |
| - [entryPoint](#resources_items_properties_entryPoint )               | No      | string | No         | -          | The entry point for a function resource                                                                                                         |
| - [sourceDirectory](#resources_items_properties_sourceDirectory )     | No      | string | No         | -          | Directory that contains your package.json at its root. The file for your functions source code must be in this directory. Defaults to functions |
| - [timeout](#resources_items_properties_timeout )                     | No      | string | No         | -          | A function resources's maximum execution time.                                                                                                  |
| - [availableMemoryMb](#resources_items_properties_availableMemoryMb ) | No      | string | No         | -          | Amount of memory in MB available for the function.                                                                                              |
| - [runtime](#resources_items_properties_runtime )                     | No      | string | No         | -          | Runtime environment for the function. Defaults to the most recent LTS version of node.                                                          |
| - [httpsTrigger](#resources_items_properties_httpsTrigger )           | No      | object | No         | -          | A function triggered by HTTPS calls                                                                                                             |
| - [eventTrigger](#resources_items_properties_eventTrigger )           | No      | object | No         | -          | A function triggered by a background event                                                                                                      |
| - [scheduleTrigger](#resources_items_properties_scheduleTrigger )     | No      | object | No         | -          | A function triggered at a regular interval by a Cloud Scheduler job                                                                             |
| - [taskQueueTrigger](#resources_items_properties_taskQueueTrigger )   | No      | object | No         | -          | A function triggered by a Cloud Task                                                                                                            |
| - [buildConfig](#resources_items_properties_buildConfig )             | No      | object | No         | -          | Build configuration for a  gen 2 Cloud Function                                                                                                 |
| - [serviceConfig](#resources_items_properties_serviceConfig )         | No      | object | No         | -          | Service configuration for a  gen 2 Cloud Function                                                                                               |
| - [](#resources_items_properties_additionalProperties )               | No      | object | No         | -          | -                                                                                                                                               |

##### <a name="resources_items_properties_location"></a>18.1.4.1. Property `root > resources > resources items > properties > location`

|              |          |
| ------------ | -------- |
| **Type**     | `string` |
| **Required** | No       |

**Description:** The location for this resource

##### <a name="resources_items_properties_entryPoint"></a>18.1.4.2. Property `root > resources > resources items > properties > entryPoint`

|              |          |
| ------------ | -------- |
| **Type**     | `string` |
| **Required** | No       |

**Description:** The entry point for a function resource

##### <a name="resources_items_properties_sourceDirectory"></a>18.1.4.3. Property `root > resources > resources items > properties > sourceDirectory`

|              |          |
| ------------ | -------- |
| **Type**     | `string` |
| **Required** | No       |

**Description:** Directory that contains your package.json at its root. The file for your functions source code must be in this directory. Defaults to functions

##### <a name="resources_items_properties_timeout"></a>18.1.4.4. Property `root > resources > resources items > properties > timeout`

|              |          |
| ------------ | -------- |
| **Type**     | `string` |
| **Required** | No       |

**Description:** A function resources's maximum execution time.

| Restrictions                      |                                                         |
| --------------------------------- | ------------------------------------------------------- |
| **Must match regular expression** | ```\d+s``` [Test](https://regex101.com/?regex=%5Cd%2Bs) |

##### <a name="resources_items_properties_availableMemoryMb"></a>18.1.4.5. Property `root > resources > resources items > properties > availableMemoryMb`

|              |          |
| ------------ | -------- |
| **Type**     | `string` |
| **Required** | No       |

**Description:** Amount of memory in MB available for the function.

| Restrictions                      |                                                       |
| --------------------------------- | ----------------------------------------------------- |
| **Must match regular expression** | ```\d+``` [Test](https://regex101.com/?regex=%5Cd%2B) |

##### <a name="resources_items_properties_runtime"></a>18.1.4.6. Property `root > resources > resources items > properties > runtime`

|              |          |
| ------------ | -------- |
| **Type**     | `string` |
| **Required** | No       |

**Description:** Runtime environment for the function. Defaults to the most recent LTS version of node.

##### <a name="resources_items_properties_httpsTrigger"></a>18.1.4.7. Property `root > resources > resources items > properties > httpsTrigger`

|                           |                  |
| ------------------------- | ---------------- |
| **Type**                  | `object`         |
| **Required**              | No               |
| **Additional properties** | Any type allowed |

**Description:** A function triggered by HTTPS calls

##### <a name="resources_items_properties_eventTrigger"></a>18.1.4.8. Property `root > resources > resources items > properties > eventTrigger`

|                           |                  |
| ------------------------- | ---------------- |
| **Type**                  | `object`         |
| **Required**              | No               |
| **Additional properties** | Any type allowed |

**Description:** A function triggered by a background event

| Property                                                                   | Pattern | Type   | Deprecated | Definition | Title/Description                                                                                                                                                                                                                   |
| -------------------------------------------------------------------------- | ------- | ------ | ---------- | ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| + [eventType](#resources_items_properties_eventTrigger_eventType )         | No      | string | No         | -          | The type of background event to trigger on. See https://firebase.google.com/docs/extensions/publishers/functions#supported for a full list.                                                                                         |
| - [resource](#resources_items_properties_eventTrigger_resource )           | No      | string | No         | -          | The name or pattern of the resource to trigger on                                                                                                                                                                                   |
| - [eventFilters](#resources_items_properties_eventTrigger_eventFilters )   | No      | array  | No         | -          | Filters that further limit the events to listen to.                                                                                                                                                                                 |
| - [channel](#resources_items_properties_eventTrigger_channel )             | No      | string | No         | -          | The name of the channel associated with the trigger in projects/{project}/locations/{location}/channels/{channel} format. If you omit this property, the function will listen for events on the project's default channel.          |
| - [triggerRegion](#resources_items_properties_eventTrigger_triggerRegion ) | No      | string | No         | -          | The trigger will only receive events originating in this region. It can be the same region as the function, a different region or multi-region, or the global region. If not provided, defaults to the same region as the function. |

###### <a name="resources_items_properties_eventTrigger_eventType"></a>18.1.4.8.1. Property `root > resources > resources items > properties > eventTrigger > eventType`

|              |          |
| ------------ | -------- |
| **Type**     | `string` |
| **Required** | Yes      |

**Description:** The type of background event to trigger on. See https://firebase.google.com/docs/extensions/publishers/functions#supported for a full list.

###### <a name="resources_items_properties_eventTrigger_resource"></a>18.1.4.8.2. Property `root > resources > resources items > properties > eventTrigger > resource`

|              |          |
| ------------ | -------- |
| **Type**     | `string` |
| **Required** | No       |

**Description:** The name or pattern of the resource to trigger on

###### <a name="resources_items_properties_eventTrigger_eventFilters"></a>18.1.4.8.3. Property `root > resources > resources items > properties > eventTrigger > eventFilters`

|              |         |
| ------------ | ------- |
| **Type**     | `array` |
| **Required** | No      |

**Description:** Filters that further limit the events to listen to.

|                      | Array restrictions |
| -------------------- | ------------------ |
| **Min items**        | N/A                |
| **Max items**        | N/A                |
| **Items unicity**    | False              |
| **Additional items** | False              |
| **Tuple validation** | See below          |

| Each item of this array must be                                            | Description |
| -------------------------------------------------------------------------- | ----------- |
| [eventFilter](#resources_items_properties_eventTrigger_eventFilters_items) | -           |

###### <a name="resources_items_properties_eventTrigger_eventFilters_items"></a>18.1.4.8.3.1. root > resources > resources items > properties > eventTrigger > eventFilters > eventFilter

|                           |                           |
| ------------------------- | ------------------------- |
| **Type**                  | `object`                  |
| **Required**              | No                        |
| **Additional properties** | Any type allowed          |
| **Defined in**            | #/definitions/eventFilter |

| Property                                                                              | Pattern | Type   | Deprecated | Definition | Title/Description                |
| ------------------------------------------------------------------------------------- | ------- | ------ | ---------- | ---------- | -------------------------------- |
| - [attribute](#resources_items_properties_eventTrigger_eventFilters_items_attribute ) | No      | string | No         | -          | The event attribute to filter on |
| - [value](#resources_items_properties_eventTrigger_eventFilters_items_value )         | No      | string | No         | -          | The value to filter for          |

###### <a name="resources_items_properties_eventTrigger_eventFilters_items_attribute"></a>18.1.4.8.3.1.1. Property `root > resources > resources items > properties > eventTrigger > eventFilters > eventFilters items > attribute`

|              |          |
| ------------ | -------- |
| **Type**     | `string` |
| **Required** | No       |

**Description:** The event attribute to filter on

###### <a name="resources_items_properties_eventTrigger_eventFilters_items_value"></a>18.1.4.8.3.1.2. Property `root > resources > resources items > properties > eventTrigger > eventFilters > eventFilters items > value`

|              |          |
| ------------ | -------- |
| **Type**     | `string` |
| **Required** | No       |

**Description:** The value to filter for

###### <a name="resources_items_properties_eventTrigger_channel"></a>18.1.4.8.4. Property `root > resources > resources items > properties > eventTrigger > channel`

|              |          |
| ------------ | -------- |
| **Type**     | `string` |
| **Required** | No       |

**Description:** The name of the channel associated with the trigger in projects/{project}/locations/{location}/channels/{channel} format. If you omit this property, the function will listen for events on the project's default channel.

###### <a name="resources_items_properties_eventTrigger_triggerRegion"></a>18.1.4.8.5. Property `root > resources > resources items > properties > eventTrigger > triggerRegion`

|              |          |
| ------------ | -------- |
| **Type**     | `string` |
| **Required** | No       |

**Description:** The trigger will only receive events originating in this region. It can be the same region as the function, a different region or multi-region, or the global region. If not provided, defaults to the same region as the function.

##### <a name="resources_items_properties_scheduleTrigger"></a>18.1.4.9. Property `root > resources > resources items > properties > scheduleTrigger`

|                           |                  |
| ------------------------- | ---------------- |
| **Type**                  | `object`         |
| **Required**              | No               |
| **Additional properties** | Any type allowed |

**Description:** A function triggered at a regular interval by a Cloud Scheduler job

| Property                                                            | Pattern | Type   | Deprecated | Definition | Title/Description                                                                                                                                                                                                                                                                             |
| ------------------------------------------------------------------- | ------- | ------ | ---------- | ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| + [schedule](#resources_items_properties_scheduleTrigger_schedule ) | No      | string | No         | -          | The frequency at which you want the function to run. Accepts unix-cron (https://cloud.google.com/scheduler/docs/configuring/cron-job-schedules) or App Engine (https://cloud.google.com/appengine/docs/standard/nodejs/scheduling-jobs-with-cron-yaml#defining_the_cron_job_schedule) syntax. |
| - [timeZone](#resources_items_properties_scheduleTrigger_timeZone ) | No      | string | No         | -          | The time zone in which the schedule will run. Defaults to UTC.                                                                                                                                                                                                                                |

###### <a name="resources_items_properties_scheduleTrigger_schedule"></a>18.1.4.9.1. Property `root > resources > resources items > properties > scheduleTrigger > schedule`

|              |          |
| ------------ | -------- |
| **Type**     | `string` |
| **Required** | Yes      |

**Description:** The frequency at which you want the function to run. Accepts unix-cron (https://cloud.google.com/scheduler/docs/configuring/cron-job-schedules) or App Engine (https://cloud.google.com/appengine/docs/standard/nodejs/scheduling-jobs-with-cron-yaml#defining_the_cron_job_schedule) syntax.

###### <a name="resources_items_properties_scheduleTrigger_timeZone"></a>18.1.4.9.2. Property `root > resources > resources items > properties > scheduleTrigger > timeZone`

|              |          |
| ------------ | -------- |
| **Type**     | `string` |
| **Required** | No       |

**Description:** The time zone in which the schedule will run. Defaults to UTC.

##### <a name="resources_items_properties_taskQueueTrigger"></a>18.1.4.10. Property `root > resources > resources items > properties > taskQueueTrigger`

|                           |                  |
| ------------------------- | ---------------- |
| **Type**                  | `object`         |
| **Required**              | No               |
| **Additional properties** | Any type allowed |

**Description:** A function triggered by a Cloud Task

##### <a name="resources_items_properties_buildConfig"></a>18.1.4.11. Property `root > resources > resources items > properties > buildConfig`

|                           |                  |
| ------------------------- | ---------------- |
| **Type**                  | `object`         |
| **Required**              | No               |
| **Additional properties** | Any type allowed |

**Description:** Build configuration for a  gen 2 Cloud Function

| Property                                                            | Pattern | Type   | Deprecated | Definition | Title/Description                                                                      |
| ------------------------------------------------------------------- | ------- | ------ | ---------- | ---------- | -------------------------------------------------------------------------------------- |
| - [runtime](#resources_items_properties_buildConfig_runtime )       | No      | string | No         | -          | Runtime environment for the function. Defaults to the most recent LTS version of node. |
| - [entryPoint](#resources_items_properties_buildConfig_entryPoint ) | No      | string | No         | -          | The entry point for a function resource                                                |

###### <a name="resources_items_properties_buildConfig_runtime"></a>18.1.4.11.1. Property `root > resources > resources items > properties > buildConfig > runtime`

|              |          |
| ------------ | -------- |
| **Type**     | `string` |
| **Required** | No       |

**Description:** Runtime environment for the function. Defaults to the most recent LTS version of node.

###### <a name="resources_items_properties_buildConfig_entryPoint"></a>18.1.4.11.2. Property `root > resources > resources items > properties > buildConfig > entryPoint`

|              |          |
| ------------ | -------- |
| **Type**     | `string` |
| **Required** | No       |

**Description:** The entry point for a function resource

##### <a name="resources_items_properties_serviceConfig"></a>18.1.4.12. Property `root > resources > resources items > properties > serviceConfig`

|                           |                  |
| ------------------------- | ---------------- |
| **Type**                  | `object`         |
| **Required**              | No               |
| **Additional properties** | Any type allowed |

**Description:** Service configuration for a  gen 2 Cloud Function

| Property                                                                        | Pattern | Type   | Deprecated | Definition | Title/Description                                                                                                                                                |
| ------------------------------------------------------------------------------- | ------- | ------ | ---------- | ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| - [timeoutSeconds](#resources_items_properties_serviceConfig_timeoutSeconds )   | No      | string | No         | -          | The function's maximum execution time. Default: 60, max value: 540.                                                                                              |
| - [availableMemory](#resources_items_properties_serviceConfig_availableMemory ) | No      | string | No         | -          | The amount of memory available for a function. Defaults to 256M. Supported units are k, M, G, Mi, Gi. If no unit is supplied, the value is interpreted as bytes. |

###### <a name="resources_items_properties_serviceConfig_timeoutSeconds"></a>18.1.4.12.1. Property `root > resources > resources items > properties > serviceConfig > timeoutSeconds`

|              |          |
| ------------ | -------- |
| **Type**     | `string` |
| **Required** | No       |

**Description:** The function's maximum execution time. Default: 60, max value: 540.

###### <a name="resources_items_properties_serviceConfig_availableMemory"></a>18.1.4.12.2. Property `root > resources > resources items > properties > serviceConfig > availableMemory`

|              |          |
| ------------ | -------- |
| **Type**     | `string` |
| **Required** | No       |

**Description:** The amount of memory available for a function. Defaults to 256M. Supported units are k, M, G, Mi, Gi. If no unit is supplied, the value is interpreted as bytes.

## <a name="lifecycleEvents"></a>19. Property `root > lifecycleEvents`

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

| Each item of this array must be          | Description |
| ---------------------------------------- | ----------- |
| [lifecycleEvent](#lifecycleEvents_items) | -           |

### <a name="lifecycleEvents_items"></a>19.1. root > lifecycleEvents > lifecycleEvent

|                           |                              |
| ------------------------- | ---------------------------- |
| **Type**                  | `object`                     |
| **Required**              | No                           |
| **Additional properties** | Not allowed                  |
| **Defined in**            | #/definitions/lifecycleEvent |

| Property                                             | Pattern | Type   | Deprecated | Definition                                             | Title/Description |
| ---------------------------------------------------- | ------- | ------ | ---------- | ------------------------------------------------------ | ----------------- |
| - [onInstall](#lifecycleEvents_items_onInstall )     | No      | object | No         | In #/definitions/lifecycleEventSpec                    | -                 |
| - [onUpdate](#lifecycleEvents_items_onUpdate )       | No      | object | No         | Same as [onInstall](#lifecycleEvents_items_onInstall ) | -                 |
| - [onConfigure](#lifecycleEvents_items_onConfigure ) | No      | object | No         | Same as [onInstall](#lifecycleEvents_items_onInstall ) | -                 |

#### <a name="lifecycleEvents_items_onInstall"></a>19.1.1. Property `root > lifecycleEvents > lifecycleEvents items > onInstall`

|                           |                                  |
| ------------------------- | -------------------------------- |
| **Type**                  | `object`                         |
| **Required**              | No                               |
| **Additional properties** | Not allowed                      |
| **Defined in**            | #/definitions/lifecycleEventSpec |

| Property                                                                   | Pattern | Type   | Deprecated | Definition | Title/Description                                                                                                                                            |
| -------------------------------------------------------------------------- | ------- | ------ | ---------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| - [function](#lifecycleEvents_items_onInstall_function )                   | No      | string | No         | -          | Name of the task queue-triggered function that will handle the event. This function must be a taskQueueTriggered function declared in the resources section. |
| - [processingMessage](#lifecycleEvents_items_onInstall_processingMessage ) | No      | string | No         | -          | Message to display in the Firebase console while the task is in progress.                                                                                    |

##### <a name="lifecycleEvents_items_onInstall_function"></a>19.1.1.1. Property `root > lifecycleEvents > lifecycleEvents items > onInstall > function`

|              |          |
| ------------ | -------- |
| **Type**     | `string` |
| **Required** | No       |

**Description:** Name of the task queue-triggered function that will handle the event. This function must be a taskQueueTriggered function declared in the resources section.

##### <a name="lifecycleEvents_items_onInstall_processingMessage"></a>19.1.1.2. Property `root > lifecycleEvents > lifecycleEvents items > onInstall > processingMessage`

|              |          |
| ------------ | -------- |
| **Type**     | `string` |
| **Required** | No       |

**Description:** Message to display in the Firebase console while the task is in progress.

#### <a name="lifecycleEvents_items_onUpdate"></a>19.1.2. Property `root > lifecycleEvents > lifecycleEvents items > onUpdate`

|                           |                                               |
| ------------------------- | --------------------------------------------- |
| **Type**                  | `object`                                      |
| **Required**              | No                                            |
| **Additional properties** | Not allowed                                   |
| **Same definition as**    | [onInstall](#lifecycleEvents_items_onInstall) |

#### <a name="lifecycleEvents_items_onConfigure"></a>19.1.3. Property `root > lifecycleEvents > lifecycleEvents items > onConfigure`

|                           |                                               |
| ------------------------- | --------------------------------------------- |
| **Type**                  | `object`                                      |
| **Required**              | No                                            |
| **Additional properties** | Not allowed                                   |
| **Same definition as**    | [onInstall](#lifecycleEvents_items_onInstall) |

## <a name="events"></a>20. Property `root > events`

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

| Each item of this array must be | Description |
| ------------------------------- | ----------- |
| [event](#events_items)          | -           |

### <a name="events_items"></a>20.1. root > events > event

|                           |                     |
| ------------------------- | ------------------- |
| **Type**                  | `object`            |
| **Required**              | No                  |
| **Additional properties** | Not allowed         |
| **Defined in**            | #/definitions/event |

| Property                                    | Pattern | Type   | Deprecated | Definition | Title/Description                                                                                                                                                                                                                                                               |
| ------------------------------------------- | ------- | ------ | ---------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| - [type](#events_items_type )               | No      | string | No         | -          | The type identifier of the event. Construct the identifier out of 3-4 dot-delimited fields: the publisher ID, extension name, and event name fields are required; the version field is recommended. Choose a unique and descriptive event name for each event type you publish. |
| - [description](#events_items_description ) | No      | string | No         | -          | A description of the event                                                                                                                                                                                                                                                      |

#### <a name="events_items_type"></a>20.1.1. Property `root > events > events items > type`

|              |          |
| ------------ | -------- |
| **Type**     | `string` |
| **Required** | No       |

**Description:** The type identifier of the event. Construct the identifier out of 3-4 dot-delimited fields: the publisher ID, extension name, and event name fields are required; the version field is recommended. Choose a unique and descriptive event name for each event type you publish.

#### <a name="events_items_description"></a>20.1.2. Property `root > events > events items > description`

|              |          |
| ------------ | -------- |
| **Type**     | `string` |
| **Required** | No       |

**Description:** A description of the event

----------------------------------------------------------------------------------------------------------------------------
Generated using [json-schema-for-humans](https://github.com/coveooss/json-schema-for-humans) on 2025-06-17 at 07:38:46 -0700
