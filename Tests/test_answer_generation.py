import json

import pytest

from Generation import answer_generator


class MockResponse:
    def __init__(self, payload, status_code=200):
        self.payload = payload
        self.status_code = status_code
        self.ok = status_code < 400

    def json(self):
        return self.payload



def test_generate_answer_returns_grounded_citations(monkeypatch):
    monkeypatch.setenv("ANTHROPIC_API_KEY", "test-key")
    captured = {}

    def fake_post(url, headers, json, timeout):
        captured.update({"url": url, "headers": headers, "json": json, "timeout": timeout})
        return MockResponse({
            "content": [{
                "type": "text",
                "text": json_module.dumps({
                    "answer": "The care plan includes hydration support.",
                    "citations": [{"part": "Hydration support", "chunk_ids": ["chunk-1"]}],
                }),
            }],
        })

    json_module = json
    monkeypatch.setattr(answer_generator.requests, "post", fake_post)
    result = answer_generator.generate_answer(
        "What support is needed?",
        [{"chunk_id": "chunk-1", "text": "Hydration reminder each day."}],
    )

    assert result["answer"] == "The care plan includes hydration support."
    assert result["citations"][0]["chunk_ids"] == ["chunk-1"]
    assert captured["headers"]["x-api-key"] == "test-key"
    assert "Hydration reminder" in captured["json"]["messages"][0]["content"]


def test_generate_answer_fails_explicitly_without_key(monkeypatch):
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)

    with pytest.raises(RuntimeError, match="anthropic_api_key_missing"):
        answer_generator.generate_answer("Question", [{"chunk_id": "chunk-1", "text": "Context"}])


def test_generate_answer_rejects_upstream_failure(monkeypatch):
    monkeypatch.setenv("ANTHROPIC_API_KEY", "test-key")
    monkeypatch.setattr(
        answer_generator.requests,
        "post",
        lambda *args, **kwargs: MockResponse({}, status_code=503),
    )

    with pytest.raises(RuntimeError, match="anthropic_request_failed:503"):
        answer_generator.generate_answer("Question", [{"chunk_id": "chunk-1", "text": "Context"}])


def test_generate_answer_rejects_unknown_citation(monkeypatch):
    monkeypatch.setenv("ANTHROPIC_API_KEY", "test-key")
    monkeypatch.setattr(
        answer_generator.requests,
        "post",
        lambda *args, **kwargs: MockResponse({
            "content": [{
                "type": "text",
                "text": json.dumps({
                    "answer": "Unsupported claim.",
                    "citations": [{"part": "Claim", "chunk_ids": ["chunk-9"]}],
                }),
            }],
        }),
    )

    with pytest.raises(ValueError, match="unknown chunk ID"):
        answer_generator.generate_answer("Question", [{"chunk_id": "chunk-1", "text": "Context"}])
