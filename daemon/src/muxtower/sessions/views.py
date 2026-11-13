"""How a session muxtower runs is shown: what its record, live state and runtime make of it."""

from typing import TYPE_CHECKING

from muxtower.runtimes.models import ATTENTION_STATES
from muxtower.sessions.interrupted import interrupted_view
from muxtower.sessions.launch import mode_of
from muxtower.sessions.models import Capabilities, Session
from muxtower.sessions.naming import as_seen, chosen
from muxtower.sessions.ports import SessionRecord, SessionSource

if TYPE_CHECKING:
    from muxtower.sessions.service import SessionService


def session_view(svc: "SessionService", record: SessionRecord) -> Session:
    """A session muxtower started or adopted, as listed: its state merged from hooks and screen."""
    if record.interrupted_at:
        return interrupted_view(record)
    live = svc.live_of(record.id)
    eff = svc.effective(record)
    runtime = svc.runtime_of(record)
    if eff.pending is not None and runtime is not None and eff.pending.options:
        eff.pending.recommended = runtime.choose_option(eff.state, eff.pending.options)
    return Session(
        id=record.id,
        name=chosen(record, live.title, as_seen(record, live.title, live.title_origin))[0],
        agent_name=live.title,
        permission_mode=mode_of(record.launch_args, runtime.config) if runtime else None,
        runtime=record.runtime,
        cwd=record.cwd,
        source=record.source,
        tmux_socket=record.pane.socket,
        tmux_session=record.tmux_session,
        tmux_pane=record.pane.pane_id,
        remote_id=live.remote_id,
        alt_screen=live.alt_screen,
        terminal_attached=live.attached,
        in_background=live.in_background,
        capabilities=Capabilities(
            screen=True,
            conversation=live.transcript is not None,  # read from its transcript
            keys=[],
            resize=True,
            rename=True,
            terminate=record.source == SessionSource.LAUNCHED,
            archive=True,
            images=True,  # saved here and pasted in as their paths
        ),  # fmt: skip
        state=eff.state,
        state_source=eff.source,
        matched_rule=eff.matched_rule,
        needs_attention=eff.state in ATTENTION_STATES,
        pending=eff.pending,
        last_message=live.last_message,
        auto_approve=record.auto_approve,
        can_auto_approve=bool(runtime and runtime.config.auto_approve_states),
        created_at=record.created_at,
        updated_at=live.updated_at,
    )
