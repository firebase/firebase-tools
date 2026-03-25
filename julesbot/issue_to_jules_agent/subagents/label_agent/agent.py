from google.adk.agents.llm_agent import Agent
from issue_to_jules_agent.subagents.label_agent.prompt import LABEL_AGENT_INSTRUCTIONS
from pydantic import BaseModel, Field
from typing import List

class LabelInputSchema(BaseModel):
    issue_title: str = Field(description="The GitHub issue title")
    issue_description: str = Field(description="The GitHub issue description")


class LabelAgentOutput(BaseModel):
    reasoning: str = Field(
        description="A brief, one-sentence explanation of why the labels were chosen."
    )
    labels: List[str] = Field(
        description="A list of selected labels from the provided list."
    )


label_agent = Agent(
    model="gemini-2.5-flash",
    name="label_agent",
    description="An agent designed to determine the proper labels for a given GitHub Issue",
    instruction=LABEL_AGENT_INSTRUCTIONS,
    input_schema=LabelInputSchema,
    output_schema=LabelAgentOutput,
)
