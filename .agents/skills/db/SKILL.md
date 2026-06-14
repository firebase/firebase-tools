---
name: db
description: Query Cloud SQL (PostgreSQL) and Firestore production databases with auto-detected per-repo connections (Tailscale + Secret Manager); can also apply data fixes behind a preview-and-confirm guard when explicitly asked. Use when the user asks to "check the database", "query the db", "look up <a record or ID>", "export from db", "how many <records/rows>", "find in firestore", or any data investigation needing direct database access. Not for searching code, recalling past meetings/emails (/recall), or License Enforcement analysis questions the remote MCP server already answers.
allowed-tools:
  - Write
argument-hint: "[<natural language query> | <raw SQL>]"
---

# Database Query Skill

Query Cloud SQL (PostgreSQL) and Firestore databases with automatic connection setup, schema-aware query building, and cross-database enrichment. Supports natural language queries, raw SQL, and Firestore lookups.

## Usage

- `/db` - Interactive: asks what to look up
- `/db how many compositions are registered` - Natural language query
- `/db SELECT count(*) FROM drm_composition WHERE ...` - Raw SQL
- `/db look up licensor Z5mj94t4G0nj1ZyyU96I` - Firestore document lookup
- `/db export all compositions with conflicts as csv` - Query + export

## Critical Rules — Secrets

1. **Never hardcode or cache credentials.** Pipe them directly into the consuming command using command substitution (`$(gcloud secrets versions access ...)`).
2. **Never assign secrets to a shell variable that persists beyond a single command.** No `DB_PASSWORD=…` followed by reuse on a later line.
3. **Never echo, print, or log secrets.** Don't include them in command output, don't redirect them to files, don't reference them in chat.
4. **Single-command env var only.** When passing a secret as `PGPASSWORD` (or any `*_API_KEY` env var to a script), set it inline on the same command — `PGPASSWORD="$(gcloud …)" psql …` — and let the variable die when the command exits.

## Database Connections

### Auto-Detection by Project

The skill auto-detects which database to connect to based on the current working directory:

| Project Directory     | Database              | User                       | Secret                                   |
| --------------------- | --------------------- | -------------------------- | ---------------------------------------- |
| `studio-backend`      | `postgres`            | `postgres`                 | `CLOUD_SQL_PASSWORD`                     |
| `studio-frontend-php` | `postgres`            | `postgres`                 | `CLOUD_SQL_PASSWORD`                     |
| `license-enforcement` | `license_enforcement` | `license_enforcement_user` | `CLOUD_SQL_LICENSE_ENFORCEMENT_PASSWORD` |

**Connection details (all databases):**

- Host: `172.16.255.5` (via Tailscale VPN)
- Port: `5432`
- GCP Project: `prod--studio-yt`

### Connecting to Cloud SQL

Pipe the password fresh from Secret Manager on every psql call. Do not fetch and store it separately.

For SELECT (read-only) queries:

```bash
PGPASSWORD="$(gcloud secrets versions access latest --secret=<SECRET_NAME> --project=prod--studio-yt)" \
  psql -h 172.16.255.5 -p 5432 -U <user> -d <database> -c "<SQL>"
```

For queries with output formatting (e.g., CSV):

```bash
PGPASSWORD="$(gcloud secrets versions access latest --secret=<SECRET_NAME> --project=prod--studio-yt)" \
  psql -h 172.16.255.5 -p 5432 -U <user> -d <database> --csv -c "<SQL>"
```

The `PGPASSWORD=…` env var is scoped to that single `psql` command and dies when the command exits. Each subsequent query repeats the substitution.

### Connecting to Firestore

Firestore is used for collections that haven't been migrated to Cloud SQL yet. Access via `firebase-admin` with Application Default Credentials.

**Run from the `firebase/functions` directory** (where `firebase-admin` is installed):

```bash
cd <project-root>/firebase/functions && node -e "
const { initializeApp, applicationDefault } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
initializeApp({ credential: applicationDefault(), projectId: 'prod--studio-yt' });
const db = getFirestore();
// ... query here ...
"
```

**Firestore collections (studio-backend / studio-frontend-php only):**

| Collection           | Key Fields                                           | Notes                                           |
| -------------------- | ---------------------------------------------------- | ----------------------------------------------- |
| `drm_assets`         | contentOwnerId, licensorId, type, status             | YouTube Content ID assets (title in `metadata`) |
| `drm_claims`         | assetId, videoId, contentOwnerId, licensorId, status | Content ID claims                               |
| `drm_licensors`      | displayName, features, payoutDetails                 | Licensor configuration                          |
| `drm_contentOwners`  | displayName, routerUrl, performClaimSearchImport     | YouTube content owner config                    |
| `drm_assets_archive` | Same as assets                                       | Archived assets                                 |
| `drm_claims_archive` | Same as claims                                       | Archived claims                                 |

