import json
from pathlib import Path

from backend.rag.retriever import _project_chunks, retrieve, tokens

CASES = json.loads((Path(__file__).parent / 'cases.json').read_text(encoding='utf-8-sig'))


def test_project_document_retrieval_eval():
    """Technical grounding smoke eval; these cases do not assess medical quality."""
    chunks = _project_chunks()
    results = []
    for case in CASES:
        hits = retrieve(case['question'], chunks, limit=3)
        results.append((case, hits))
    missed = [case['question'] for case, hits in results if not any(hit['source'].startswith(case['source']) and set(tokens(case['term'])) <= set(tokens(hit['text'])) for hit in hits)]
    assert not missed, f"Expected source passage not retrieved: {missed}"


def test_eval_set_size_and_scope():
    assert 10 <= len(CASES) <= 15
    assert all(case['source'].startswith(('README.md', 'docs/')) for case in CASES)
