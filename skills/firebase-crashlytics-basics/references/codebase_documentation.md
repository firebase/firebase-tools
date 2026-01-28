# The Agent's Guide to "Technical Reference" Codebase Documentation

## 1. Introduction

**The goal is to create a definitive technical reference for the application.**

When a developer (or an agent) enters a codebase, they don't just need to know "what" the app does; they need to know exactly how it implements its features. Your goal is to create a "maximalist" document that is a comprehensive, living specification of the application's internals. It should be robust enough that a developer could implement a new feature (like "Add a new field to the User Profile") almost entirely by consulting this document, without needing to spend hours reverse-engineering the existing patterns.

## 2. Core Principles of Technical Documentation

1.  **Aim for Density:** A high-quality reference for an Android app should be **1000+ lines** or equivalent density depending on the complexity of the app. Do not verify your work until you have achieved significant depth.
2.  **Exhaustive, Not Exemplary:**
    - _Bad:_ "The app has many actions, such as `ACTION_SYNC`."
    - _Good:_ A complete Markdown Table listing **every single** Action constant, event type, or API endpoint, and what it does.
3.  **Tables are Power:** Use tables for Schemas, Intent Actions, URI Matchers, and API Endpoints. They are scannable and authoritative.
4.  **Architectural Narratives:** Don't just list components. Explain the _patterns_ (e.g., "The MVVM Pattern", "The Repository Pattern", "The Offline-First Sync Loop").
5.  **Preserve the User Narrative:** Start with _what_ the user does, but immediately pivot to _how_ the code executes it.

## 3. The Step-by-Step "Technical Reference" Process

### Step 1: Broad Reconnaissance & Architecture Identification

Before writing, understand the "Skeleton" of the app.

- **Identify the Core Pattern:** Is it MVVM? MVP? Clean Architecture? A legacy Service-Oriented pattern?
- **Find the "Big Layers":**
  1.  **The Logic/Network Layer:** Who handles the heavy lifting? (e.g., `NetworkManager`, `Repository`, `ApiService`).
  2.  **The Data Store:** Who manages persistence? (e.g., `RoomDatabase`, `ContentProvider`, `Realm`).
  3.  **The UI Entry Points:** Where does the User Interface start? (e.g., `MainActivity`, `HomeFragment`).

### Step 2: Extracting "the Standard Model"

Create precise references for the application's data and network layers.

- **Data Layout:** Open the core Model classes (e.g., `User.java`, `Item.kt`). Extract the **Schema**.
  - _Output:_ A table of every column/field, its type, and its purpose.
- **Network Protocol:** Open the API definition or Network Service. Extract the **API**.
  - _Output:_ A table of every endpoint, command, or action constant available to the app.
- **Routing/Navigation:** If special routing is used (Deep Links, Navigation Graph), map every route.

### Step 3: Deep Dives into Core Flows

Select the top 3-5 most complex features and document their implementation flow step-by-step.

- **Synchronization:** How does data move between Local DB and Server? (Detail conflict resolution, retry policies, offline states).
- **Authentication:** Exact auth flow (e.g., OAuth -> Token Exchange -> Session Storage).
- **Complex Feature X:** The unique "Secret Sauce" of the application (e.g., Video Processing, Bluetooth constraints).

### Step 4: The "How-To" Development Guide

Anticipate the reader's next task. Write a "Cookbook" section.

- **"How to Add a New Field":** Walk through the 5-6 files typically touched to add a single property to a model. (Migration -> Model -> Parser -> UI).
- **"How to Debug":** Where are the logs? What tags to filter? Key breakpoints?

## 4. Structure of a Technical Reference Document

Use this template structure for your `TECHNICAL_REFERENCE.md`:

```markdown
# TECHNICAL REFERENCE: [App Name]

## 1. Core Architecture

[Deep dive into the architectural pattern. Explain "The Logic", "The Store", "The Face".]

## 2. Network Layer Reference

### 2.1 Strategy

[Libraries used: Retrofit/OkHttp/Ktor, JSON parsing strategy, Threading model.]

### 2.2 API / Action Reference (Complete List)

| Constant / Route                               | Value  | Purpose                                |
| :--------------------------------------------- | :----- | :------------------------------------- |
| ACTION_SYNC                                    | "sync" | Triggers the bi-directional sync loop. |
| ... (List ALL available actions/endpoints) ... | ...    | ...                                    |

## 3. Data Layer Reference

### 3.1 Schema & ORM

[Explain the ORM pattern, e.g., "Room", "Active Record", "Raw SQLite".]

#### Table: [table_name]

| Column                     | Type    | Description       |
| :------------------------- | :------ | :---------------- |
| id                         | INTEGER | Local Primary Key |
| remote_id                  | STRING  | Server ID         |
| ... (List ALL columns) ... | ...     | ...               |

## 4. Feature Implementation Details

### 4.1 Feature 1

[Step-by-step logic ...]

### 4.2 Feature 2

[Details ...]
```

## 5. Final Quality Check

Before submitting:

1.  **Did I filter or condense too much?** If you summarized a list of 50 items down to "various actions", **GO BACK**. The user wants the list.
2.  **Is it code-grounded?** Every section should cite specific filenames and class names.
3.  **Is it authoritative?** Does this look like an official spec written by the lead engineer?

By following this guide, you ensure that `TECHNICAL_REFERENCE.md` serves its true purpose: **Empowering developers to master the codebase instantly.**
