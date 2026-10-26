"""Rule based illustrative agents for synthetic demonstrations only."""
import math
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from time import perf_counter

from backend.app.schemas import AgentOutput, Evidence
from backend.agents.vision import analyze_radiograph

DATA = Path(__file__).resolve().parents[2] / 'data' / 'demo_patients'


def clinical(patient):
    values = patient.get('clinical') or {}
    if not values:
        return AgentOutput(agent='clinical', available=False, findings=['Aucune constante clinique fournie.'])
    rules = [
        ('Fréquence respiratoire', 'respiratory_rate', lambda value: value >= 25, .22),
        ('SpO2', 'spo2', lambda value: value < 92, .25),
        ('Température', 'temperature', lambda value: value >= 38.5 or value < 36, .12),
        ('Fréquence cardiaque', 'heart_rate', lambda value: value >= 120, .13),
        ('Pression systolique', 'systolic_bp', lambda value: value < 90, .16),
    ]
    evidence = []
    score = 0.0
    for name, key, criterion, weight in rules:
        value = values.get(key)
        if value is None:
            continue
        abnormal = criterion(value)
        score += weight if abnormal else 0
        evidence.append(Evidence(name=name, value=str(value), direction='up' if abnormal else 'down', weight=weight if abnormal else 0))
    if not evidence:
        return AgentOutput(agent='clinical', available=False, findings=['Aucune constante clinique exploitable.'])
    if (patient.get('demographics') or {}).get('copd'):
        score += .04
    return AgentOutput(
        agent='clinical', available=True, risk_score=min(.95, .12 + score), confidence=.82,
        findings=[f'{sum(item.weight > .02 for item in evidence)} signal(s) vital(aux) au-dessus des seuils illustratifs.'],
        evidence=evidence,
        warnings=['Règles manuelles illustratives; ce calcul n’est pas un score clinique validé.'],
    )


def biological(patient):
    values = patient.get('biological') or {}
    definitions = [
        ('CRP', 'crp', 10, .28), ('Leucocytes', 'leukocytes', 11, .20),
        ('Lactate', 'lactate', 2, .22), ('Procalcitonine', 'procalcitonin', .25, .22),
        ('Créatinine', 'creatinine', 110, .08),
    ]
    evidence, elevated = [], []
    score = .08
    for label, key, reference, weight in definitions:
        item = values.get(key)
        if not item or item.get('value') is None:
            continue
        value = item['value']
        high = value > reference
        contribution = weight * min(1, max(0, (value / reference - 1) / 2)) if high else 0
        score += contribution
        if high:
            elevated.append(label)
        unit = item.get('unit', '')
        evidence.append(Evidence(
            name=label, value=f'{value} {unit} (réf. illustrative ≤ {reference})',
            direction='up' if high else 'down', weight=round(contribution if high else .01, 3),
        ))
    if not evidence:
        return AgentOutput(agent='biological', available=False, findings=['Aucune valeur biologique fournie.'])
    finding = 'Valeurs au-dessus des références illustratives : ' + ', '.join(elevated) + '.' if elevated else 'Valeurs dans les références illustratives.'
    return AgentOutput(
        agent='biological', available=True, risk_score=min(.98, score), confidence=.75,
        findings=[finding], evidence=evidence,
        warnings=['Règles manuelles illustratives, sans modèle entraîné ni validation clinique.'],
    )


def longitudinal(patient):
    rows = patient.get('longitudinal') or []
    if len(rows) < 2:
        return AgentOutput(agent='longitudinal', available=False, findings=['Au moins deux observations datées sont nécessaires.'])
    first, last = rows[0], rows[-1]
    definitions = [
        ('respiratory_rate', 'fréquence respiratoire', '/min', .4, .055),
        ('spo2', 'SpO2', 'points', .35, .035),
        ('crp', 'CRP', 'mg/L', .25, .002),
    ]
    deltas, evidence = [], []
    for key, label, unit, weight, risk_factor in definitions:
        if first.get(key) is None or last.get(key) is None:
            continue
        delta = last[key] - first[key]
        deltas.append((key, label, delta, unit, risk_factor))
        evidence.append(Evidence(
            name=f'{label} change', value=f'{delta:+g} {unit}',
            direction='up' if delta > 0 else 'down',
            weight=min(weight, abs(delta) * (.04 if key != 'crp' else .002)),
        ))
    if not evidence:
        return AgentOutput(agent='longitudinal', available=False, findings=['Aucune mesure comparable entre les observations.'])
    risk_change = sum(max(0, -delta) * factor if key == 'spo2' else max(0, delta) * factor for key, _, delta, _, factor in deltas)
    risk = max(.06, min(.95, .12 + risk_change))
    span = last.get('hours', 0) - first.get('hours', 0)
    finding = f'Évolution sur {span:g} h : ' + ', '.join(f'{label} {delta:+g} {unit}' for _, label, delta, unit, _ in deltas) + '.'
    return AgentOutput(
        agent='longitudinal', available=True, risk_score=risk, confidence=.78,
        findings=[finding], evidence=evidence, artifacts={'series': rows},
    )


def imaging(patient):
    if patient.get('imaging_demo'):
        return AgentOutput(
            agent='imaging', available=True,
            findings=['La radiographie et son image de sortie préexistante sont affichées à titre illustratif; aucune analyse automatisée n’a été effectuée.'],
            warnings=['test expl.png est une visualisation déjà fournie, non générée par MedAgent et non interprétable comme un résultat médical.'],
            artifacts={'demo_heatmap': True},
        )
    if patient.get('imaging_image_base64'):
        output = analyze_radiograph(patient)
        return output
    if patient.get('imaging_report'):
        return AgentOutput(
            agent='imaging', available=False,
            findings=['Un compte rendu a été fourni, mais il n’a pas été interprété par un agent automatisé.'],
            warnings=['Aucun modèle d’imagerie validé n’est disponible. Faites vérifier le compte rendu par un médecin.'],
        )
    return AgentOutput(
        agent='imaging', available=False,
        findings=['Aucune analyse d’image médicale n’est disponible dans cette version.'],
        warnings=['Ne pas importer d’image patient : aucun modèle d’imagerie validé n’est branché.'],
    )


