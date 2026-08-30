import logging
import asyncio
from typing import List, Dict, Any, Callable
from datetime import datetime

class WebSocketLogHandler(logging.Handler):
    """Logging handler that dispatches log records to async subscribers."""

    def __init__(self):
        super().__init__()
        self.subscribers: List[Callable[[Dict[str, Any]], None]] = []

    def subscribe(self, callback: Callable[[Dict[str, Any]], None]):
        self.subscribers.append(callback)

    def unsubscribe(self, callback: Callable[[Dict[str, Any]], None]):
        if callback in self.subscribers:
            self.subscribers.remove(callback)

    def emit(self, record: logging.LogRecord):
        try:
            msg = self.format(record)
            now = datetime.now()
            ts = f"{now.strftime('%H:%M:%S')}.{int(now.microsecond / 10000):02d}"

            log_entry = {
                "id": f"{record.created}_{record.msecs}",
                "timestamp": ts,
                "level": record.levelname,
                "message": msg,
                "module": record.name,
            }

            for sub in list(self.subscribers):
                try:
                    sub(log_entry)
                except Exception:
                    pass
        except Exception:
            self.handleError(record)

# Global singleton log handler
ws_log_handler = WebSocketLogHandler()
ws_log_handler.setFormatter(logging.Formatter("%(message)s"))
logging.getLogger().addHandler(ws_log_handler)

