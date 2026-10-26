"""Coding agents muxtower knows beyond running them in a terminal, one package each.

An agent plugin tells, for a tmux pane running it, which session of the agent that is (`ClaudeProcessPort`:
its Remote Control id, transcript file and name) and reads its transcript into conversation items
(`sessions.transcripts.TranscriptFormat`). `agents.processes.AgentProcesses` asks each plugin in turn.
Claude Code's live in `sessions/claude_processes.py` and `claude_conversation.py`; Codex's here, in
`agents/codex/`.
"""
