"""Domain errors. Services raise these; app.py maps them to HTTP status codes."""


class NotFound(Exception):
    pass


class Invalid(Exception):
    pass


class Conflict(Exception):
    pass


class Forbidden(Exception):
    pass
