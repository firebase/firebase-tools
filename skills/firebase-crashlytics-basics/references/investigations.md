### How to Diagnose and Fix Crashlytics Issues

Follow these steps to diagnose bugs and and propose fixes for issues.

1. Make sure you have a good understanding of the code structure and where different functionality exists. If technical documentation exists in the code base, read it first.
2. Use the `crashlytics_get_issue` tool to get more context on the issue.
3. Use the `crashlytics_batch_get_events` tool to get an example crash for this issue. Use the event names in the sampleEvent fields.
   3a. If you need to read more events, use the `crashlytics_list_events` tool.
   3b. Apply the same filtering criteria that you used to find the issue, so that you find appropriate events.
4. Read the files that exist in the stack trace of the issue to understand the crash deeply.
5. Determine possible root causes for the crash - no more than 5 potential root causes.
6. Critique your own determination, analyzing how plausible each scenario is given the crash details.
7. Choose the most likely root cause given your analysis.
8. Create a plan for the most likely root cause using the following format for the plan:

    ```
    ## Cause

    <A description of the root cause leading to the issue>
      - **Fault**: <a determination of whether this code base is at fault or a dependent library is at fault>
      - **Complexity**: <one of "simple", "moderately simple", "moderately hard", "hard", "oof, I don't know where to start">

    ## Fix

    <A description of the fix for this issue and a break down of the changes.>
      1. <Step 1>
      2. <Step 2>

    ## Test

    <A plan for how to test that the issue has been fixed and protect against regressions>
      1. <Test case 1>
      2. <Test case 2>

    ## Other potential causes

    1. <Another possible root cause>
    2. <Another possible root cause>
    ```

9. If there is not enough information in the crash report to find a root cause, describe why you cannot fix the issue instead of making a guess.

### Special Investigations

#### Analyzing NDK (Native) Crashes
Native crashes often look intimidating but follow predictable patterns.
*   **Signal 11 (SIGSEGV):** Segmentation violation. Usually a null pointer dereference (`*ptr = 0`) or accessing freed memory (Use-after-free).
*   **Signal 6 (SIGABRT):** Abort. The app deliberately killed itself, often because of an unhandled C++ exception or a failed assertion (`assert(condition)`).
*   **Missing Symbols:** If the stack trace shows `(missing)` or hex addresses (e.g., `0x000532`), you cannot debug it. Check if `nativeSymbolUploadEnabled` is on and if the correct mappings were uploaded.

#### Analyzing ANRs (Application Not Responding)
*   **The "Main" Culprit:** Look immediately at the thread named `main`. This is the UI thread.
*   **Blocked vs. Busy:**
    *   *Blocked:* The main thread is waiting on a lock (monitor contention) held by another thread. Look for "Waiting to lock..." in the stack trace, then find the thread holding that lock.
    *   *Busy:* The main thread is doing too much work (e.g., heavy JSON parsing, sorting a huge list, image processing) directly on the UI thread.
*   **Deadlocks:** If Thread A holds Lock 1 and wants Lock 2, while Thread B holds Lock 2 and wants Lock 1, nobody moves.
