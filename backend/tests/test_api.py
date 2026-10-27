import base64
import json

from fastapi.testclient import TestClient

from backend.app.main import app
from backend.rag import retriever

client = TestClient(app)


def test_demo_flow(monkeypatch):
    monkeypatch.delenv('OPENAI_API_KEY', raising=False)
    patients = client.get('/api/patients').json()
    assert len(patients) == 5
    expected = ['Faible', 'Modéré', 'Élevé']
    for index, level in enumerate(expected, 1):
        patient = client.get(f'/api/patients/DEMO-{index:03}').json()
        result = client.post(f'/api/analyze/DEMO-{index:03}').json()
        assert result['synthesis']['risk_level'] == level
        assert {agent['agent'] for agent in result['agents']} == {
            'clinical', 'biological', 'longitudinal', 'imaging',
        }
        clinical_agent = next(agent for agent in result['agents'] if agent['agent'] == 'clinical')
        assert {item['name'] for item in clinical_agent['evidence']} == {
            'Fréquence respiratoire', 'SpO2', 'Température', 'Fréquence cardiaque', 'Pression systolique',
        }
        biological_agent = next(agent for agent in result['agents'] if agent['agent'] == 'biological')
        if patient['biological']:
            assert len(biological_agent['evidence']) == len(patient['biological'])
        longitudinal_agent = next(agent for agent in result['agents'] if agent['agent'] == 'longitudinal')
        assert longitudinal_agent['artifacts']['series'] == patient['longitudinal']
        image_agent = next(agent for agent in result['agents'] if agent['agent'] == 'imaging')
        assert image_agent['available'] is False
        assert 'demo_heatmap' not in image_agent['artifacts']
    result = client.post('/api/analyze/DEMO-004').json()
    assert result['synthesis']['priority_review']
    assert not next(agent for agent in result['agents'] if agent['agent'] == 'biological')['available']
    assert not next(agent for agent in result['agents'] if agent['agent'] == 'imaging')['available']
    patient = client.get('/api/patients/DEMO-005').json()
    result = client.post('/api/analyze/DEMO-005').json()
    assert result['synthesis']['risk_score'] is not None
    assert {agent['agent'] for agent in result['agents']} == {'clinical', 'biological', 'longitudinal', 'imaging'}
    assert all(agent['available'] for agent in result['agents'])
    image_agent = next(agent for agent in result['agents'] if agent['agent'] == 'imaging')
    assert image_agent['artifacts']['demo_heatmap'] is True
    assert next(agent for agent in result['agents'] if agent['agent'] == 'longitudinal')['artifacts']['series'] == patient['longitudinal']
    assert patient['biological']['crp']['value'] == patient['longitudinal'][-1]['crp']
    assert patient['clinical']['respiratory_rate'] == patient['longitudinal'][-1]['respiratory_rate']
    assert patient['clinical']['spo2'] == patient['longitudinal'][-1]['spo2']
    assert patient['clinical']['heart_rate'] == patient['longitudinal'][-1]['heart_rate']
    assert patient['clinical']['temperature'] == patient['longitudinal'][-1]['temperature']
    assert patient['image']['path'] == 'test.png'
    assert patient['image']['paired_output_path'] == 'test expl.jpeg'
    assert client.get('/api/artifacts/DEMO-001/gradcam.png').status_code == 200


def test_errors_and_decision(monkeypatch):
    monkeypatch.delenv('OPENAI_API_KEY', raising=False)
    assert client.get('/api/patients/nope').status_code == 404
    result = client.post('/api/analyze/DEMO-005').json()
    saved = client.post('/api/decisions', json={
        'analysis_id': result['analysis_id'], 'patient_id': 'DEMO-005',
        'decision': 'accept', 'comment': 'Demo',
    })
    assert saved.status_code == 200
    assert client.get('/api/audit/DEMO-005').json()[-1]['decision'] == 'accept'


def test_demo_radiograph_and_illustrative_heatmap_assets():
    image = client.get('/api/demo/radiograph/image')
    heatmap = client.get('/api/demo/radiograph/heatmap')
    assert image.status_code == heatmap.status_code == 200
    assert image.headers['content-type'] == heatmap.headers['content-type'] == 'image/png'
    assert len(image.content) > 100_000 and len(heatmap.content) > 100_000
    assert image.content == (retriever.ROOT / 'data' / 'demo_patients' / 'test.png').read_bytes()
    assert heatmap.content == (retriever.ROOT / 'data' / 'demo_patients' / 'test expl.jpeg').read_bytes()
    assert client.get('/api/demo/radiograph/unknown').status_code == 404


