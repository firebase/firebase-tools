from google.adk.agents.llm_agent import Agent
from issue_to_jules_agent.subagents.spam_agent import prompt
from pydantic import BaseModel, Field

class SpamDetectionOutput(BaseModel):
    spam_score: int = Field(description="The likelihood of spam on a scale from 0 to 100. 100 being spam, 0 being not spam.")
    explanation: str = Field(description="The reason why the selected spam score was chosen.")

spam_agent = Agent(
    model="gemini-2.5-flash",
    name="spam_agent",
    description="A spam detection agent for Github Issues",
    instruction=prompt.SPAM_DETECTION_INSTR,
    output_schema=SpamDetectionOutput
)
