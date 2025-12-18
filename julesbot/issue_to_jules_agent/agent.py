from google.adk.agents.llm_agent import Agent
from google.adk.tools.mcp_tool import McpToolset, StreamableHTTPConnectionParams
from google.adk.tools.agent_tool import AgentTool
from google.adk.agents.sequential_agent import SequentialAgent
from issue_to_jules_agent.subagents.spam_agent.agent import spam_agent
from issue_to_jules_agent.subagents.label_agent.agent import label_agent
from issue_to_jules_agent.subagents.complexity_scoping_agent.agent import complexity_scoping_agent
from issue_to_jules_agent.subagents.issue_type_agent.agent import issue_type_agent

import requests
import json

import os

JULES_KEY = os.environ.get("JULES_KEY")
GITHUB_PAT = os.environ.get("GITHUB_PAT")

IS_SPAM = AgentTool(
    agent=spam_agent,
)

LABELER = AgentTool(
    agent=label_agent
)

COMPLEXITY_SCORE = AgentTool(
    agent=complexity_scoping_agent,
)

ISSUE_TYPE = AgentTool(
    agent=issue_type_agent,
)

github_toolset = McpToolset(
    connection_params=StreamableHTTPConnectionParams(
        url="https://api.githubcopilot.com/mcp",
        headers={"Authorization": "Bearer " + GITHUB_PAT},
    ),
    tool_filter=[
        "get_file_contents",
        "get_commit",
        "search_repositories",
        "search_issues",
        "search_code",
        "list_issues",
        "list_issue_types",
        "list_commits",
        "issue_read",
        "issue_write",
    ],
)


def jules_create_session(prompt: str, title: str) -> dict:
    """
    Creates a new Jules session to address a specific prompt within a GitHub repository.

    Args:
        prompt (str): The detailed prompt or description of the task for Jules.
        title (str): The title for the Jules session.

    Returns:
        dict: A dictionary with 'status' ('success' or 'failure') and 'report' keys.
              If successful, 'report' contains the JSON response from the API.
              If failed, 'report' contains an error message.
    """
    url = "https://jules.googleapis.com/v1alpha/sessions"
    headers = {"Content-Type": "application/json", "X-Goog-Api-Key": JULES_KEY}
    payload = {
        "prompt": prompt,
        "sourceContext": {
            "source": "sources/github/firebase/firebase-tools",
            "githubRepoContext": {"startingBranch": "main"},
        },
        "requirePlanApproval": False,
        "automationMode": "AUTO_CREATE_PR",
        "title": title,
    }

    response = None
    try:
        response = requests.post(url, headers=headers, data=json.dumps(payload))
        response.raise_for_status()  # Raise an exception for bad status codes
        response_json = response.json()
        print("Jules Session Created Successfully:")
        print(json.dumps(response_json, indent=2))
        return {"status": "success", "report": response_json}
    except requests.exceptions.RequestException as e:
        error_message = f"Error creating Jules session: {e}"
        print(error_message)
        if response is not None:
            error_message += f"\nResponse status code: {response.status_code}"
            error_message += f"\nResponse body: {response.text}"
            print(f"Response status code: {response.status_code}")
            print(f"Response body: {response.text}")
        return {"status": "failure", "report": error_message}


jules_agent = Agent(
    model="gemini-3-pro-preview",
    name="jules_agent",
    description="Formats a task for jules, a code agent to help solve a GitHub issue based on the information provided",
    instruction="""
  ### System Instructions
You are an expert assistant for a software development team. Your role is to process bug reports and feature requests, and then create a clear, structured, and actionable task for an AI developer named Jules.

### Task
Based on the provided issue details, generate a complete, markdown-formatted task description for Jules.

### Instructions
1.  Read the `issue_body` and any `discussion_body` provided.
2.  **Summarize the Issue:** Create a concise summary of the problem and include a link to the original issue.
3.  **Define the Task:** Write a clear and direct task for Jules to solve the problem.
4.  **Handle Reproduction Steps:**
    *   If `reproduction_steps` are provided in the input, include them under the "Reproduction" heading.
    *   If `reproduction_steps` are empty or not provided, add the following instruction for Jules: "Please attempt to reproduce the issue first so that you can verify the fix."
5.  **Add Commit Instructions:** Always include the standard "Commit & PR Instructions" as shown in the example, using the provided `issue_number`.

### Input Placeholders
- `<issue_body>`: The raw text of the issue report.
- `<discussion_body>`: (Optional) The raw text of the discussion.
- `<original_link>`: The URL to the original issue.
- `<issue_number>`: The numerical ID of the issue.
- `<reproduction_steps>`: (Optional) Pre-written steps to reproduce the issue.

### Output Template & Example

---

#### Example Input:
```json
  "issue_body": "The login button looks weird on my phone. It's all the way on the right and hard to click. I'm using Safari.",
  "discussion_body": "User @dev1 confirmed this on iOS 15. It looks like a flexbox alignment problem in `container.css`. Should be a quick fix.",
  "original_link": "https://github.com/example/project/issues/123",
  "issue_number": "123",
  "reproduction_steps": ""
```

#### Corresponding Desired Output:
```markdown
### Issue Summary
The login button is misaligned on mobile browsers, specifically Safari on iOS, likely due to a flexbox alignment problem.

Original Issue: https://github.com/example/project/issues/123

### Task for Jules
Please fix the CSS for the login page to ensure the login button is correctly aligned within its container on mobile browsers, especially Safari.

### Reproduction
Please attempt to reproduce the issue first so that you can verify the fix.

### Commit & PR Instructions
- Revert any changes to `npm-shrinkwrap.json` before committing.
- If this change is user-facing, please write a `CHANGELOG.md` entry.
- Ensure your PR description includes the line: `fixes #123`
```

---

Now, generate the task description for the user's input.
    """,
    tools=[jules_create_session],
)

root_agent = Agent(
    model="gemini-3-pro-preview",
    name="root_agent",
    description="An agent designed to help with GitHub issues",
    instruction="""
    Your job is to triage a GitHub issue. The tasks you should perform are:
    1. Determine if an issue is spam using the is_spam agent. If it is spam, use the issue_write tool to update the issue state to "closed" and then you are done.
    2. If it is not spam, hand off the issue to the LABELER tool (labeler_agent). When the LABELER tool is done, use the issue_write tool to update the issue with the suggested labels and add a label called 'Triaged by JulesBot'.
    3. Use the issue_type_agent to determine the type of issue.
    4. If you have not done so yet, use the issue_read tool to get the comments on the issue, to help inform the next steps
    5. If it is a support request, write up a reply. Maintain a helpful tone and try to debug the issue for the user. **DO NOT** actually send this reply, just report it back and you are done.
    6. If it is a feature request or bug, use the complexity_scoping_agent to determine the complexity of the issue.
    7. If it has a complexity of less than 40, use the jules_agent to submit it to Jules, and then you are done. If it has a complexity of 40 or more, report back the reasoning for the complexity score and you are done.
    """,
    tools=[github_toolset, IS_SPAM, ISSUE_TYPE, COMPLEXITY_SCORE, LABELER],
    sub_agents=[jules_agent],
)
