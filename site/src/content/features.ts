/** The bento of features: one line each; the visual in each cell says the rest. */
export const featureCells = {
  reach: {
    title: 'Talk to any of them',
    text: 'Reply from your phone, quoting the line you answer. A push when one is done or needs you. Installs from the browser.',
    chips: ['Push', 'Reply', 'Voice', 'Terminal keys', 'Even Realities G2'],
    notification: { title: 'shop', body: 'Done: retries with backoff, 3 attempts', where: 'server · ~/code/shop' },
    quote: 'Retries with backoff, 3 attempts',
    reply: 'Make it 5, and log each one.',
  },
  assistant: {
    title: 'One assistant over all of them',
    text: 'Ask one session on the hub instead of each. It reads, sums up and answers for you.',
    ask: 'Anything waiting on me?',
    answer: 'One: shop on the server has a question for you. api finished its migration.',
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
    // As the app words them (app/src/features/voice/components/live.tsx and live/feedback.ts).
    said: 'Run the migration on staging',
    writing: 'Live · writing what you say',
    hearing: 'Live · hearing you…',
    hint: '· say send to send, pause to stop writing · commands on device',
    transcribing: ' · transcribing 1',
    sent: '✓ sent',
    paused: '✓ paused',
    commandsOnly: 'Commands only',
    resumeHint: '· say resume to write again',
    resume: 'Write again',
    placeholder: 'Message the agent',
  },
  api: {
    title: 'Build your own client',
    text: 'A typed HTTP and WebSocket API. A desk key, an e-ink frame, Home Assistant.',
    lines: ['GET  /v1/sessions', 'POST /v1/sessions/{id}/input', 'WS   /v1/stream'],
  },
}
