export const MAIN_INSTRUCTIONS = `
Closely follow the following instructions:

You are Firebase Data Connect expert that is responsible for creating data connect schemas code in GraphQL for users.You will be given a description of the desired schema using Firebase Data Connect and your task is to write the schema code in GraphQL that fulfills the requirements and correct any mistakes in your generation.

For example, if I were to ask for a schema for a GraphQL database that contains a table called "users" with a field called "name" and another table called "posts" with a field called "body", I would get the following schema:
\`\`\`
type User @table {
  name: String!
}

type Post @table {
  body: String!
  author: User
}
\`\`\`

Simple Firebase Data Connect schema often takes the following form:
\`\`\`graphql
type TableName @table {
  uuidField: UUID
  uuidArrayField: [UUID]
  stringField: String
  stringArrayField: [String]
  intField: Int
  intArrayField: [Int]
  int64Field: Int64
  int64ArrayField: [Int64]
  floatField: Float
  floatArrayField: [Float]
  booleanField: Boolean
  booleanArrayField: [Boolean]
  timestampField: Timestamp
  timestampArrayField: [Timestamp]
  dateField: Date
  dateArrayField: [Date]
  vectorField: Vector @col(size:168)
}
\`\`\`

Leave out objects named after \`Query\` and \`Mutation\`

Firebase Data Connect implicitly adds \`id: UUID!\` to every table and implicitly makes it primary key. Therefore, leave out the \`id\` field.

Use \`UUID\` type instead of \`ID\` type or \`String\` type for id-like fields.

Array reference fields, like \`[SomeTable]\` and \`[SomeTable!]!\`, are not supported. Use the singular reference field instead.
For example, for a one-to-many relationship like one user is assiend to many bugs in a software project:
\`\`\`graphql
type User @table {
  name: String!
  # bugs: [Bug]   # Not supported. Do not use
}

type Bug @table {
  title: String!
  assignee: User
  reporter: User
}
\`\`\`

For another example, for a many-to-many relationship like each crew member is assigned to many chores and each chores requires many crews to complete:
\`\`\`graphql
type Crew @table {
  name: String!
  # assignedChores: [Chore!]!  # No supported. Do not use
}

type Chore @table {
  name: String!
  description: String!
  # assignedCrews: [Crews!]!  # No supported. Do not use
}

type Assignment @table(key: ["crew", "chore"]) {
  crew: Crew!
  chore: Chore!
}
\`\`\`

Leave out \`@relation\` because it is not supported yet.

Leave out \`directive\`, \`enum\` and \`scalar\`.

Leave out \`@view\`.

Be sure that your response contains a valid Firebase Data Connect schema in a single GraphQL code block inside of triple backticks and closely follows my instructions and description.
`.trim();

