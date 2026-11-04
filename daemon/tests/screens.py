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

# Claude Code's confirmation on its first start in bypass mode (without skipDangerousModePermissionPrompt),
# captured from Claude Code 2.1.318 at 120x40.
BYPASS_CONFIRM = """\
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
  WARNING: Claude Code running in Bypass Permissions mode

  In Bypass Permissions mode, Claude Code will not ask for your approval before running potentially dangerous
  commands.
  This mode should only be used in a sandboxed container/VM that has restricted internet access and can easily be
  restored if damaged.

  By proceeding, you accept all responsibility for actions taken while running in Bypass Permissions mode.

  https://code.claude.com/docs/en/security

  ❯ No, exit
    Yes, I accept

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

# Claude Code at work in a narrow pane: the status bar's hint is cut short, the spinner line says it.
WORKING_NARROW = """\
⏺ Reading the rules.

✢ Misting… (22s · ↓ 1.9k tokens · thought for 7s)
  ⎿  Tip: Press Shift+Enter to send a multi-line message
──────────────────────────────────────────────────
❯ 
──────────────────────────────────────────────────
  ⏵⏵ auto mode on (shift+tab to cycle) · esc to inter…
"""

# A finished turn whose answer quotes the status bar's hint (and a spinner line) in its text.
DONE_QUOTING = """\
⏺ The rule matched "esc to interrupt" anywhere on the screen, like this line:
  ✢ Misting… (22s · ↓ 1.9k tokens)

✻ Worked for 1m 48s · done 3:30 PM · 1 shell still running
──────────────────────────────────────────────────
❯ 
──────────────────────────────────────────────────
  ⏵⏵ auto mode on · 1 shell · ↓ to manage


"""

MCP_TRUST = """\
────────────────────────────────────────────────
 New MCP server found in .mcp.json: docs

 MCP servers may execute code or access system resources. All tool calls require approval.

 ❯ 1. Use this and all future MCP servers in this project
   2. Use this MCP server
   3. Continue without using this MCP server

 Enter to confirm · Esc to cancel
"""

# A long conversation scrolled by on the screen (history), matching no rule: what every rule meets on
# most panes, most of the time. 20 000 characters.
LONG_IDLE = ("● Read 3 files and ran the tests; all 42 pass.\n  ⎿  src/payments/client.ts\n" * 280)[:20000] + IDLE

# At work, with a diff on screen that adds a dialog's words (a session editing these rules).
BUSY_QUOTING_DIALOG = """\
⏺ Update(tests/screens.py)
  ⎿  Added 12 lines
      225 + MCP_TRUST = \"\"\"\\\\
      226 +  New MCP server found in .mcp.json: docs
      227 +  Do you want to proceed?
      228 +  ❯ 1. Yes
      229 +  Enter to confirm · Esc to cancel

✻ Pondering… (41s · ↓ 2.1k tokens)
──────────────────────────────────────────────────
❯ 
──────────────────────────────────────────────────
  ⏵⏵ auto mode on (shift+tab to cycle) · esc to interrupt
"""

# Idle, its reply quoting a dialog's words as the last thing it said.
IDLE_QUOTING_DIALOG = """\
⏺ The rule matched the footer of the trust dialog, which reads:

  ❯ 1. Yes, I trust this folder
    2. No, exit

  Enter to confirm · Esc to cancel
──────────────────────────────────────────────────
❯ 
──────────────────────────────────────────────────
  ? for shortcuts
"""

CODEX_IDLE_QUOTING = """\
• Codex asks "Would you like to run the following command?" before it runs one, and waits.

› Ask Codex to do anything

  gpt-5.5 default · ~/projects/web
"""

# An API error the agent ended its turn on (as Claude Code shows it: the error, then the turn's done line).
API_ERROR = """\
● Searched for 1 pattern, ran 2 shell commands

● API Error: Output blocked by content filtering policy

✻ Churned for 7m 4s · done 6:11 PM

────────────────────────────────────────
❯ 
────────────────────────────────────────
  ⏵⏵ auto mode on (shift+tab to cycle)
"""

# Idle after a turn that went on: the older errors scrolled up, one quoted in what the owner asked.
ERROR_SCROLLED_UP = """\
● API Error: Output blocked by content filtering policy

✻ Churned for 7m 4s · done 6:11 PM

❯ API Error: Output blocked by content filtering policy 是什么意思

● The API's output filter blocked that reply; it is not the project. Carrying on with made-up lyrics.

  Ran 4 shell commands

✻ Cooked for 2m 26s · done 9:30 PM

────────────────────────────────────────
❯ 
────────────────────────────────────────
  ⏵⏵ auto mode on (shift+tab to cycle)
"""
