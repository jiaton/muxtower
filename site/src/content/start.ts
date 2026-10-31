/** Get started: install, put HTTPS in front, pair. */

export type RouteId = 'tailscale' | 'domain'

export const start = {
  eyebrow: 'Get started',
  title: 'Three commands to your phone.',
  lead: 'Python 3.11+ and tmux on the machine your agents run on. The daemon serves the app itself.',
  autostart:
    'muxtower starts its daemon when you first run it. To keep it running across reboots, run `muxtower serve` as a service: the README has a systemd unit.',
}

export const install = {
  title: 'Install, and start an agent',
  lead: 'Agents you already run in tmux are picked up as they are.',
  commands: ['pipx install muxtower', 'muxtower run claude'],
}

export const https = {
  title: 'Give it an HTTPS address',
  lead: 'Your phone needs HTTPS to install the app and receive notifications. Both ways are fully supported.',
}

export const routes: { id: RouteId; label: string; lead: string }[] = [
  {
    id: 'tailscale',
    label: 'Tailscale (quickest)',
    lead: 'No domain, no open port. Only devices on your tailnet can reach the daemon. Sign in to Tailscale on this machine and on your phone, then:',
  },
  {
    id: 'domain',
    label: 'Your own domain',
    lead: 'Reachable from any browser, anywhere, with no VPN app. Put any reverse proxy or tunnel in front and set public_url to its address.',
  },
]

export const tailscale = {
  command: 'muxtower expose tailscale',
  note: 'It runs tailscale serve for you and writes the address to the config. Tailscale keeps serving it across restarts.',
}

export const domain = {
  caddy: `muxtower.example.com {
    reverse_proxy 127.0.0.1:8731
}`,
  config: `# ~/.config/muxtower/config.toml
public_url = "https://muxtower.example.com"`,
  others: 'Cloudflare Tunnel, nginx, Traefik or a load balancer work the same way: anything that passes WebSocket upgrades.',
  signIn:
    'Bring your own sign-in: Cloudflare Access, oauth2-proxy, Authelia or a password gate in front all work. Behind it, muxtower still asks every device for its own token.',
}

export const pair = {
  title: 'Pair your phone',
  lead: 'Scan the QR code it prints with your phone’s camera, or open the address and enter the code. Each device gets its own token, revocable any time.',
  command: 'muxtower pair',
}
