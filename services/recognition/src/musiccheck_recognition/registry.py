"""Provider selection from configuration.

No provider is implemented yet: the neural model is gated on the M0 feasibility experiment
(docs/agent/BACKLOG.md). Until then the only valid setting is ``none`` and the API reports
``provider_unavailable`` honestly instead of fabricating results.
"""

from __future__ import annotations

from collections.abc import Callable, Mapping

from .provider import RecognitionProvider

ProviderFactory = Callable[[Mapping[str, str]], RecognitionProvider]

# Register implementations here, e.g. "neural": NeuralRecognitionProvider.from_config
_FACTORIES: dict[str, ProviderFactory] = {}

NONE = "none"


class UnknownProviderError(ValueError):
    pass


def available_providers() -> list[str]:
    return [NONE, *sorted(_FACTORIES)]


def create_provider(
    name: str, options: Mapping[str, str] | None = None
) -> RecognitionProvider | None:
    """Instantiate the provider called ``name``; ``"none"`` returns None."""
    key = name.strip().lower()
    if key == NONE:
        return None
    factory = _FACTORIES.get(key)
    if factory is None:
        raise UnknownProviderError(
            f"Unknown recognition provider {name!r}; available: {', '.join(available_providers())}"
        )
    return factory(options or {})
