"""The real client address behind trusted reverse proxies."""

import ipaddress

from starlette.requests import HTTPConnection


class ClientAddress:
    def __init__(self, trusted_proxies: list[str]) -> None:
        self.trusted = [ipaddress.ip_network(cidr, strict=False) for cidr in trusted_proxies]

    def _is_trusted(self, address: str) -> bool:
        try:
            ip = ipaddress.ip_address(address.strip())
        except ValueError:
            return False
        return any(ip in network for network in self.trusted)

    def of(self, conn: HTTPConnection) -> str:
        """Walk X-Forwarded-For from the right, skipping trusted proxies; the first other hop is the
        client. Without a trusted peer the header is ignored (anyone could have written it)."""
        peer = conn.client.host if conn.client else "unknown"
        if not self._is_trusted(peer):
            return peer
        hops = [h.strip() for h in conn.headers.get("x-forwarded-for", "").split(",") if h.strip()]
        for hop in reversed(hops):
            if not self._is_trusted(hop):
                return hop
        return peer
