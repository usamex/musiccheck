from __future__ import annotations

import pytest
from musiccheck_recognition import ModelInfo
from musiccheck_recognition.registry import (
    UnknownProviderError,
    available_providers,
    create_provider,
)


def test_none_provider_is_explicitly_absent():
    assert create_provider("none") is None
    assert create_provider(" NONE ") is None
    assert "none" in available_providers()


def test_unknown_provider_fails_loudly():
    with pytest.raises(UnknownProviderError):
        create_provider("shazam-but-not-really")


def _info(**overrides) -> ModelInfo:
    base = dict(
        name="nmfp-triplet",
        version="1",
        checkpoint_sha256="a" * 64,
        sample_rate=8000,
        embedding_dim=128,
        preprocessing={"hop_seconds": 0.5},
    )
    base.update(overrides)
    return ModelInfo(**base)


def test_model_id_is_stable():
    assert _info().model_id == _info().model_id
    assert _info().model_id.startswith("nmfp-triplet:1:")


@pytest.mark.parametrize(
    "change",
    [
        {"checkpoint_sha256": "b" * 64},
        {"sample_rate": 16000},
        {"embedding_dim": 64},
        {"preprocessing": {"hop_seconds": 0.25}},
        {"version": "2"},
    ],
)
def test_model_id_changes_with_anything_that_affects_embeddings(change):
    assert _info(**change).model_id != _info().model_id


def test_model_id_ignores_descriptive_fields():
    assert _info(license="AGPL-3.0").model_id == _info().model_id
