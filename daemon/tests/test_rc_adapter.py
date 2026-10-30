from pathlib import Path

import httpx
import pytest

from muxtower.errors import Conflict, LoginExpired, NotFound, Unavailable
from muxtower.sources.remote_control.adapter import _translated
from muxtower.vendor.claude_rc import APIError, ControlRejected, ControlTimeout, CredentialsError


@pytest.mark.parametrize(
    ("raised", "expected"),
    [
        (ControlRejected("no"), Conflict),
        (ControlTimeout("r1", "slow"), Unavailable),
        (APIError(404, "{}"), NotFound),
        (APIError(500, '{"echo": "request text"}'), Unavailable),
        (CredentialsError("expired"), LoginExpired),
        (APIError(401, "{}"), LoginExpired),  # refused after the client tried to renew its token
        (httpx.ConnectError("down"), Unavailable),
    ],
)
def test_client_failures_become_domain_errors(raised: Exception, expected: type[Exception]) -> None:
    with pytest.raises(expected) as caught, _translated():
        raise raised
    assert "request text" not in str(caught.value)  # response bodies stay out of messages


def test_a_machine_not_logged_in_fails_its_calls_not_the_daemon(tmp_path: Path) -> None:
    from muxtower.sources.remote_control.adapter import AnthropicRemoteControl

    port = AnthropicRemoteControl(tmp_path / "no-credentials.json", tmp_path / "no-config.json")  # starts
    with pytest.raises(LoginExpired):
        port.list_sessions(None)
