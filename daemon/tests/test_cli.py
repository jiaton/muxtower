import pytest

from muxtower import __version__
from muxtower.cli.main import main
from muxtower.cli.serve import RedactTokenFilter


def test_access_log_redacts_query_token() -> None:
    import logging

    record = logging.LogRecord(
        "uvicorn.access", 20, "", 0, '%s "%s"', ("1.2.3.4", "GET /v1/stream?access_token=abc&x=1"), None
    )
    RedactTokenFilter().filter(record)
    assert "abc" not in record.getMessage()
    assert "access_token=[redacted]&x=1" in record.getMessage()


def test_websocket_lines_are_redacted_too() -> None:
    import logging

    from muxtower.cli import serve

    seen: list[str] = []

    class Keep(logging.Handler):
        def emit(self, record: logging.LogRecord) -> None:
            seen.append(record.getMessage())

    error = logging.getLogger("uvicorn.error")
    handler = Keep()
    error.addHandler(handler)
    try:
        serve.redact_logs()
        error.warning('%s - "WebSocket %s" [accepted]', "1.2.3.4:5", "/v1/stream?access_token=mxt_secret")
    finally:
        error.removeHandler(handler)
        for name in ("uvicorn.access", "uvicorn.error"):
            logging.getLogger(name).filters.clear()
    assert seen == ['1.2.3.4:5 - "WebSocket /v1/stream?access_token=[redacted]" [accepted]']


def test_version_says_the_install_and_its_hub_link(capsys: pytest.CaptureFixture[str]) -> None:
    with pytest.raises(SystemExit) as done:
        main(["--version"])
    assert done.value.code == 0
    assert capsys.readouterr().out.startswith(f"muxtower {__version__} (hub link protocol ")