## Process

### 1. Detect Database and Connect

**Auto-detect** based on current working directory:

- Check if cwd contains `license-enforcement` → use `license_enforcement` database
- Check if cwd contains `studio-backend` or `studio-frontend-php` → use `postgres` database
- If ambiguous, ask user which database to connect to

The detected `<secret_name>` (per the auto-detection table above) is plugged into the inline `$(gcloud secrets versions access …)` substitution on every psql call — see "Connecting to Cloud SQL" above. Do **not** fetch and store the password separately.

### 2. Read Schema

Before building any query, **always read the relevant entity definitions** to understand the current schema:

**Cloud SQL:**

| Project               | ORM        | Entity Path                                 |
| --------------------- | ---------- | ------------------------------------------- |
| `studio-backend`      | MikroORM   | `firebase/functions/src/mikroorm/entities/` |
| `studio-frontend-php` | Doctrine   | `src/Entity/`                               |
| `license-enforcement` | SQLAlchemy | `src/database/models.py`                    |

Use Glob and Read to scan entity files. Look for:

- **MikroORM (studio-backend, v7 `defineEntity` style):** `defineEntity({ name, properties })`, `p.string()/p.enum()/p.array()` builders, `embeddable: true` blocks, junction tables, check constraints in entity options — NOT `@Entity()` decorators
- **Doctrine (studio-frontend-php):** `#[ORM\Entity]`, `#[ORM\Column]`, `#[ORM\ManyToOne]`, `#[ORM\Embedded]`
- **SQLAlchemy (license-enforcement):** `__tablename__`, `mapped_column()`, `relationship()`, `ForeignKey`

**Firestore:** No formal schema — refer to the TypeScript type definitions:

- `firebase/functions/src/types/firestore.ts` — all Firestore document types
- `firebase/functions/src/common/constants.ts` — collection name constants

### 3. Build and Execute Query

**If natural language input:**

1. Parse the intent (what data, which tables/collections, filters, aggregations)
2. Determine if this is a Cloud SQL or Firestore query (or cross-database)
3. Build the SQL or Firestore query based on the schema
4. Show the generated query to the user before executing (for complex queries)

**If raw SQL input:**

1. Validate syntax briefly
2. Execute per the Query execution rules below — SELECT/COPY run directly; raw UPDATE/INSERT/DELETE go through the same guarded flow as generated writes

**Query execution rules:**

- **SELECT queries:** Execute directly, no confirmation needed
- **COPY/export queries:** Execute directly
- **UPDATE/INSERT/DELETE (prod writes — guarded flow):** (1) run a count-first `SELECT count(*)` with the same `WHERE` so the blast radius is explicit, (2) show a bounded sample of the rows that will change — `SELECT … WHERE <same predicate> LIMIT 20`; only when a plain SELECT cannot mirror the change (e.g. multi-table CTE writes), fall back to a `BEGIN; <statement> RETURNING …; ROLLBACK;` dry-run with an explicit column list, noting that the dry-run briefly holds the same row locks as the real write, (3) only after the user explicitly confirms the preview, execute for real. The permission prompt is the final gate, not the only one
- **Always use LIMIT** for exploratory queries to avoid accidentally dumping huge tables
- Start with `LIMIT 10` for investigation, increase as needed

### 4. Cross-Database Enrichment

When a query result contains IDs that reference another database, **automatically enrich**:

**Common enrichment patterns:**

| Cloud SQL Field | Firestore Collection | Lookup Field  |
| --------------- | -------------------- | ------------- |
| `licensor_id`   | `drm_licensors`      | `displayName` |

**How to enrich:**

1. Execute the Cloud SQL query first
2. Extract unique foreign IDs from results
3. Batch-query Firestore for the referenced documents
4. Merge the display names / relevant fields into the output

Example: When querying compositions, automatically add `licensorName` from Firestore `drm_licensors`.

### 5. Format Output

**Small results (< 20 rows):** Display as a markdown table inline.

**Medium results (20-100 rows):** Display summary inline + offer CSV export.

**Large results (> 100 rows):** Automatically save as CSV file in the project root directory.

**CSV export format:**

```bash
PGPASSWORD="$(gcloud secrets versions access latest --secret=<SECRET_NAME> --project=prod--studio-yt)" \
  psql -h 172.16.255.5 -p 5432 -U <user> -d <database> \
  --csv -c "<SQL>" > output.csv
```

After creating a CSV, report:

- Filename and row count
- Column names
- A few sample rows

## Common Query Patterns

### Cloud SQL — Studio Backend

