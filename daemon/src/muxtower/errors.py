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


class Unavailable(Exception):
    """A service the daemon depends on (outside tmux) failed or could not be reached."""


class LoginExpired(Unavailable):
    """The Claude login on the daemon's machine is missing or no longer works: only logging in again there
    (`claude /login`) brings it back."""