def run_agents(patient, with_timings=False):
    """Run each modality specialist independently against its matching input."""
    functions = (imaging, clinical, biological, longitudinal)
    with ThreadPoolExecutor(max_workers=4) as executor:
        def timed(function):
            start = perf_counter()
            output = function(patient)
            return output, round((perf_counter() - start) * 1000, 2)

        results = [future.result() for future in [executor.submit(timed, function) for function in functions]]
    outputs = [item[0] for item in results]
    durations = {function.__name__: item[1] for function, item in zip(functions, results)}
    return (outputs, durations) if with_timings else outputs


def synthesize(outputs, config):
    def individual_positions():
        positions = []
        for output in outputs:
            if not output.available:
                position = 'Aucun avis : données de cette catégorie absentes ou analyse indisponible.'
            elif output.risk_score is None:
                position = 'Observation descriptive uniquement; aucun score ni diagnostic produit.'
            else:
                score = output.risk_score
                level = 'faible' if score < config['thresholds']['moderate'] else ('modéré' if score < config['thresholds']['high'] else 'élevé')
                position = f'Signal illustratif {level} (indice {score:.2f}); ce n’est pas une décision médicale.'
            positions.append({
                'agent': output.agent,
                'available': output.available,
                'position': position,
                'risk_score': output.risk_score,
                'findings': output.findings,
                'warnings': output.warnings,
            })
        return positions

    available = [output for output in outputs if output.available and output.risk_score is not None]
    visual_observations = [output for output in outputs if output.agent == 'imaging' and output.available and output.findings]
    if not available:
        if visual_observations:
            return {
                'risk_score': None, 'risk_level': 'Observation seulement', 'uncertainty': 1.0,
                'priority_review': True, 'contributions': {}, 'top_evidence': [],
                'agent_decisions': individual_positions(),
                'example_decision': 'Observation visuelle exploratoire uniquement; aucun indice clinique calculé.',
                'narrative': 'L’agent d’imagerie a fourni une observation descriptive, mais aucun agent n’a calculé d’indice. Cette sortie ne permet aucune décision automatisée.',
                'clinician_checks': ['Faire interpréter la radiographie par un radiologue.', 'Ne pas utiliser cette démonstration pour le diagnostic ou le choix des soins.'],
            }
        return {
            'risk_score': None, 'risk_level': 'Non calculable', 'uncertainty': 1.0,
            'priority_review': True, 'contributions': {}, 'top_evidence': [],
            'agent_decisions': individual_positions(),
            'example_decision': 'Aucun résultat à présenter; compléter ou vérifier les données.',
            'narrative': 'Aucun agent n’a pu analyser les données fournies. Aucun indice ne peut être calculé.',
            'clinician_checks': ['Vérifier que le type de données saisi est pris en charge.'],
        }
    weights = config['weights']
    weighted = [weights[output.agent] * (output.confidence or 0) for output in available]
    total = sum(weighted)
    score = sum(output.risk_score * weight for output, weight in zip(available, weighted)) / total if total else .5
    mean = sum(output.risk_score for output in available) / len(available) if available else .5
    disagreement = math.sqrt(sum((output.risk_score - mean) ** 2 for output in available) / len(available)) if available else .5
    missing = sum(not output.available for output in outputs) / max(1, len(outputs))
    confidence = sum(output.confidence or 0 for output in available) / max(1, len(available))
    uncertainty = min(1, .50 * disagreement + .35 * missing + .15 * (1 - confidence))
    level = 'Faible' if score < config['thresholds']['moderate'] else ('Modéré' if score < config['thresholds']['high'] else 'Élevé')
    contribution = {output.agent: round(100 * weight / total, 1) for output, weight in zip(available, weighted)} if total else {}
    evidence = sorted(
        [(item.name, item.value, item.weight, output.agent) for output in available for item in output.evidence],
        key=lambda entry: entry[2], reverse=True,
    )[:5]
    priority = uncertainty >= config['uncertainty_threshold'] or not available
    visual_note = ' Observation descriptive d’imagerie disponible : à confronter aux autres données et à faire vérifier par un radiologue.' if visual_observations else ''
    checks = ['Vérifier les données saisies et leurs unités.', 'Interpréter les résultats dans le contexte clinique complet.', 'La décision appartient au médecin.']
    if visual_observations:
        checks.insert(1, 'Relire l’observation d’imagerie avec l’image source; faire vérifier par un radiologue.')
    return {
        'risk_score': round(score, 3), 'risk_level': level,
        'uncertainty': round(uncertainty, 3), 'priority_review': priority,
        'agent_decisions': individual_positions(),
        'example_decision': 'Revue médicale prioritaire — résultat de démonstration à vérifier.' if priority or level == 'Élevé' else 'Synthèse de démonstration à vérifier par le médecin.',
        'contributions': contribution,
        'top_evidence': [{'name': name, 'value': value, 'weight': weight, 'source': agent} for name, value, weight, agent in evidence],
        'narrative': f'Niveau illustratif {level.lower()} (indice {score:.2f}). Aucune recommandation de soins n’est générée.' + visual_note,
        'clinician_checks': checks,
    }
