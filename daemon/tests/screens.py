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