export const BUILTIN_SDL = `
# Directives

Directives define specific behaviors that can be applied to fields or types within a GraphQL schema.

## Data Connect Defined

### @col on \`FIELD_DEFINITION\` {:#col}
Customizes a field that represents a SQL database table column.

Data Connect maps scalar Fields on [\`@table\`](directive.md#table) type to a SQL column of
corresponding data type.

- scalar [\`UUID\`](scalar.md#UUID) maps to [\`uuid\`](https://www.postgresql.org/docs/current/datatype-uuid.html).
- scalar [\`String\`](scalar.md#String) maps to [\`text\`](https://www.postgresql.org/docs/current/datatype-character.html).
- scalar [\`Int\`](scalar.md#Int) maps to [\`int\`](https://www.postgresql.org/docs/current/datatype-numeric.html).
- scalar [\`Int64\`](scalar.md#Int64) maps to [\`bigint\`](https://www.postgresql.org/docs/current/datatype-numeric.html).
- scalar [\`Float\`](scalar.md#Float) maps to [\`double precision\`](https://www.postgresql.org/docs/current/datatype-numeric.html).
- scalar [\`Boolean\`](scalar.md#Boolean) maps to [\`boolean\`](https://www.postgresql.org/docs/current/datatype-boolean.html).
- scalar [\`Date\`](scalar.md#Date) maps to [\`date\`](https://www.postgresql.org/docs/current/datatype-datetime.html).
- scalar [\`Timestamp\`](scalar.md#Timestamp) maps to [\`timestamptz\`](https://www.postgresql.org/docs/current/datatype-datetime.html).
- scalar [\`Any\`](scalar.md#Any) maps to [\`jsonb\`](https://www.postgresql.org/docs/current/datatype-json.html).
- scalar [\`Vector\`](scalar.md#Vector) maps to [\`pgvector\`](https://github.com/pgvector/pgvector).

Array scalar fields are mapped to [Postgres arrays](https://www.postgresql.org/docs/current/arrays.html).

###### Example: Serial Primary Key

For example, you can define auto-increment primary key.

\`\`\`graphql
type Post @table {
  id: Int! @col(name: "post_id", dataType: "serial")
}
\`\`\`

Data Connect converts it to the following SQL table schema.

\`\`\`sql
CREATE TABLE "public"."post" (
  "post_id" serial NOT NULL,
  PRIMARY KEY ("id")
)
\`\`\`

###### Example: Vector

\`\`\`graphql
type Post @table {
  content: String! @col(name: "post_content")
  contentEmbedding: Vector! @col(size:768)
}
\`\`\`

| Argument | Type | Description |
|---|---|---|
| \`name\` | [\`String\`](scalar.md#String) | The SQL database column name. Defaults to snake_case of the field name. |
| \`dataType\` | [\`String\`](scalar.md#String) | Configures the custom SQL data type.  Each GraphQL type can map to multiple SQL data types. Refer to [Postgres supported data types](https://www.postgresql.org/docs/current/datatype.html).  Incompatible SQL data type will lead to undefined behavior. |
| \`size\` | [\`Int\`](scalar.md#Int) | Required on [\`Vector\`](scalar.md#Vector) columns. It specifies the length of the Vector. \`textembedding-gecko@003\` model generates [\`Vector\`](scalar.md#Vector) of \`@col(size:768)\`. |

### @default on \`FIELD_DEFINITION\` {:#default}
Specifies the default value for a column field.

For example:

\`\`\`graphql
type User @table(key: "uid") {
  uid: String! @default(expr: "auth.uid")
  number: Int! @col(dataType: "serial")
  createdAt: Date! @default(expr: "request.time")
  role: String! @default(value: "Member")
  credit: Int! @default(value: 100)
}
\`\`\`

The supported arguments vary based on the field type.

| Argument | Type | Description |
|---|---|---|
| \`value\` | [\`Any\`](scalar.md#Any) | A constant value validated against the field's GraphQL type during compilation. |
| \`expr\` | [\`Any_Expr\`](scalar.md#Any_Expr) | A CEL expression whose return value must match the field's data type. |
| \`sql\` | [\`Any_SQL\`](scalar.md#Any_SQL) | A raw SQL expression, whose SQL data type must match the underlying column.  The value is any variable-free expression (in particular, cross-references to other columns in the current table are not allowed). Subqueries are not allowed either. See [PostgreSQL defaults](https://www.postgresql.org/docs/current/sql-createtable.html#SQL-CREATETABLE-PARMS-DEFAULT) for more details. |

### @index on \`FIELD_DEFINITION\` | \`OBJECT\` {:#index}
Defines a database index to optimize query performance.

\`\`\`graphql
type User @table @index(fields: ["name", "phoneNumber"], order: [ASC, DESC]) {
    name: String @index
    phoneNumber: Int64 @index
    tags: [String] @index # GIN Index
}
\`\`\`

##### Single Field Index

You can put [\`@index\`](directive.md#index) on a [\`@col\`](directive.md#col) field to create a SQL index.

\`@index(order)\` matters little for single field indexes, as they can be scanned
in both directions.

##### Composite Index

You can put \`@index(fields: [...])\` on [\`@table\`](directive.md#table) type to define composite indexes.

\`@index(order: [...])\` can customize the index order to satisfy particular
filter and order requirement.

| Argument | Type | Description |
|---|---|---|
| \`name\` | [\`String\`](scalar.md#String) | Configure the SQL database index id.  If not overridden, Data Connect generates the index name: - \`{table_name}_{first_field}_{second_field}_aa_idx\` - \`{table_name}_{field_name}_idx\` |
| \`fields\` | [\`[String!]\`](scalar.md#String) | Only allowed and required when used on a [\`@table\`](directive.md#table) type. Specifies the fields to create the index on. |
| \`order\` | [\`[IndexFieldOrder!]\`](enum.md#IndexFieldOrder) | Only allowed for \`BTREE\` [\`@index\`](directive.md#index) on [\`@table\`](directive.md#table) type. Specifies the order for each indexed column. Defaults to all \`ASC\`. |
| \`type\` | [\`IndexType\`](enum.md#IndexType) | Customize the index type.  For most index, it defaults to \`BTREE\`. For array fields, only allowed [\`IndexType\`](enum.md#IndexType) is \`GIN\`. For [\`Vector\`](scalar.md#Vector) fields, defaults to \`HNSW\`, may configure to \`IVFFLAT\`. |
| \`vector_method\` | [\`VectorSimilarityMethod\`](enum.md#VectorSimilarityMethod) | Only allowed when used on vector field. Defines the vector similarity method. Defaults to \`INNER_PRODUCT\`. |

### @ref on \`FIELD_DEFINITION\` {:#ref}
Defines a foreign key reference to another table.

For example, we can define a many-to-one relation.

\`\`\`graphql
type ManyTable @table {
  refField: OneTable!
}
type OneTable @table {
  someField: String!
}
\`\`\`
Data Connect adds implicit foreign key column and relation query field. So the
above schema is equivalent to the following schema.

\`\`\`graphql
type ManyTable @table {
  id: UUID! @default(expr: "uuidV4()")
  refField: OneTable! @ref(fields: "refFieldId", references: "id")
  refFieldId: UUID!
}
type OneTable @table {
  id: UUID! @default(expr: "uuidV4()")
  someField: UUID!
  # Generated Fields:
  # manyTables_on_refField: [ManyTable!]!
}
\`\`\`
Data Connect generates the necessary foreign key constraint.

\`\`\`sql
CREATE TABLE "public"."many_table" (
  "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
  "ref_field_id" uuid NOT NULL,
  PRIMARY KEY ("id"),
  CONSTRAINT "many_table_ref_field_id_fkey" FOREIGN KEY ("ref_field_id") REFERENCES "public"."one_table" ("id") ON DELETE CASCADE
)
\`\`\`

###### Example: Traverse the Reference Field

\`\`\`graphql
query ($id: UUID!) {
  manyTable(id: $id) {
    refField { id }
  }
}
\`\`\`

###### Example: Reverse Traverse the Reference field

\`\`\`graphql
query ($id: UUID!) {
  oneTable(id: $id) {
    manyTables_on_refField { id }
  }
}
\`\`\`

##### Optional Many-to-One Relation

An optional foreign key reference will be set to null if the referenced row is deleted.

In this example, if a \`User\` is deleted, the \`assignee\` and \`reporter\`
references will be set to null.

\`\`\`graphql
type Bug @table {
  title: String!
  assignee: User
  reproter: User
}

type User @table { name: String!  }
\`\`\`

##### Required Many-to-One Relation

A required foreign key reference will cascade delete if the referenced row is
deleted.

In this example, if a \`Post\` is deleted, associated comments will also be
deleted.

\`\`\`graphql
type Comment @table {
  post: Post!
  content: String!
}

type Post @table { title: String!  }
\`\`\`

##### Many To Many Relation

You can define a many-to-many relation with a join table.

\`\`\`graphql
type Membership @table(key: ["group", "user"]) {
  group: Group!
  user: User!
  role: String! @default(value: "member")
}

type Group @table { name: String! }
type User @table { name: String! }
\`\`\`

When Data Connect sees a table with two reference field as its primary key, it
knows this is a join table, so expands the many-to-many query field.

\`\`\`graphql
type Group @table {
  name: String!
  # Generated Fields:
  # users_via_Membership: [User!]!
  # memberships_on_group: [Membership!]!
}
type User @table {
  name: String!
  # Generated Fields:
  # groups_via_Membership: [Group!]!
  # memberships_on_user: [Membership!]!
}
\`\`\`

###### Example: Traverse the Many-To-Many Relation

\`\`\`graphql
query ($id: UUID!) {
  group(id: $id) {
    users: users_via_Membership {
      name
    }
  }
}
\`\`\`

###### Example: Traverse to the Join Table

\`\`\`graphql
query ($id: UUID!) {
  group(id: $id) {
    memberships: memberships_on_group {
      user { name }
      role
    }
  }
}
\`\`\`

##### One To One Relation

You can even define a one-to-one relation with the help of [\`@unique\`](directive.md#unique) or \`@table(key)\`.

\`\`\`graphql
type User @table {
  name: String
}
type Account @table {
  user: User! @unique
}
# Alternatively, use primary key constraint.
# type Account @table(key: "user") {
#   user: User!
# }
\`\`\`

###### Example: Transerse the Reference Field

\`\`\`graphql
query ($id: UUID!) {
  account(id: $id) {
    user { id }
  }
}
\`\`\`

###### Example: Reverse Traverse the Reference field

\`\`\`graphql
query ($id: UUID!) {
  user(id: $id) {
    account_on_user { id }
  }
}
\`\`\`

##### Customizations

- \`@ref(constraintName)\` can customize the SQL foreign key constraint name (\`table_name_ref_field_fkey\` above).
- \`@ref(fields)\` can customize the foreign key field names.
- \`@ref(references)\` can customize the constraint to reference other columns.
   By default, \`@ref(references)\` is the primary key of the [\`@ref\`](directive.md#ref) table.
   Other fields with [\`@unique\`](directive.md#unique) may also be referred in the foreign key constraint.

| Argument | Type | Description |
|---|---|---|
| \`constraintName\` | [\`String\`](scalar.md#String) | The SQL database foreign key constraint name. Defaults to snake_case \`{table_name}_{field_name}_fkey\`. |
| \`fields\` | [\`[String!]\`](scalar.md#String) | Foreign key fields. Defaults to \`{tableName}{PrimaryIdName}\`. |
| \`references\` | [\`[String!]\`](scalar.md#String) | The fields that the foreign key references in the other table. Defaults to its primary key. |

### @table on \`OBJECT\` {:#table}
Defines a relational database table.

In this example, we defined one table with a field named \`myField\`.

\`\`\`graphql
type TableName @table {
  myField: String
}
\`\`\`
Data Connect adds an implicit \`id\` primary key column. So the above schema is equivalent to:

\`\`\`graphql
type TableName @table(key: "id") {
  id: String @default(expr: "uuidV4()")
  myField: String
}
\`\`\`

Data Connect generates the following SQL table and CRUD operations to use it.

\`\`\`sql
CREATE TABLE "public"."table_name" (
  "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
  "my_field" text NULL,
  PRIMARY KEY ("id")
)
\`\`\`

 * You can lookup a row: \`query ($id: UUID!) { tableName(id: $id) { myField } } \`
 * You can find rows using: \`query tableNames(limit: 20) { myField }\`
 * You can insert a row: \`mutation { tableName_insert(data: {myField: "foo"}) }\`
 * You can update a row: \`mutation ($id: UUID!) { tableName_update(id: $id, data: {myField: "bar"}) }\`
 * You can delete a row: \`mutation ($id: UUID!) { tableName_delete(id: $id) }\`

##### Customizations

- \`@table(singular)\` and \`@table(plural)\` can customize the singular and plural name.
- \`@table(name)\` can customize the Postgres table name.
- \`@table(key)\` can customize the primary key field name and type.

For example, the \`User\` table often has a \`uid\` as its primary key.

\`\`\`graphql
type User @table(key: "uid") {
  uid: String!
  name: String
}
\`\`\`

 * You can securely lookup a row: \`query { user(key: {uid_expr: "auth.uid"}) { name } } \`
 * You can securely insert a row: \`mutation { user_insert(data: {uid_expr: "auth.uid" name: "Fred"}) }\`
 * You can securely update a row: \`mutation { user_update(key: {uid_expr: "auth.uid"}, data: {name: "New Name"}) }\`
 * You can securely delete a row: \`mutation { user_delete(key: {uid_expr: "auth.uid"}) }\`

[\`@table\`](directive.md#table) type can be configured further with:

 - Custom SQL data types for columns. See [\`@col\`](directive.md#col).
 - Add SQL indexes. See [\`@index\`](directive.md#index).
 - Add SQL unique constraints. See [\`@unique\`](directive.md#unique).
 - Add foreign key constraints to define relations. See [\`@ref\`](directive.md#ref).

| Argument | Type | Description |
|---|---|---|
| \`name\` | [\`String\`](scalar.md#String) | Configures the SQL database table name. Defaults to snake_case like \`table_name\`. |
| \`singular\` | [\`String\`](scalar.md#String) | Configures the singular name. Defaults to the camelCase like \`tableName\`. |
| \`plural\` | [\`String\`](scalar.md#String) | Configures the plural name. Defaults to infer based on English plural pattern like \`tableNames\`. |
| \`key\` | [\`[String!]\`](scalar.md#String) | Defines the primary key of the table. Defaults to a single field named \`id\`. If not present already, Data Connect adds an implicit field \`id: UUID! @default(expr: "uuidV4()")\`. |

### @unique on \`FIELD_DEFINITION\` | \`OBJECT\` {:#unique}
Defines unique constraints on [\`@table\`](directive.md#table).

For example,

\`\`\`graphql
type User @table {
    phoneNumber: Int64 @unique
}
type UserProfile @table {
    user: User! @unique
    address: String @unique
}
\`\`\`

- [\`@unique\`](directive.md#unique) on a [\`@col\`](directive.md#col) field adds a single-column unique constraint.
- [\`@unique\`](directive.md#unique) on a [\`@table\`](directive.md#table) type adds a composite unique constraint.
- [\`@unique\`](directive.md#unique) on a [\`@ref\`](directive.md#ref) defines a one-to-one relation. It adds unique constraint
   on \`@ref(fields)\`.

[\`@unique\`](directive.md#unique) ensures those fields can uniquely identify a row, so other [\`@table\`](directive.md#table)
type may define \`@ref(references)\` to refer to fields that has a unique constraint.

| Argument | Type | Description |
|---|---|---|
| \`indexName\` | [\`String\`](scalar.md#String) | Configures the SQL database unique constraint name.  If not overridden, Data Connect generates the unique constraint name: - \`table_name_first_field_second_field_uidx\` - \`table_name_only_field_name_uidx\` |
| \`fields\` | [\`[String!]\`](scalar.md#String) | Only allowed and required when used on OBJECT, this specifies the fields to create a unique constraint on. |

### @view on \`OBJECT\` {:#view}
Defines a relational database Raw SQLview.

Data Connect generates GraphQL queries with WHERE and ORDER BY clauses.
However, not all SQL features has native GraphQL equivalent.

You can write **an arbitrary SQL SELECT statement**. Data Connect
would map Graphql fields on [\`@view\`](directive.md#view) type to columns in your SELECT statement.

* Scalar GQL fields (camelCase) should match a SQL column (snake_case)
  in the SQL SELECT statement.
* Reference GQL field can point to another [\`@table\`](directive.md#table) type. Similar to foreign key
  defined with [\`@ref\`](directive.md#ref) on a [\`@table\`](directive.md#table) type, a [\`@view\`](directive.md#view) type establishes a relation
  when \`@ref(fields)\` match \`@ref(references)\` on the target table.

In this example, you can use \`@view(sql)\` to define an aggregation view on existing
table.

\`\`\`graphql
type User @table {
  name: String
  score: Int
}
type UserAggregation @view(sql: """
  SELECT
    COUNT(*) as count,
    SUM(score) as sum,
    AVG(score) as average,
    PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY score) AS median,
    (SELECT id FROM "user" LIMIT 1) as example_id
  FROM "user"
""") {
  count: Int
  sum: Int
  average: Float
  median: Float
  example: User
  exampleId: UUID
}
\`\`\`

###### Example: Query Raw SQL View

\`\`\`graphql
query {
  userAggregations {
    count sum average median
    exampleId example { id }
  }
}
\`\`\`

##### One-to-One View

An one-to-one companion [\`@view\`](directive.md#view) can be handy if you want to argument a [\`@table\`](directive.md#table)
with additional implied content.

\`\`\`graphql
type Restaurant @table {
  name: String!
}
type Review @table {
  restaurant: Restaurant!
  rating: Int!
}
type RestaurantStats @view(sql: """
  SELECT
    restaurant_id,
    COUNT(*) AS review_count,
    AVG(rating) AS average_rating
  FROM review
  GROUP BY restaurant_id
""") {
  restaurant: Restaurant @unique
  reviewCount: Int
  averageRating: Float
}
\`\`\`

In this example, [\`@unique\`](directive.md#unique) convey the assumption that each \`Restaurant\` should
have only one \`RestaurantStats\` object.

###### Example: Query One-to-One View

\`\`\`graphql
query ListRestaurants {
  restaurants {
    name
    stats: restaurantStats_on_restaurant {
      reviewCount
      averageRating
    }
  }
}
\`\`\`

###### Example: Filter based on One-to-One View

\`\`\`graphql
query BestRestaurants($minAvgRating: Float, $minReviewCount: Int) {
  restaurants(where: {
    restaurantStats_on_restaurant: {
      averageRating: {ge: $minAvgRating}
      reviewCount: {ge: $minReviewCount}
    }
  }) { name }
}
\`\`\`

##### Customizations

- One of \`@view(sql)\` or \`@view(name)\` should be defined.
  \`@view(name)\` can refer to a persisted SQL view in the Postgres schema.
- \`@view(singular)\` and \`@view(plural)\` can customize the singular and plural name.

[\`@view\`](directive.md#view) type can be configured further:

 - [\`@unique\`](directive.md#unique) lets you define one-to-one relation.
 - [\`@col\`](directive.md#col) lets you customize SQL column mapping. For example, \`@col(name: "column_in_select")\`.

##### Limitations

Raw SQL view doesn't have a primary key, so it doesn't support lookup. Other
[\`@table\`](directive.md#table) or [\`@view\`](directive.md#view) cannot have [\`@ref\`](directive.md#ref) to a view either.

View cannot be mutated. You can perform CRUD operations on the underlying
table to alter its content.

**Important: Data Connect doesn't parse and validate SQL**

- If the SQL view is invalid or undefined, related requests may fail.
- If the SQL view return incompatible types. Firebase Data Connect may surface
  errors.
- If a field doesn't have a corresponding column in the SQL SELECT statement,
  it will always be \`null\`.
- There is no way to ensure VIEW to TABLE [\`@ref\`](directive.md#ref) constraint.
- All fields must be nullable in case they aren't found in the SELECT statement
  or in the referenced table.

**Important: You should always test [\`@view\`](directive.md#view)!**

| Argument | Type | Description |
|---|---|---|
| \`name\` | [\`String\`](scalar.md#String) | The SQL view name. If neither \`name\` nor \`sql\` are provided, defaults to the snake_case of the singular type name. \`name\` and \`sql\` cannot be specified at the same time. |
| \`sql\` | [\`String\`](scalar.md#String) | SQL \`SELECT\` statement used as the basis for this type. SQL SELECT columns should use snake_case. GraphQL fields should use camelCase. \`name\` and \`sql\` cannot be specified at the same time. |
| \`singular\` | [\`String\`](scalar.md#String) | Configures the singular name. Defaults to the camelCase like \`viewName\`. |
| \`plural\` | [\`String\`](scalar.md#String) | Configures the plural name. Defaults to infer based on English plural pattern like \`viewNames\`. |
`.trim();
