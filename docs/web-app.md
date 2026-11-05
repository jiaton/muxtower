# The web app

[README](../README.md) · [Install](install.md) · [Web app](web-app.md) · [More than one computer](multi-machine.md) · [Teams](teams.md) · [Agents](agents.md) · [Configuration](configuration.md) · [Security](security.md) · [Design](design.md)

**Recommended: the one the daemon serves.** Open your daemon's URL; it offers to pair with itself. Same origin as the API, so nothing to configure.

**One app for several daemons, on your own hosting.** The app is a static site; the daemons it talks to are added on each device by pairing, and stay in that browser.

- *Cloudflare Workers*: fork this repository, then in the Cloudflare dashboard **Workers & Pages → Create → Import a repository**, root directory `app`, build command `npm run build`, deploy command `npx wrangler deploy`.
- *GitHub Pages*: fork, set **Settings → Pages → Source** to *GitHub Actions*, add the repository variable `DEPLOY_PAGES=true`, and run the `pages` workflow.

**A public hosted copy.** [app.muxtower.dev](https://app.muxtower.dev) is a copy of the app hosted on its own origin (built only from tagged releases: `make public-app`, `app/deploy/`), to use without hosting one. Your pairings stay in your browser, and the host never sees your traffic (the app talks to your daemons directly), but the code it serves runs with your tokens: if that host were compromised, so would be the daemons paired there. The one your daemon serves comes first, your own hosting second; use the public copy knowing that. Pairing from a hosted app (this one or your own) needs the daemon on https: an https page cannot reach a plain-HTTP address (Tailscale serve via `muxtower expose tailscale`, or your own proxy or tunnel); on plain HTTP, open the daemon's own page and pair there. The only official domains are muxtower.dev and app.muxtower.dev; anything else asking for your daemon address or a pairing code is not us.

Daemons accept requests from any origin by default. That is safe because every request needs a token and no cookies are involved, but it lets any app origin you paired from use your tokens. To trust only the app origins you choose, list them in `cors.allowed_origins`: your daemon's own origin is always allowed, so name the others, such as your self-hosted app (a node also allows its hub's, for when the hub is down):

```toml
[cors]
allowed_origins = ["https://muxtower-app.example.com"]
```

**Where the app keeps daemons.** The daemons a browser paired with (address, name, token, push subscription) are in that browser's localStorage (`muxtower.daemons`), per browser and per origin; a daemon keeps only each token's hash. So:

- the app a daemon serves and one you host yourself have separate lists;
- each browser and device pairs on its own: no sync and no account, by design;
- on iOS, Safari and an app added to the Home Screen do not share storage: pair again in the added app;
- clearing the site's data (or the browser evicting it) means pairing again; the daemons are not affected;
- any script on that origin can read the tokens, which is why preset tokens need a gate (below);
- the nodes a hub hands over for when it is down are kept in the same list, with the same limits; after a wipe the hub hands them over again once it answers.

**Preset daemon addresses (recommended for a self-hosted app).** A deployment can ship a default daemon list in `config.json`, generated at build time from the `MUXTOWER_APP_CONFIG` build variable or secret. With addresses only, a new browser or device already lists your daemons and you only enter a pairing code; that is safe without a gate, since a code is still needed:

```json
{ "daemons": [
  { "name": "hub", "url": "https://hub.example.com" },
  { "name": "laptop", "url": "https://laptop.example.ts.net" }
] }
```

An app hosted away from the hub's machine (Workers, Pages) also still loads while that machine and its way in are down, which the cached app cannot promise to a new device or after the cache was cleared (then open a node's own address: every daemon serves the same app).

Adding `"token"` to an entry skips pairing entirely, but anyone who can load the site can then read that token. The build refuses unless you also set `"acknowledge_public_tokens": true`, and the app shows a warning. The trade-off: the gate's login becomes the only barrier (anyone past it controls those daemons), and revoking means rebuilding and deploying again. Only do this behind a gate you trust, such as Cloudflare Access, your own SSO or a password gate. A gate in front of the static app is a good extra layer either way.

**Session names.** A name you give a session in muxtower (when starting it, or by renaming it) stays: a title Claude makes up, or one claude.ai regenerates for a Remote Control session, does not replace it. Renamed in the Claude app, a session shows that name once muxtower sees it change; to be sure, rename it in muxtower too. A session you never named goes by its agent's own name.

**Moving to another device.** On a paired phone, *Daemons → Add another device* shows one QR code that pairs the other device with every daemon at once. It carries one-time codes, not tokens: each device gets its own token, and the QR stops working after one use or five minutes.

## On Even Realities G2 glasses

The daemon also serves a glasses app at `/g2/` (`glasses/`, an Even Hub app): what needs you first, then each machine's sessions; approve with two taps; long replies as a short summary first (`summaries.provider`); answer by voice, holding or tap-to-tap with the text appearing as you speak (`asr.provider`). Open it with the Even App's developer mode (`npx -p @evenrealities/evenhub-cli evenhub qr --url https://<daemon>/g2/`) and pair it with a code from `muxtower pair`. Details: `glasses/AGENTS.md`, [g2.md](g2.md).
