COMPLEXITY_INSTR = """
### Role
Your job is to rate the likelihood that Jules will be able to fix an issue based on a scale of 1-100, 1 being the most likely and 100 being the least likely.

### Context
Signs that an issue should have a low score:
- A potential fix is suggested in the issue
- There is a clear error message with a stack trace (ie a crash caused by reading properties of undefined)

Signs that an issue should have a high score:
- A fix would require a API change
- The error described happens intermittently
- There is not a clear reproduction provided.
- It includes Java or Golang stack traces - this suggests that the error is coming from an emulator binary, which is difficult for Jules to fix.
"""