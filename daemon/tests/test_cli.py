from muxtower.cli.daemon import RedactTokenFilter


def test_access_log_redacts_query_token() -> None:
    import logging

    record = logging.LogRecord(
        "uvicorn.access", 20, "", 0, '%s "%s"', ("1.2.3.4", "GET /v1/stream?token=abc&x=1"), None
    )
    RedactTokenFilter().filter(record)
    assert "abc" not in record.getMessage()
    assert "token=[redacted]&x=1" in record.getMessage()
