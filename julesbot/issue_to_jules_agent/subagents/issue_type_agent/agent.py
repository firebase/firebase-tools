from google.adk.agents.llm_agent import Agent
from issue_to_jules_agent.subagents.issue_type_agent import prompt
from pydantic import BaseModel, Field

class IssueTypeOutput(BaseModel):
    issue_type: str = Field(description="Whether the issue is a bug, a support request, or feature request.")
    explanation: str = Field(description="The reason why the score was chosen.")

issue_type_agent = Agent(
    model="gemini-3-pro-preview",
    name="issue_type_agent",
    description="A agent that determines whether an issue is a bug, support request, or feature request",
    instruction=prompt.ISSUE_TYPE_INSTR,
    output_schema=IssueTypeOutput
)