def test_demo_analysis_uses_existing_output_without_multimodal_provider(monkeypatch):
    from backend.agents import vision

    def unexpected_network_call(*_args, **_kwargs):
        raise AssertionError('The precomputed demo image must not call a multimodal provider.')

    monkeypatch.setattr(vision, 'urlopen', unexpected_network_call)
    monkeypatch.setenv('OPENAI_API_KEY', 'demo-key')
    monkeypatch.setenv('OPENAI_CHAT_MODEL', 'gemini-2.5-flash')
    monkeypatch.setenv('OPENAI_BASE_URL', 'https://generativelanguage.googleapis.com/v1beta/openai/')

    response = client.post('/api/analyze/DEMO-005')

    assert response.status_code == 200
    result = response.json()
    image_agent = next(agent for agent in result['agents'] if agent['agent'] == 'imaging')
    assert image_agent['available'] is True
    assert image_agent['artifacts']['demo_heatmap'] is True
    assert 'aucune analyse automatisée' in image_agent['findings'][0]


def test_demo_analysis_displays_existing_images_without_consent_or_provider(monkeypatch):
    from backend.agents import vision

    def unexpected_network_call(*_args, **_kwargs):
        raise AssertionError('Multimodal provider must not be called without consent.')

    monkeypatch.setattr(vision, 'urlopen', unexpected_network_call)
    monkeypatch.setenv('OPENAI_API_KEY', 'demo-key')
    monkeypatch.setenv('OPENAI_CHAT_MODEL', 'gemini-2.5-flash')

    response = client.post('/api/analyze/DEMO-005')

    assert response.status_code == 200
    image_agent = next(agent for agent in response.json()['agents'] if agent['agent'] == 'imaging')
    assert image_agent['available'] is True
    assert image_agent['artifacts']['demo_heatmap'] is True


def test_manual_demo_image_uses_precomputed_output_without_sending_image(monkeypatch):
    from backend.agents import vision

    def unexpected_network_call(*_args, **_kwargs):
        raise AssertionError('The precomputed demo image must not call a multimodal provider.')

    monkeypatch.setattr(vision, 'urlopen', unexpected_network_call)
    monkeypatch.setenv('OPENAI_API_KEY', 'demo-key')
    monkeypatch.setenv('OPENAI_CHAT_MODEL', 'gemini-2.5-flash')
    response = client.post('/api/analyze/manual', json={
        'case_id': 'XRAY-DEMO',
        'imaging_demo': True,
        'imaging_report': 'Démonstration visuelle.',
    })
    assert response.status_code == 200
    image_agent = next(agent for agent in response.json()['agents'] if agent['agent'] == 'imaging')
    assert image_agent['artifacts']['demo_heatmap'] is True
    assert 'aucune analyse automatisée' in image_agent['findings'][0]


def test_manual_analysis_sends_image_to_mocked_multimodal_agent(monkeypatch):
    from backend.agents import vision

    class FakeResponse:
        def __enter__(self): return self
        def __exit__(self, *_args): return False
        def read(self):
            return json.dumps({'choices': [{'message': {'content': 'Observation descriptive. A verifier par un radiologue.'}}]}).encode()

    seen = {}
    def fake_urlopen(request, timeout):
        seen['payload'] = json.loads(request.data)
        seen['timeout'] = timeout
        return FakeResponse()

    monkeypatch.setattr(vision, 'urlopen', fake_urlopen)
    monkeypatch.setenv('OPENAI_API_KEY', 'demo-key')
    monkeypatch.setenv('OPENAI_CHAT_MODEL', 'gemini-2.5-flash')
    monkeypatch.setenv('OPENAI_BASE_URL', 'https://generativelanguage.googleapis.com/v1beta/openai/')
    image_bytes = (retriever.ROOT / 'data' / 'demo_patients' / 'test.png').read_bytes()
    response = client.post('/api/analyze/manual', json={
        'case_id': 'XRAY-DEMO',
        'imaging_consent': True,
        'imaging_image_base64': base64.b64encode(image_bytes).decode(),
        'imaging_mime_type': 'image/png',
    })
    assert response.status_code == 200
    result = response.json()
    image_agent = next(agent for agent in result['agents'] if agent['agent'] == 'imaging')
    assert image_agent['available'] is True
    assert image_agent['risk_score'] is None
    assert 'Observation descriptive' in image_agent['findings'][0]
    assert 'image/png;base64,' in seen['payload']['messages'][0]['content'][1]['image_url']['url']
    assert 'imaging_image_base64' not in response.text


