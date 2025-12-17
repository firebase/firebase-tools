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


# determine_files_and_dir = Agent(
#     model="gemini-3-pro-preview",
#     name="determine_files_and_dir",
#     description="An agent to search files and directories",
#     instruction="""
#     You are an expert debugger working for a large tech company. You know how to navigate code bases like a pro.
#     Starting at src/ list all files and directories within that location. If that area has already been explored, use feedback
#     to determine the next area of the project to explore.
#     """,
#     tools=[github_toolset],
# )

# next_path_suggestor = Agent(
#     model="gemini-3-pro-preview",
#     name="next_path_suggestor",
#     description="An agent to determine whether the listed file and direcory contents can help solve the issue presented",
#     instruction="""
#     Based on the code provided, are you able to solve the issue presented to you from the issue list?


#     If not, suggest a different path to explore.

#     If so, call exit_loop after providing an explanation on how to solve it.
#     """,
#     tools=[exit_loop],
# )

# file_agent = LoopAgent(
#     name="scoping_agent",
#     description="used to scope the issue to a directory that likely makes sense on a fix",
#     sub_agents=[determine_files_and_dir, next_path_suggestor],
#     max_iterations=30,
# )


jules_agent = Agent(
    model="gemini-3-pro-preview",
    name="jules_agent",
    description="Formats a task for jules, a code agent to help solve a GitHub issue based on the information provided",
    instruction="""
    Summarize the issue and the discussion (including a link to the original) and provide a task for Jules to solve it.
    If there is a reproduction provided, include it in the task - otherwise, ask Jules to first attempt to reproduce the issue so that it can verify the fix.
    Additionally, instruct Jules not to revert any changes to npm-shrinkwrap.json before committing, and to write a CHANGELOG.md entry for the change if it is user facing.
    Also, tell Jules to include 'fixes #<issue_number>' in the PR description.
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
    3. Use the issue_type_agent to determine the type of issue. If it is a support request or feature request, report back and you are done.
    4. If you have not done so yet, use the issue_read tool to get the comments on the issue, to help inform the next steps
    5. If it is a bug, use the complexity_scoping_agent to determine the complexity of the issue.
    6. If it is a bug with complexity of less than 30, use the jules_agent to submit it to Jules.
    """,
    tools=[github_toolset, IS_SPAM, ISSUE_TYPE, COMPLEXITY_SCORE, LABELER],
    sub_agents=[jules_agent],
)
