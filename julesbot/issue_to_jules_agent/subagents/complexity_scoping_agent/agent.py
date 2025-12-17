from google.adk.agents.llm_agent import Agent
from issue_to_jules_agent.subagents.complexity_scoping_agent import prompt
from pydantic import BaseModel, Field

class IssueComplexityOutput(BaseModel):
    complexity_score: int = Field(description="The complexity of the issue on a scale from 1-100, where 1 is the easiest and 100 is the most complex.")
    explanation: str = Field(description="The reason why the score was chosen.")

complexity_scoping_agent = Agent(
    model="gemini-3-pro-preview",
    name="complexity_agent",
    description="An agent that estimates the complexity of fixing a Github Issue",
    instruction=prompt.COMPLEXITY_INSTR,
    output_schema=IssueComplexityOutput
)
