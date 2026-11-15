import json

import requests

from .gemini_service import GeminiService, GeminiServiceError


class OmniRouteService(GeminiService):
    """Use an OmniRoute model or combo for the shared safety analysis prompts."""

    def __init__(self, base_url: str, model: str, api_key: str = ""):
        self.endpoint = f"{base_url.rstrip('/')}/chat/completions"
        self.models = [value.strip() for value in model.split(",") if value.strip()]
        self.headers = {"Authorization": f"Bearer {api_key}"} if api_key else {}

    def generate_json(self, prompt: str) -> dict:
        last_error = None
        for model in self.models:
            try:
                return self._request_json(model, prompt)
            except (requests.RequestException, ValueError, KeyError, IndexError, TypeError, AttributeError) as error:
                last_error = error
        raise GeminiServiceError("OmniRoute is unavailable or returned invalid data.") from last_error

    def _request_json(self, model: str, prompt: str) -> dict:
        response = requests.post(
            self.endpoint,
            headers=self.headers,
            json={
                "model": model,
                "messages": [
                    {"role": "system", "content": "Return one valid JSON object without commentary."},
                    {"role": "user", "content": prompt},
                ],
                "stream": False,
                "max_tokens": 2048,
            },
            # Leave time for the second model within the website proxy's 35-second limit.
            timeout=(3, 12),
        )
        response.raise_for_status()
        content = response.json()["choices"][0]["message"]["content"].strip()
        if content.startswith("```") and content.endswith("```"):
            content = content.split("\n", 1)[-1][:-3].strip()
        result = json.loads(content)
        if not isinstance(result, dict):
            raise ValueError("Expected a JSON object")
        return result
