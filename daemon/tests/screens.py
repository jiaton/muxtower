"""Synthetic Claude Code screens shaped like the real dialogs the default rules target."""

PERMISSION = """\
● Bash(rm -rf build/)
────────────────────────────────────────────────
 Bash command

   rm -rf build/
   Remove the build directory

 Do you want to proceed?
 ❯ 1. Yes
   2. Yes, allow rm commands during this session
   3. No, and tell Claude what to do differently (esc)
"""

QUESTION = """\
Which database should I use?
❯ 1. SQLite
  2. Postgres
Enter to select · ↑/↓ to navigate · Esc to cancel
"""

PLAN = """\
Here is the plan.
How would you like to proceed?
❯ 1. Yes, and auto-accept edits
  2. Yes, and manually approve edits
  3. No, keep planning
"""

BUSY = """\
✻ Thinking… (12s · esc to interrupt)
"""

TRUST = """\
 Accessing workspace:
 /work/project
 Claude Code'll be able to read, edit, and execute files here.
 Security guide
 ❯ No, exit
   Yes, I trust this folder
 Enter to confirm · Esc to cancel
"""

AUTO_MODE_TIP = """\
❯ Use the Bash tool to run exactly this command: touch x.txt
● Done.
────────────────────────────────────────────────
  Teach auto mode about your environment?
  ❯ 1. Yes
    2. Not now
    3. Don't show again
  Enter to confirm · Esc to cancel
────────────────────────────────────────────────
❯
────────────────────────────────────────────────
  ⏵⏵ auto mode on (shift+tab to cycle)
"""

IDLE = """\
> 
  ? for shortcuts
"""

# Codex's TUI, as its own snapshot tests draw it.
CODEX_COMMAND = """\
  Would you like to run the following command?

  Reason: this is a test reason such as one that would be produced by the model

  $ echo hello world

› 1. Yes, proceed (y)
  2. Yes, and don't ask again for commands that start with `echo hello world` (p)
  3. No, and tell Codex what to do differently (esc)

  Press enter to confirm or esc to cancel
"""

CODEX_EDITS = """\
  Would you like to make the following edits?

  Reason: The model wants to apply changes

› 1. Yes, proceed (y)
  2. Yes, and don't ask again for these files (a)
  3. No, and tell Codex what to do differently (esc)

  Press enter to confirm or esc to cancel
"""

CODEX_QUESTION = """\
  Question 1/1 (1 unanswered)
  Choose an option.

  › 1. Option 1  First choice.
    2. Option 2  Second choice.
    3. Option 3  Third choice.

  tab to add notes | enter to submit answer | esc to interrupt
"""

CODEX_WORKING = """\
• Working (12s • esc to interrupt)

› Ask Codex to do anything
"""

CODEX_IDLE = """\
› Ask Codex to do anything

  gpt-5.5 default · ~/projects/web
"""

CODEX_TRUST = """\
> You are in /home/me/projects/web
  Do you trust the contents of this directory? Working with untrusted contents comes with higher
  risk of prompt injection. Trusting the directory allows project-local config, hooks, and exec
  policies to load.
› 1. Yes, continue
  2. No, quit
  Press enter to continue
"""
