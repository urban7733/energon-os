"""Talks to the Energon API with the job token. Standard library only."""

from __future__ import annotations

import json
import time
import urllib.error
import urllib.request
from typing import Any


class ApiError(RuntimeError):
    def __init__(self, status: int, message: str) -> None:
        super().__init__(f"Energon API {status}: {message}")
        self.status = status


class TrainerApi:
    def __init__(self, api_url: str, job_id: str, job_token: str, timeout: float = 30.0) -> None:
        self.base = f"{api_url.rstrip('/')}/v1/trainer/jobs/{job_id}"
        self.token = job_token
        self.timeout = timeout

    def dataset(self) -> dict[str, Any]:
        return self._request("GET", "/dataset")

    def heartbeat(self, message: str) -> None:
        self._request("POST", "/heartbeat", {"message": message[:200]})

    def succeed(self, result: dict[str, Any]) -> dict[str, Any]:
        return self._request("POST", "/result", {"status": "succeeded", "result": result})

    def fail(self, error: str) -> dict[str, Any]:
        return self._request("POST", "/result", {"status": "failed", "error": error[:2000]})

    def _request(self, method: str, path: str, body: dict | None = None) -> dict[str, Any]:
        data = json.dumps(body).encode() if body is not None else None
        for attempt in range(3):
            request = urllib.request.Request(
                self.base + path,
                data=data,
                method=method,
                headers={"Authorization": f"Bearer {self.token}", "Content-Type": "application/json"},
            )
            try:
                with urllib.request.urlopen(request, timeout=self.timeout) as response:
                    raw = response.read()
                    return json.loads(raw) if raw else {}
            except urllib.error.HTTPError as error:
                message = error.read().decode(errors="replace")[:500]
                if error.code < 500 or attempt == 2:
                    raise ApiError(error.code, message) from None
            except urllib.error.URLError:
                if attempt == 2:
                    raise
            time.sleep(2**attempt)
        raise AssertionError("unreachable")
