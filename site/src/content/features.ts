/** The bento of features: one line each; the visual in each cell says the rest. */
export const featureCells = {
  reach: {
    title: 'Push, reply, approve',
    text: 'A notification when an agent needs you or is done. Quote the line you answer; approve with the exact command.',
    chips: ['Push', 'Reply', 'Voice', 'Terminal keys', 'Even Realities G2'],
    notification: { title: 'shop', body: 'Approve Bash: npm test -- payments', where: 'server · ~/code/shop' },
    quote: 'Retries with backoff, 3 attempts',
    reply: 'Make it 5, and log each one.',
  },
  assistant: {
    title: 'One assistant over all of them',
    text: 'Ask one session on the hub instead of each. It reads, sums up and answers for you.',
    ask: 'Anything waiting on me?',
    answer: 'One: shop on the server wants to run npm test. api finished its migration.',
  },
  desk: {
    title: 'Start at your desk',
    text: 'Claude desktop and Codex app sessions are listed too, with their whole conversation.',
    apps: ['Claude desktop', 'Codex app', 'tmux'],
  },
  updates: {
    title: 'Update the hub only',
    text: 'Machines joined to it follow. A daemon restart never stops a running agent.',
    version: '0.1.47',
    machines: ['server', 'vps', 'macbook', 'pc'],
  },
  live: {
    title: 'Talk instead of type',
    text: 'Live writes what you say into the open session, and “send” sends it.',
    // As the app words them (app/src/features/voice/components/live.tsx and live/pipeline.ts).
    said: 'Run the migration on staging',
    listening: 'Listening · say send to send, pause to pause · commands on device',
    hearing: 'Hearing you…',
    added: 'added: Run the migration on staging',
    sent: 'send ✓ (on device)',
    placeholder: 'Message the agent',
  },
  api: {
    title: 'Build your own client',
    text: 'A typed HTTP and WebSocket API. A desk key, an e-ink frame, Home Assistant.',
    lines: ['GET  /v1/sessions', 'POST /v1/sessions/{id}/approve', 'WS   /v1/stream'],
  },
}
