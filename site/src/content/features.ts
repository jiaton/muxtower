/** What it does, and why it is safe to put on the internet. */

export type FeatureId =
  'asks' | 'approve' | 'machines' | 'conversation' | 'push' | 'voice' | 'mcp' | 'glasses' | 'codex' | 'desktop' | 'keys' | 'gate'

export const features = {
  eyebrow: 'Features',
  title: 'Everything an agent waits on you for.',
}

export const featureList: { id: FeatureId; title: string; text: string }[] = [
  {
    id: 'asks',
    title: 'Knows exactly what it asks',
    text: 'Claude Code and Codex report through their own hooks, so a permission request arrives with the exact command. Other agents are read off the screen with rules you can edit.',
  },
  {
    id: 'approve',
    title: 'Approves safely',
    text: 'Approving re-reads the live screen and picks the option with the arrow keys. Nothing is typed blindly into a terminal that has moved on.',
  },
  {
    id: 'machines',
    title: 'Every computer in one list',
    text: 'Join your laptop and your build box to the machine that is always on. One address, one list, sessions marked by computer.',
  },
  {
    id: 'conversation',
    title: 'Readable on a phone',
    text: 'A terminal sized to your screen, and the conversation beside it with images, code blocks and copy buttons.',
  },
  {
    id: 'push',
    title: 'Notifications that matter',
    text: 'A push when an agent needs you or finishes a turn, optionally with a short summary of a long reply. Tap it to land on the session.',
  },
  {
    id: 'voice',
    title: 'Answer by voice',
    text: 'Dictate a reply with the provider you choose. Session names and your terms help it spell things right.',
  },
  {
    id: 'mcp',
    title: 'MCP and an assistant',
    text: 'Your sessions as MCP tools for any other agent: list, read, message, approve. An optional assistant session relays to, reports on and answers for the rest.',
  },
  {
    id: 'glasses',
    title: 'On your glasses',
    text: 'An Even Realities G2 app: what needs you first, approve with two taps, answer by voice.',
  },
  {
    id: 'codex',
    title: 'Codex without a terminal',
    text: 'With one setting, muxtower joins the app-server your Codex clients share: threads from the Codex app are listed, answered and messaged like any other.',
  },
  {
    id: 'desktop',
    title: 'Claude desktop sessions',
    text: 'Turn on Remote Control listing, and sessions started in the desktop app, an IDE or claude remote-control are listed with their conversation, on the computer they run on.',
  },
  {
    id: 'keys',
    title: 'The keys a terminal needs',
    text: 'Arrows, Enter, Esc, Tab and Ctrl-C on a pad above the message box, without the phone keyboard jumping in, for any prompt muxtower has no button for.',
  },
  {
    id: 'gate',
    title: 'Behind your own sign-in',
    text: 'Cloudflare Access, an SSO proxy or a password gate in front: one sign-in per browser covers the app, the API and the live stream.',
  },
]

export const security = {
  eyebrow: 'Security',
  title: 'Built to sit on the open internet.',
  lead: 'It drives terminals, so it is strict about who may.',
  points: [
    {
      title: 'A token per device',
      text: 'Stored hashed, revocable one by one from the app or the command line.',
    },
    {
      title: 'One-time pairing codes',
      text: 'Single use, five minutes, rate-limited, carried in the URL fragment so no server sees them.',
    },
    {
      title: 'Ban the guessers',
      text: 'Only a wrong credential answers 401 or 403, so fail2ban or your WAF can ban whoever is guessing.',
    },
    {
      title: 'No shell strings',
      text: 'The API starts only the binaries your runtime files name, and sends approval keys only once the live screen shows the dialog.',
    },
    {
      title: 'An audit log',
      text: 'Every approval, input, start and pairing is written down with the device that did it. Typed text never is.',
    },
    {
      title: 'Your machine, your code',
      text: 'The daemon is yours and there is no muxtower cloud. The hosted site is static: it never sees a token.',
    },
  ],
  policy: 'Read the security policy',
}
