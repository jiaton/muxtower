// Prints a port P such that P and P + 1 are both free on 127.0.0.1 (the e2e harness and the demo), so a
// test run never lands on a server another worktree or project already runs.
import net from 'node:net'

const free = (port) =>
  new Promise((resolve) => {
    const s = net.createServer().once('error', () => resolve(false))
    s.listen(port, '127.0.0.1', () => s.close(() => resolve(true)))
  })

const anyPort = () =>
  new Promise((resolve) => {
    const s = net.createServer().listen(0, '127.0.0.1', () => {
      const { port } = s.address()
      s.close(() => resolve(port))
    })
  })

for (let i = 0; i < 50; i++) {
  const p = await anyPort()
  if (p < 65535 && (await free(p + 1))) {
    process.stdout.write(String(p))
    process.exit(0)
  }
}
process.exit(1)
