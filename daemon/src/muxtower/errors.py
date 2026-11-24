"""Domain errors. Services raise these; app.py maps them to HTTP status codes."""


class NotFound(Exception):
    pass


class Invalid(Exception):
    pass


class Conflict(Exception):
    pass


class Forbidden(Exception):
    pass


class Unauthorized(Exception):
    """A credential was presented and is wrong. The only domain error that answers 401, so fail2ban-style
    log watchers can treat 401/403 as "someone is guessing" (see README > Security model)."""


class TooManyRequests(Exception):
    pass


class TooLarge(Exception):
    """A body past what the daemon takes (413)."""


class Unavailable(Exception):
    """A service the daemon depends on (outside tmux) failed or could not be reached."""


class NotSent(Unavailable):
    """Unavailable before anything was asked (a node's link to its hub was down): nothing was done there."""


class LoginExpired(Unavailable):
    """The Claude login on the daemon's machine is missing or no longer works: only logging in again there
    (`claude /login`) brings it back."""


# The status each domain error answers with (serving.py adds an adapter's own, such as tmux's).
# 503, not 502: Cloudflare (a tunnel) swaps an origin's 502 for its own page, and the reason is lost.
STATUSES: tuple[tuple[type[Exception], int], ...] = (
    (NotFound, 404), (Invalid, 400), (Conflict, 409), (Forbidden, 403), (Unauthorized, 401),
    (TooManyRequests, 429), (TooLarge, 413), (Unavailable, 503),
)  # fmt: skip


def status_of(error: Exception) -> int:
    """The status a request failing with `error` answers: 500 for one that is not a domain error."""
    return next((status for kind, status in STATUSES if isinstance(error, kind)), 500)
