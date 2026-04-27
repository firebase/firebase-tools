import os
import argparse
import asyncio
from issue_to_jules_agent.agent import root_agent, github_toolset
from google.adk.runners import Runner
from google.adk.sessions import InMemorySessionService
from google.genai import types

APP_NAME = os.environ.get("APP_NAME", "agents")
USER_ID = os.environ.get("USER_ID", "test_user")
SESSION_ID = os.environ.get("SESSION_ID", "test_session")

async def main():
    """
    Main function to run the ADK agent.
    """
    parser = argparse.ArgumentParser(description="Run ADK agent with issue details.")
    parser.add_argument("--issue_number", help="GitHub Issue Number")
    parser.add_argument("--issue_title", help="GitHub Issue Title")
    parser.add_argument("--issue_body", help="GitHub Issue Body")
    parser.add_argument("--issue_url", help="GitHub Issue URL")
    parser.add_argument("--prompt", help="Direct prompt for the agent")
    parser.add_argument("--repo", help="The repo to explore", default="firebase/firebase-tools")
    args = parser.parse_args()

    repo = args.repo

    if args.prompt:
        prompt = args.prompt + f" the issue comes from the {repo} repo"
    elif args.issue_number and args.issue_title and args.issue_body and args.issue_url:
        prompt = f"""
        A new issue has been created in the {repo}
        Issue Number: {args.issue_number}
        Issue Title: {args.issue_title}
        Issue Body: {args.issue_body}
        Issue URL: {args.issue_url}

        Please process this issue.
        """
    else:
        print("Either --prompt or all of --issue_number, --issue_title, --issue_body, and --issue_url must be provided.")
        return

    print(f"Running agent with prompt:\n{prompt}")

    session_service = InMemorySessionService()
    runner = Runner(
        agent=root_agent,
        app_name=APP_NAME,
        session_service=session_service
    )

    try:
        await session_service.create_session(app_name=APP_NAME, user_id=USER_ID, session_id=SESSION_ID)

        user_content = types.Content(role='user', parts=[types.Part(text=prompt)])

        final_response_content = "No final response received."
        async for event in runner.run_async(user_id=USER_ID, session_id=SESSION_ID, new_message=user_content):
            if event.is_final_response() and event.content and event.content.parts:
                final_response_content = event.content.parts[0].text
        
        print(f"Agent finished with result:\n{final_response_content}")
    finally:
        await github_toolset.close()


if __name__ == "__main__":
    asyncio.run(main())
