"""Gemini-compatible, non-diagnostic vision observations for demo radiographs."""
import json
import os
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from backend.app.schemas import AgentOutput


def analyze_radiograph(patient: dict) -> AgentOutput:
    image = patient.get('imaging_image_base64')
    mime_type = patient.get('imaging_mime_type')
    api_key = os.getenv('OPENAI_API_KEY', '').strip()
    model = os.getenv('OPENAI_CHAT_MODEL', '').strip()
    if not image or not mime_type:
        return AgentOutput(
            agent='imaging', available=False,
            findings=['Aucune image radiologique exploitable n’a été transmise à l’agent.'],
        )
    if not api_key or not model:
        return AgentOutput(
            agent='imaging', available=False,
            findings=['L’analyse visuelle nécessite une clé API et un modèle multimodal dans .env.'],
            warnings=['Aucune analyse IA locale n’est installée; cette image n’a pas été interprétée.'],
        )

    base_url = os.getenv('OPENAI_BASE_URL', 'https://api.openai.com/v1/').strip().rstrip('/') + '/'
    prompt = (
        'Tu es un outil de démonstration multimodale, pas un radiologue et pas un dispositif médical. '
        'Observe uniquement cette radiographie thoracique. En français, décris sobrement la qualité et la projection '
        'si visibles, puis les observations visuelles descriptives (zones plus opaques, symétrie, limites de lecture). '
        'Ne pose aucun diagnostic, ne classe pas la gravité, ne recommande aucun traitement et ne donne aucun score. '
        'Si l’image n’est pas une radiographie thoracique ou si elle est illisible, dis-le clairement. '
        'N’infère pas de constat à partir du nom de fichier. Termine par: "Observation exploratoire à vérifier '
        'par un radiologue; non validée pour les soins."'
    )
    payload = {
        'model': model,
        'messages': [{
            'role': 'user',
            'content': [
                {'type': 'text', 'text': prompt},
                {'type': 'image_url', 'image_url': {'url': f'data:{mime_type};base64,{image}'}},
            ],
        }],
        'temperature': 0.1,
    }
    request = Request(
        base_url + 'chat/completions',
        data=json.dumps(payload).encode('utf-8'),
        headers={'Authorization': f'Bearer {api_key}', 'Content-Type': 'application/json'},
        method='POST',
    )
    try:
        with urlopen(request, timeout=90) as response:
            result = json.loads(response.read().decode('utf-8'))
        observation = result['choices'][0]['message']['content']
        if isinstance(observation, list):
            observation = '\n'.join(part.get('text', '') for part in observation if isinstance(part, dict))
        observation = str(observation).strip()[:3000]
        if not observation:
            raise ValueError('Empty multimodal response')
        return AgentOutput(
            agent='imaging', available=True, risk_score=None, confidence=None,
            findings=[observation],
            warnings=[f'Observation produite par {model}; modèle généraliste non validé en radiologie. À vérifier par un radiologue.'],
        )
    except (HTTPError, URLError, TimeoutError, ValueError, KeyError, IndexError, TypeError):
        return AgentOutput(
            agent='imaging', available=False,
            findings=['Le service multimodal n’a pas pu analyser l’image.'],
            warnings=['Vérifiez la configuration API et la disponibilité du modèle; aucun résultat visuel n’est fourni.'],
        )
