import base64, json, re, uuid
from io import BytesIO
from datetime import datetime, timezone
from pathlib import Path
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi import UploadFile, File
from pypdf import PdfReader
from backend.agents.core import DATA, run_agents, synthesize
from backend.app.schemas import ChatInput, DecisionInput, DemoPatient, ManualAnalysisInput
from backend.rag import answer_question, get_rag_status, list_documents, save_documents, delete_document

ROOT=Path(__file__).resolve().parents[2]
# JSON is a strict subset of YAML; this keeps configuration dependency-free.
CONFIG=json.loads((ROOT/'config.yaml').read_text(encoding='utf-8'))
app=FastAPI(title='MedAgent — prototype de démonstration',version='0.1.0')
app.add_middleware(CORSMiddleware,allow_origins=['http://localhost:5173','http://127.0.0.1:5173'],allow_methods=['*'],allow_headers=['*'])
decisions=[]
def load(pid):
    if not isinstance(pid,str) or len(pid)!=8 or not pid.startswith('DEMO-') or not pid[5:].isdigit():
        raise HTTPException(404,'Patient démo introuvable')
    f=DATA/f'{pid}.json'
    if not f.exists(): raise HTTPException(404,'Patient démo introuvable')
    try: return DemoPatient.model_validate_json(f.read_text(encoding='utf-8')).model_dump()
    except Exception as exc: raise HTTPException(500,'Dossier démo invalide') from exc
@app.get('/api/health')
def health(): return {'status':'ok','prototype':True}
@app.get('/api/config')
def config(): return {'thresholds':CONFIG['thresholds'],'uncertainty_threshold':CONFIG['uncertainty_threshold'],'weights':CONFIG['weights']}
@app.get('/api/patients')
def patients(): return [{'id':p.stem,'label':json.loads(p.read_text(encoding='utf-8'))['label']} for p in sorted(DATA.glob('*.json'))]
@app.get('/api/patients/{pid}')
def patient(pid:str): return load(pid)
@app.post('/api/analyze/manual')
def analyze_manual(body:ManualAnalysisInput):
    values=body.model_dump(exclude_none=True)
    biological=values.get('biological',{})
    units={'crp':'mg/L','leukocytes':'10^9/L','lactate':'mmol/L','procalcitonin':'ng/mL','creatinine':'umol/L'}
    patient_data={
        'id':body.case_id,
        'demographics':{},
        'clinical':values.get('clinical',{}),
        'biological':{name:{'value':value,'unit':units[name]} for name,value in biological.items()},
        'imaging_demo':values.get('imaging_demo',False),
        'imaging_report':values.get('imaging_report'),
        'imaging_image_base64':values.get('imaging_image_base64'),
        'imaging_mime_type':values.get('imaging_mime_type'),
        'longitudinal':values.get('longitudinal',[]),
    }
    start=datetime.now(timezone.utc)
    data,agent_times=run_agents(patient_data,with_timings=True)
    result={
        'analysis_id':str(uuid.uuid4()),'patient_id':body.case_id,
        'agents':[output.model_dump() for output in data],
        'synthesis':synthesize(data,CONFIG),
        'trace':{
            'created_at':start.isoformat(),
            'duration_ms':round((datetime.now(timezone.utc)-start).total_seconds()*1000,2),
            'agent_duration_ms':agent_times,
            'versions':{'medagent':'0.1.0'},
            'input_mode':'manual_demo',
        },
    }
    return result

@app.post('/api/analyze/{pid}')
def analyze(pid:str):
    p=load(pid)
    p['imaging_demo']=pid == 'DEMO-005'
    start=datetime.now(timezone.utc); data,agent_times=run_agents(p,with_timings=True); result={'analysis_id':str(uuid.uuid4()),'patient_id':pid,'agents':[o.model_dump() for o in data],'synthesis':synthesize(data,CONFIG),'trace':{'created_at':start.isoformat(),'duration_ms':round((datetime.now(timezone.utc)-start).total_seconds()*1000,2),'agent_duration_ms':agent_times,'versions':{'medagent':'0.1.0'},'parameters':CONFIG}}
    return result

@app.get('/api/artifacts/{pid}/gradcam.png')
def artifact(pid:str):
    load(pid); return FileResponse(ROOT/'data'/'demo_patients'/f'{pid}.png',media_type='image/png',filename='image-factice.png')