def test_manual_analysis_rejects_image_without_explicit_consent():
    image_bytes = (retriever.ROOT / 'data' / 'demo_patients' / 'test.png').read_bytes()
    response = client.post('/api/analyze/manual', json={
        'case_id': 'XRAY-DEMO',
        'imaging_demo': True,
        'imaging_image_base64': base64.b64encode(image_bytes).decode(),
        'imaging_mime_type': 'image/png',
    })
    assert response.status_code == 422


def test_research_rag_upload_and_citations(tmp_path, monkeypatch):
    monkeypatch.delenv('OPENAI_API_KEY', raising=False)
    monkeypatch.setattr(retriever, 'LIBRARY', tmp_path)
    upload = client.post('/api/research-library', files=[
        ('files', ('methodes.txt', b"Notre etude utilise une cohorte prospective et une regression logistique.", 'text/plain')),
    ])
    assert upload.status_code == 200
    assert upload.json()['uploaded'] == ['methodes.txt']

    response = client.post('/api/chat', json={'query': 'Quelle methode utilise cette etude ?'})
    assert response.status_code == 200
    result = response.json()
    assert result['mode'] == 'extractive_rag'
    assert result['retrieval_method'] == 'bm25'
    assert result['citation_status'] == 'missing'
    assert any(source['source'].startswith('methodes.txt') for source in result['sources'])
    assert 'cohorte prospective' in result['answer']

    assert client.get('/api/research-library').json()['documents'][0]['filename'] == 'methodes.txt'
    assert client.delete('/api/research-library/methodes.exe').status_code == 400
    assert client.delete('/api/research-library/methodes.txt').status_code == 200


def test_research_chat_no_match_and_clinical_refusal(monkeypatch):
    monkeypatch.setattr(retriever, '_library_chunks', lambda: [])
    monkeypatch.setattr(retriever, '_project_chunks', lambda: (_ for _ in ()).throw(AssertionError('Project documents must not be used as medical references')))
    no_match = client.post('/api/chat', json={'query': 'adresse extraterrestre'})
    assert no_match.json()['mode'] == 'no_match'
    no_guideline = client.post('/api/chat', json={'query': 'Quelles recommandations pour cette maladie ?'})
    assert no_guideline.json()['mode'] == 'no_match'
    assert 'documents importes ne suffisent pas' in no_guideline.json()['answer']
    refusal = client.post('/api/chat', json={'query': 'Quel diagnostic dois-je poser pour mon patient ?'})
    assert refusal.json()['mode'] == 'refusal'
    assert client.post('/api/chat', json={'query': 'x'}).status_code == 422


def test_general_disease_question_uses_uploaded_medical_source(monkeypatch):
    passages = [{
        'text': 'Le guide indique que les facteurs de risque sont decrits dans la section 2.',
        'source': 'guide_pneumonie.txt, paragraphe 2, date/version inconnue',
    }]
    monkeypatch.setattr(retriever, '_library_chunks', lambda: passages)
    monkeypatch.setattr(retriever, '_project_chunks', lambda: (_ for _ in ()).throw(AssertionError('Project documents must not be used')))
    result = retriever.answer_question('Quels facteurs de risque le guide mentionne-t-il ?')
    assert result['mode'] == 'extractive_rag'
    assert 'facteurs de risque' in result['answer']
    assert result['sources'][0]['source'].startswith('guide_pneumonie.txt')


def test_rag_status_and_generated_citation_validation(monkeypatch, tmp_path):
    monkeypatch.setattr(retriever, 'LIBRARY', tmp_path)
    monkeypatch.setenv('OPENAI_API_KEY', 'test-key')
    monkeypatch.setenv('OPENAI_CHAT_MODEL', '')
    status = retriever.get_rag_status()
    assert status['remote_processing'] is True
    assert status['provider'] == 'Gemini'

    passages = [{'text': 'Une phrase de reference.', 'source': 'guide.txt, paragraphe 1, date/version inconnue'}]
    monkeypatch.setattr(retriever, '_library_chunks', lambda: passages)
    monkeypatch.setattr(retriever, '_project_chunks', lambda: [])
    monkeypatch.setattr(retriever, 'retrieve_semantic', lambda query, chunks: chunks)
    monkeypatch.setattr(retriever, '_gemini_answer', lambda *args: 'R?ponse avec [S9].')
    monkeypatch.setattr(retriever, '_ollama_answer', lambda *args: None)
    result = retriever.answer_question('Reference question')
    assert result['citation_status'] == 'invalid'
    assert '[S9]' not in result['answer']
    assert 'date/version inconnue' in result['sources'][0]['source']
