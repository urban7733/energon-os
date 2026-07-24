"""Small standard-library HTTP client for one authenticated Energon agent."""

from __future__ import annotations

import json
from typing import Any, Mapping
from urllib.error import HTTPError, URLError
from urllib.parse import urlparse
from urllib.request import Request, urlopen

SDK_VERSION = "0.1.0"


class EnergonError(Exception):
    """An HTTP error returned by the Energon control plane."""

    def __init__(self, status: int, message: str, body: object | None = None) -> None:
        super().__init__(message)
        self.status = status
        self.body = body


class EnergonNetworkError(Exception):
    """A connection, timeout, or malformed response error."""


class _MemoryOperations:
    def __init__(self, client: Energon) -> None:
        self._client = client

    def remember(
        self,
        *,
        content: str,
        tags: list[str] | None = None,
        source: str | None = None,
    ) -> Mapping[str, Any]:
        body: dict[str, object] = {
            "scope": "agent_private",
            "content": _required_text(content, "content"),
            "tags": _normalise_text_list(tags),
        }
        if source is not None:
            body["source"] = _required_text(source, "source")
        return self._client._request("POST", "/v1/memory/write", body)

    def share(
        self,
        *,
        memory_id: str,
        target: str,
        reason: str,
    ) -> Mapping[str, Any]:
        if target not in {"open", "org", "project", "role"}:
            raise ValueError("target must be open, org, project, or role")
        return self._client._request(
            "POST",
            "/v1/memory/promote",
            {
                "memory_id": _required_text(memory_id, "memory_id"),
                "target_scope": target,
                "reason": _required_text(reason, "reason"),
            },
        )


class _ContextOperations:
    def __init__(self, client: Energon) -> None:
        self._client = client

    def build(
        self,
        *,
        task: str,
        project_id: str | None = None,
        token_budget: int | None = None,
    ) -> Mapping[str, Any]:
        if token_budget is not None and (not isinstance(token_budget, int) or token_budget <= 0):
            raise ValueError("token_budget must be a positive integer when provided")
        body: dict[str, object] = {"task": _required_text(task, "task")}
        if project_id is not None:
            body["project_id"] = _required_text(project_id, "project_id")
        if token_budget is not None:
            body["token_budget"] = token_budget
        return self._client._request("POST", "/v1/context/build", body)


class _SkillOperations:
    def __init__(self, client: Energon) -> None:
        self._client = client

    def list(self) -> list[Mapping[str, Any]]:
        response = self._client._request("GET", "/v1/skills")
        skills = response.get("skills")
        if not isinstance(skills, list):
            raise EnergonNetworkError("Energon returned an invalid skills response")
        return skills

    def create(
        self,
        *,
        name: str,
        instructions: str,
        allowed_tools: list[str] | None = None,
        requires_approval_for: list[str] | None = None,
    ) -> Mapping[str, Any]:
        return self._client._request(
            "POST",
            "/v1/skills",
            {
                "name": _required_text(name, "name"),
                "instructions": _required_text(instructions, "instructions"),
                "allowed_tools": _normalise_text_list(allowed_tools),
                "requires_approval_for": _normalise_text_list(requires_approval_for),
            },
        )


class Energon:
    """A server-side client authenticated as exactly one Energon agent."""

    def __init__(self, *, base_url: str, api_key: str, timeout: float = 15.0) -> None:
        parsed = urlparse(_required_text(base_url, "base_url"))
        if parsed.scheme not in {"http", "https"} or not parsed.netloc:
            raise ValueError("base_url must be an absolute http or https URL")
        if not isinstance(timeout, (int, float)) or timeout <= 0:
            raise ValueError("timeout must be a positive number")
        self._base_url = base_url.rstrip("/")
        self._api_key = _required_text(api_key, "api_key")
        self._timeout = float(timeout)
        self.memory = _MemoryOperations(self)
        self.context = _ContextOperations(self)
        self.skills = _SkillOperations(self)

    def _request(
        self,
        method: str,
        path: str,
        body: Mapping[str, object] | None = None,
    ) -> Mapping[str, Any]:
        data = json.dumps(body).encode("utf-8") if body is not None else None
        headers = {
            "Authorization": f"Bearer {self._api_key}",
            "Accept": "application/json",
            "X-Energon-SDK": f"python/{SDK_VERSION}",
        }
        if data is not None:
            headers["Content-Type"] = "application/json"
        request = Request(f"{self._base_url}{path}", data=data, headers=headers, method=method)

        try:
            with urlopen(request, timeout=self._timeout) as response:  # noqa: S310 -- URL is explicit SDK configuration.
                return _json_object(response.read())
        except HTTPError as error:
            body_value = _read_json(error)
            message = body_value.get("error") if isinstance(body_value, dict) else None
            raise EnergonError(error.code, str(message or f"Energon request failed with status {error.code}"), body_value) from error
        except (URLError, OSError) as error:
            raise EnergonNetworkError("Unable to reach the Energon control plane") from error


def _required_text(value: str, field: str) -> str:
    if not isinstance(value, str) or not (normalised := value.strip()):
        raise ValueError(f"{field} cannot be empty")
    return normalised


def _normalise_text_list(values: list[str] | None) -> list[str]:
    return [_required_text(value, "list item") for value in values or [] if value.strip()]


def _json_object(raw: bytes) -> Mapping[str, Any]:
    try:
        value = json.loads(raw.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError) as error:
        raise EnergonNetworkError("Energon returned an invalid JSON response") from error
    if not isinstance(value, dict):
        raise EnergonNetworkError("Energon returned a JSON response with the wrong shape")
    return value


def _read_json(response: HTTPError) -> object | None:
    try:
        return json.loads(response.read().decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError, OSError):
        return None