@app.get('/api/demo/radiograph/{kind}')
def demo_radiograph(kind:str):
    # Fixed allow-list: the original image and its precomputed illustrative overlay.
    files={
        'image':('test.png','image/png'),
        'heatmap':('test expl.jpeg','image/jpeg'),
    }
    if kind not in files:
        raise HTTPException(404,'Visuel de démonstration introuvable')
    source,media_type=files[kind]
    path=ROOT/'data'/'demo_patients'/source
    if not path.is_file():
        raise HTTPException(404,'Visuel de démonstration introuvable')
    return FileResponse(path,media_type=media_type)

@app.post('/api/decisions')
def decide(body:DecisionInput):
    # Vercel may route the analysis and decision requests to different function
    # instances, so an in-memory analysis registry cannot validate this flow.
    # Validate the demo case identifier and generated UUID without that cache.
    if not re.fullmatch(r'[A-Za-z0-9_-]{1,32}',body.patient_id):
        raise HTTPException(404,'Dossier de démonstration introuvable')
    if body.patient_id.startswith('DEMO-'):
        load(body.patient_id)
    try:
        if str(uuid.UUID(body.analysis_id)) != body.analysis_id:
            raise ValueError('UUID non canonique')
    except (ValueError, TypeError, AttributeError) as exc:
        raise HTTPException(404,'Identifiant d’analyse invalide') from exc
    row={**body.model_dump(),'timestamp':datetime.now(timezone.utc).isoformat()}; decisions.append(row); return row
@app.get('/api/audit/{pid}')
def audit(pid:str): load(pid); return [d for d in decisions if d['patient_id']==pid]

@app.post('/api/chat')
def chat(body:ChatInput):
    return answer_question(body.query, body.history, body.case_context)

@app.post('/api/case/extract')
async def extract_case_file(file:UploadFile=File(...)):
    filename=Path(file.filename or '').name
    suffix=Path(filename).suffix.lower()
    if suffix not in {'.pdf','.txt','.md'}:
        raise HTTPException(400,'Formats acceptés pour cette démonstration : PDF, TXT ou Markdown.')
    content=await file.read(10*1024*1024+1)
    if len(content)>10*1024*1024:
        raise HTTPException(413,'Le fichier dépasse la limite de 10 Mo.')
    try:
        if suffix=='.pdf':
            pages=PdfReader(BytesIO(content)).pages
            text='\n'.join(page.extract_text() or '' for page in pages)
        else:
            text=content.decode('utf-8-sig')
    except Exception as exc:
        raise HTTPException(400,'Le fichier n’a pas pu être lu. Vérifiez qu’il n’est pas protégé ou endommagé.') from exc
    text='\n'.join(line.strip() for line in text.splitlines() if line.strip())
    if not text:
        raise HTTPException(422,'Aucun texte exploitable. Les PDF scannés nécessitent un OCR, indisponible dans cette démo.')
    return {'filename':filename,'text':text[:16000],'truncated':len(text)>16000,'characters':len(text)}

@app.get('/api/rag/status')
def rag_status():
    return get_rag_status()

@app.get('/api/research-library')
def research_library():
    return {'documents':list_documents()}

@app.post('/api/research-library')
async def upload_research_documents(files:list[UploadFile]=File(...)):
    try:
        saved=await save_documents(files)
        return {'documents':list_documents(),'uploaded':saved}
    except ValueError as exc:
        raise HTTPException(400,str(exc)) from exc

@app.delete('/api/research-library/{filename}')
def remove_research_document(filename:str):
    try:
        delete_document(filename)
    except FileNotFoundError as exc:
        raise HTTPException(404,'Document introuvable') from exc
    except ValueError as exc:
        raise HTTPException(400,str(exc)) from exc
    return {'documents':list_documents()}

# Vercel builds the Vite application before bundling this FastAPI app. FastAPI's
# frontend integration serves the SPA from the CDN and falls back to index.html
# for client-side routes; local development continues to use the Vite dev server.
FRONTEND_DIST = ROOT / 'frontend' / 'dist'
if FRONTEND_DIST.is_dir():
    app.frontend('/', directory=FRONTEND_DIST, fallback='index.html')
