import base64
import binascii
from typing import Literal
from pydantic import BaseModel, Field, model_validator

AgentName = Literal['imaging', 'clinical', 'biological', 'longitudinal']

class Evidence(BaseModel):
    name: str
    value: str
    direction: Literal['up', 'down']
    weight: float = Field(ge=0, le=1)

class AgentOutput(BaseModel):
    agent: AgentName
    available: bool
    risk_score: float | None = Field(default=None, ge=0, le=1)
    confidence: float | None = Field(default=None, ge=0, le=1)
    findings: list[str] = Field(default_factory=list)
    evidence: list[Evidence] = Field(default_factory=list)
    artifacts: dict = Field(default_factory=dict)
    warnings: list[str] = Field(default_factory=list)

class DecisionInput(BaseModel):
    analysis_id: str
    patient_id: str
    decision: Literal['accept', 'modify', 'reject']
    comment: str = Field(default='', max_length=1000)

class ChatInput(BaseModel):
    query: str = Field(min_length=2, max_length=1000)
    history: list[dict[str, str]] = Field(default_factory=list, max_length=8)
    case_context: str = Field(default='', max_length=16000)

class ManualClinicalInput(BaseModel):
    respiratory_rate: float | None = Field(default=None, gt=0, le=100)
    spo2: float | None = Field(default=None, gt=0, le=100)
    temperature: float | None = Field(default=None, ge=25, le=45)
    heart_rate: float | None = Field(default=None, gt=0, le=300)
    systolic_bp: float | None = Field(default=None, gt=0, le=300)

    @model_validator(mode='after')
    def has_any_measurement(self):
        if not any(value is not None for value in self.model_dump().values()):
            raise ValueError('Saisissez au moins une constante clinique.')
        return self

class ManualBiologicalInput(BaseModel):
    crp: float | None = Field(default=None, ge=0, le=10000)
    leukocytes: float | None = Field(default=None, ge=0, le=1000)
    lactate: float | None = Field(default=None, ge=0, le=1000)
    procalcitonin: float | None = Field(default=None, ge=0, le=10000)
    creatinine: float | None = Field(default=None, ge=0, le=100000)

    @model_validator(mode='after')
    def has_any_measurement(self):
        if not any(value is not None for value in self.model_dump().values()):
            raise ValueError('Saisissez au moins une valeur biologique.')
        return self

class ManualTrendPoint(BaseModel):
    hours: float = Field(ge=0, le=10000)
    respiratory_rate: float | None = Field(default=None, gt=0, le=100)
    spo2: float | None = Field(default=None, gt=0, le=100)
    crp: float | None = Field(default=None, ge=0, le=10000)

    @model_validator(mode='after')
    def has_any_measurement(self):
        if self.respiratory_rate is None and self.spo2 is None and self.crp is None:
            raise ValueError('Chaque observation doit contenir au moins une mesure.')
        return self

class ManualAnalysisInput(BaseModel):
    case_id: str = Field(min_length=1, max_length=32, pattern=r'^[A-Za-z0-9_-]+$')
    clinical: ManualClinicalInput | None = None
    biological: ManualBiologicalInput | None = None
    imaging_demo: bool = False
    imaging_consent: bool = False
    imaging_report: str | None = Field(default=None, max_length=4000)
    imaging_image_base64: str | None = Field(default=None, max_length=12_000_000)
    imaging_mime_type: Literal['image/png', 'image/jpeg', 'image/webp'] | None = None
    longitudinal: list[ManualTrendPoint] | None = Field(default=None, min_length=2, max_length=20)

    @model_validator(mode='after')
    def has_any_modality(self):
        if bool(self.imaging_image_base64) != bool(self.imaging_mime_type):
            raise ValueError('L’image et son type de fichier doivent être fournis ensemble.')
        if self.imaging_image_base64:
            if not self.imaging_consent:
                raise ValueError('Un consentement explicite est requis pour transmettre une image à l’agent.')
            try:
                image = base64.b64decode(self.imaging_image_base64, validate=True)
            except (binascii.Error, ValueError) as exc:
                raise ValueError('Le contenu de l’image n’est pas un Base64 valide.') from exc
            if not image or len(image) > 8 * 1024 * 1024:
                raise ValueError('La taille de l’image doit être inférieure ou égale à 8 Mo.')
            signatures = {
                'image/png': image.startswith(b'\x89PNG\r\n\x1a\n'),
                'image/jpeg': image.startswith(b'\xff\xd8\xff'),
                'image/webp': len(image) >= 12 and image[:4] == b'RIFF' and image[8:12] == b'WEBP',
            }
            if not signatures[self.imaging_mime_type]:
                raise ValueError('Le contenu réel de l’image ne correspond pas à son format déclaré.')
        if not any((self.clinical, self.biological, self.imaging_demo, self.imaging_report, self.imaging_image_base64, self.longitudinal)):
            raise ValueError('Ajoutez au moins un type de données à analyser.')
        if self.longitudinal:
            hours=[point.hours for point in self.longitudinal]
            if hours != sorted(hours) or len(hours) != len(set(hours)):
                raise ValueError('Les points temporels doivent être triés et avoir des heures distinctes.')
        return self

class DemoPatient(BaseModel):
    id: str = Field(pattern=r'^DEMO-\d{3}$')
    label: str
    demographics: dict
    clinical: dict
    biological: dict | None
    longitudinal: list[dict] = Field(min_length=1)
    image: dict
    report: str
