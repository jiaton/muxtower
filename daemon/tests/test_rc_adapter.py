import httpx
import pytest

from muxtower.errors import Conflict, NotFound, Unavailable
from muxtower.sources.remote_control.adapter import _translated
from muxtower.vendor.claude_rc import APIError, ControlRejected, ControlTimeout, CredentialsError


@pytest.mark.parametrize(
    ("raised", "expected"),
    [
        (ControlRejected("no"), Conflict),
        (ControlTimeout("r1", "slow"), Unavailable),
        (APIError(404, "{}"), NotFound),
        (APIError(500, '{"echo": "request text"}'), Unavailable),
        (CredentialsError("expired"), Unavailable),
        (httpx.ConnectError("down"), Unavailable),
    ],
)
def test_client_failures_become_domain_errors(raised: Exception, expected: type[Exception]) -> None:
    with pytest.raises(expected) as caught, _translated():
        raise raised
    assert "request text" not in str(caught.value)  # response bodies stay out of messages
