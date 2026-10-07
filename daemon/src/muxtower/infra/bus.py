"""In-process pub/sub. Topics: "sessions" (list changed), "screen:<id>" (a watched screen changed),
"attention:<id>" (a session entered an attention state)."""

import asyncio
from collections import defaultdict
from typing import Any


class EventBus:
    def __init__(self) -> None:
        self._subscribers: dict[str, set[asyncio.Queue[tuple[str, Any]]]] = defaultdict(set)

    def subscribe(self, topic: str, queue: asyncio.Queue[tuple[str, Any]]) -> None:
        self._subscribers[topic].add(queue)

    def unsubscribe(self, topic: str, queue: asyncio.Queue[tuple[str, Any]]) -> None:
        self._subscribers[topic].discard(queue)

    def unsubscribe_all(self, queue: asyncio.Queue[tuple[str, Any]]) -> None:
        for queues in self._subscribers.values():
            queues.discard(queue)

    def publish(self, topic: str, payload: Any) -> None:
        prefix = topic.split(":", 1)[0] + ":*"
        for key in (topic, prefix):
            for queue in list(self._subscribers.get(key, ())):
                if queue.qsize() < 100:  # a stalled consumer drops frames instead of growing forever
                    queue.put_nowait((topic, payload))