```sql
-- Composition progress by Admin MP status
SELECT registration_status_the_administration_m_p AS status, count(*)
FROM drm_composition
WHERE catalog_type = 'active'
GROUP BY 1 ORDER BY 2 DESC;

-- Compositions with asset IDs
SELECT id, title, youtube_composition_asset_ids, licensor_id
FROM drm_composition
WHERE youtube_composition_asset_ids IS NOT NULL
LIMIT 20;

-- Writer details for a composition
SELECT w.first_name, w.last_name, w.ipi, cw.ownership
FROM drm_composition_writer cw
JOIN drm_writer w ON cw.writer_id = w.id
WHERE cw.composition_id = '<uuid>';
```

### Cloud SQL — License Enforcement

```sql
-- Post counts by enrichment state
SELECT enrichment_state, count(*) FROM posts GROUP BY 1 ORDER BY 2 DESC;

-- Scraper config overview
SELECT sc.id, sc.display_name, sc.platform, sc.scraper_type, sc.is_active,
       sc.total_posts_scraped, sc.total_runs
FROM scraper_configs sc ORDER BY sc.total_posts_scraped DESC LIMIT 20;

-- Projects with licensor (licensor lives on catalogs, not projects)
SELECT p.id, p.artist_names, p.song_name, c.licensor_id
FROM projects p JOIN catalogs c ON p.catalog_id = c.id
LIMIT 20;
```

### Firestore — Document Lookups

```javascript
// Get licensor by ID
db.collection("drm_licensors")
  .doc("<id>")
  .get()
  .then((d) => console.log(JSON.stringify(d.data(), null, 2)));

// Search assets by content owner
db.collection("drm_assets")
  .where("contentOwnerId", "==", "<contentOwnerId>")
  .limit(10)
  .get()
  .then((snap) =>
    snap.docs.forEach((d) => console.log(d.id, d.data().type, d.data().status)),
  );

// Get all licensors with names
db.collection("drm_licensors")
  .get()
  .then((snap) =>
    snap.docs.forEach((d) => console.log(d.id, d.data().displayName)),
  );
```

## Error Handling

| Scenario                     | Action                                                      |
| ---------------------------- | ----------------------------------------------------------- |
| Tailscale not connected      | Warn: "Cannot reach 172.16.255.5 — is Tailscale connected?" |
| Secret Manager access denied | Suggest: `gcloud auth login` or check IAM permissions       |
| Table/column not found       | Re-read entity definitions, suggest correct names           |
| Query returns too many rows  | Add LIMIT, suggest CSV export                               |
| Firestore ADC not configured | Suggest: `gcloud auth application-default login`            |
| firebase-admin not installed | Suggest: `cd firebase/functions && npm ci`                  |

## Gotchas

- Everything here is PRODUCTION (`prod--studio-yt`, 172.16.255.5) — there is no staging path in this skill. Treat every write as a prod write.
- studio-backend and studio-frontend-php share ONE database (`postgres`): the same tables are defined twice — MikroORM entities in studio-backend AND Doctrine entities in studio-frontend-php. Read the entities of the repo you're in, but expect columns introduced by the other repo.
- studio-backend entities use MikroORM v7 `defineEntity({ name, properties: { … } })` with `p.*` property builders — NOT `@Entity()` decorators. Entities live under `entities/{shared,prod,dev}/`.
- license-enforcement is an independent schema and `licensor_id` lives on `catalogs`, not `projects` — join `projects.catalog_id → catalogs.id` to reach the licensor.
- A connection timeout to 172.16.255.5 means Tailscale is down, not the database.
- Always inline `PGPASSWORD="$(gcloud …)"` on the same line as `psql` — 9 recorded failures set it separately (or fetched it to a variable first); psql then fell back to an interactive password prompt and died.
- Never guess column names from memory — 43 recorded query failures were misremembered columns. Read the entity/model first; MikroORM snake_cases consecutive capitals (`theAdministrationMP` → `…_the_administration_m_p`).
- Firestore owns `drm_assets`, `drm_claims`, `drm_licensors`, `drm_contentOwners` (+ archives) — but `drm_composition`, `drm_writer`, and the other `drm_*` tables in the sample queries are Postgres. If a table is missing in Postgres, check the Firestore collections table above before concluding it doesn't exist.

## Tips

- Use `\d <table>` via psql to inspect table structure quickly
- For Firestore subcollections, query: `db.collection('drm_licensors/<id>/autolicenseProfiles')`
- Junction tables use composite primary keys — always join through them
- The `drm_composition` table has embedded registration status columns: `registration_status_imro` and `registration_status_the_administration_m_p` (MikroORM embeddable pattern — `embeddable: true` defineEntity blocks)
- Use `pg_trgm` GIN indexes for fuzzy text search: `WHERE title ILIKE '%term%'`

## Related Skills

- Use `/message` to share query results with colleagues
- Use `/export` (future) for more complex data export workflows
- Pair with `/commit` if query results lead to data fixes that need code changes
