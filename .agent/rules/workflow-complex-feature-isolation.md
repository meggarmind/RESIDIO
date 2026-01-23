---
trigger: always_on
---

Trigger: When the user requests a feature that requires multiple phases, complex logic, or cannot be completed in a single turn/file edit.

1. Initialization (Isolation Mode)
Upon confirming the task is a "Complex Deliverable":

Generate a Task Slug: Create a short, kebab-case identifier for the task (e.g., user-auth-refactor).

2. Create Temporary Context File: Immediately create a specific tracking file at docs/todo/<task-slug>.md.

3. File Structure: Populate docs/todo/<task-slug>.md with the following template:

# Feature: [Feature Name]
**Status:** 🚧 In Progress
**Linked Plan:** [Link to detailed implementation plan if exists]

## 🗺 Implementation Phases
- [ ] Phase 1: [Description]
- [ ] Phase 2: [Description]

## 📝 Current Session Context
*Last Updated: [Timestamp]*
* **Current Focus:** [What is the agent working on right now?]
* **Next Step:** [Immediate next action]
* **Context/State:** [Variables, temporary breakage, or notes for resumption]


User Notification: Inform the user: "I have initialized the workspace for [Feature Name] in docs/todo/<task-slug>.md. Proceeding with Phase 1."

2. Execution (Real-Time Tracking)
State Persistence: Before asking the user for input or ending a turn, the agent MUST update the Current Session Context section of the specific docs/todo/<task-slug>.md file.

Resumption: If the user returns to this task after a break, the agent must read docs/todo/<task-slug>.md first to restore the memory state.

3. Finalization (Merge & Cleanup)
Trigger: User confirms the feature is complete and working.

Update Central History: Append a high-level summary of the completed feature (phases/tasks) to the main project TODO.md.

Documentation: Create a permanent feature documentation file in docs/features/<task-slug>.md detailing how the feature works.

Version Control: Perform a git commit and push:

Message format: feat(<scope>): complete <task-slug> implementation

Body: Detailed list of changes.

Cleanup: Delete the temporary file docs/todo/<task-slug>.md.