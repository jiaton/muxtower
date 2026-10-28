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

CODEX_PLAN = """\
• Proposed Plan
  # Add a directory README

  ## Summary
  Create README.md with a brief overview of this directory and its text files.

  Worked for 1m 2s • 1:14 AM
  Implement this plan?
› 1. Yes, implement this plan          Switch to Default and start coding
  2. Yes, clear context and implement  Start a fresh thread (current context: 2% used)
  3. No, stay in Plan mode             Continue planning with the model
  enter select · esc back
"""

# A turn that failed, as Codex 0.165 draws it: the viewport is not full, so blank lines come between the
# red "■" line and the composer.
CODEX_ERROR = (
    "› say hi\n\n"
    "■ The 'no-such-model-xyz' model is not supported when using Codex with a ChatGPT account.\n"
    + "\n"
    * 18
    + "› Ask Codex to do anything\n\n"
    "  no-such-model-xyz default · ~/projects/web · Say hi\n"
    "  ? for shortcuts                                              ⚠ 2 warnings · f2 to view"
)

# The owner interrupted a turn: also a red "■" line, but not a failure.
CODEX_INTERRUPTED = """\
› Write an essay.
• An essay begins here
■ Conversation interrupted - use /feedback if something went wrong

› Ask Codex to do anything

  gpt-6.1-sol default · ~/projects/web
"""

# Dialogs known from the strings of Codex 0.165 (their titles and choices), drawn like the others.
CODEX_PERMISSIONS = """\
  Would you like to grant these permissions?

  Reason: needs to write outside the workspace

› 1. Yes, grant these permissions for this turn
  2. Yes, grant for this turn with strict auto review
  3. Yes, grant these permissions for this session
  4. No, continue without it

  Press enter to confirm or esc to cancel
"""

CODEX_APP_TOOL = """\
  Approve app tool call?

  Tool: search_issues

› 1. Run the tool and continue
  2. Run the tool and remember this choice for this session
  3. Cancel this tool call

  Press enter to confirm or esc to cancel
"""

CODEX_RATE_LIMIT = """\
  Approaching rate limits
  Switch to a model with lower credit usage?

› 1. Switch to the smaller model
  2. Keep current model
  3. Keep current model (never show again)
"""
