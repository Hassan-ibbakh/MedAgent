"""Génère cinq dossiers fictifs déterministes et des radios de démonstration."""
import json, random
from pathlib import Path
from PIL import Image, ImageDraw

OUT=Path(__file__).resolve().parent/'demo_patients'; random.seed(41)
def make_image(path, seed):
    # Visuel abstrait explicitement factice, jamais présenté comme radiographie.
    im=Image.new('RGB',(640,420),(25,34,44)); d=ImageDraw.Draw(im)
    d.rounded_rectangle((95,35,545,390),radius=40,outline=(130,150,165),width=5)
    d.ellipse((160,85,310,345),fill=(47,67,78),outline=(100,130,140),width=3)
    d.ellipse((330,85,480,345),fill=(47,67,78),outline=(100,130,140),width=3)
    d.line((320,50,320,360),fill=(130,150,165),width=4)
    d.text((180,185),'IMAGE FACTICE',fill=(255,210,90),stroke_width=1)
    im.save(path)
def series(start_rr,end_rr,start_sp,end_sp,start_crp,end_crp):
    rows=[]
    for i in range(16):
        t=i/15
        rows.append({'hours':i*4.8,'respiratory_rate':round(start_rr+(end_rr-start_rr)*t,1),'spo2':round(start_sp+(end_sp-start_sp)*t,1),'heart_rate':round(88+(end_rr-start_rr)*1.5*t,1),'temperature':round(37.1+max(0,end_crp-start_crp)*.0007*t,1),'crp':round(start_crp+(end_crp-start_crp)*t,1)})
    return rows
def labs(crp,wbc,lact,creat,pct):
    return {'crp':{'value':crp,'unit':'mg/L','reference':'< 10'},'leukocytes':{'value':wbc,'unit':'10⁹/L','reference':'4–11'},'lactate':{'value':lact,'unit':'mmol/L','reference':'< 2'},'creatinine':{'value':creat,'unit':'µmol/L','reference':'45–110'},'procalcitonin':{'value':pct,'unit':'ng/mL','reference':'< 0.25'}}
def patient(i,label,age,clin,lab,trend):
    return {'id':f'DEMO-{i:03}','label':label,'demographics':{'age':age,'sex':'Femme' if i%2==0 else 'Homme','copd':i==2,'diabetes':i==3,'heart_failure':False},'clinical':clin,'biological':lab,'longitudinal':trend,'image':{'path':f'DEMO-{i:03}.png','synthetic':True,'description':'Illustration graphique factice, aucune image médicale.'},'report':'Données synthétiques générées par gabarit. Aucun patient réel.'}
def main():
    OUT.mkdir(parents=True,exist_ok=True)
    samples=[
        patient(1,'Stable',58,{'temperature':36.9,'respiratory_rate':16,'heart_rate':78,'systolic_bp':124,'spo2':97,'cough':False,'dyspnea':False},labs(5,7.2,1.0,78,.04),series(16,16,97,97,5,5)),
        patient(2,'Dégradation progressive',72,{'temperature':38.2,'respiratory_rate':27,'heart_rate':110,'systolic_bp':105,'spo2':91,'cough':True,'dyspnea':True},labs(92,13.2,1.8,92,.31),series(17,27,97,91,8,92)),
        patient(3,'Risque élevé',81,{'temperature':39.1,'respiratory_rate':30,'heart_rate':128,'systolic_bp':88,'spo2':86,'cough':True,'dyspnea':True},labs(180,18.5,3.2,130,1.4),series(21,30,94,86,25,180)),
        patient(4,'Données manquantes / désaccord',64,{'temperature':37.2,'respiratory_rate':18,'heart_rate':88,'systolic_bp':119,'spo2':96,'cough':True,'dyspnea':False},None,series(17,24,97,90,9,45)),
    ]
    image_case=patient(
        5,
        'Cas synthétique associé aux images de test',
        67,
        {'temperature':38.8,'respiratory_rate':27,'heart_rate':116,'systolic_bp':105,'spo2':90,'cough':True,'dyspnea':True},
        labs(126,15.4,2.1,98,.6),
        [
            {'hours':0,'respiratory_rate':21,'spo2':95,'heart_rate':96,'temperature':37.5,'crp':44},
            {'hours':24,'respiratory_rate':23,'spo2':94,'heart_rate':102,'temperature':37.9,'crp':68},
            {'hours':48,'respiratory_rate':25,'spo2':92,'heart_rate':109,'temperature':38.4,'crp':96},
            {'hours':72,'respiratory_rate':27,'spo2':90,'heart_rate':116,'temperature':38.8,'crp':126},
        ],
    )
    image_case['demographics']['sex']='Non précisé'
    image_case['image']={
        'path':'test.png',
        'paired_output_path':'test expl.jpeg',
        'description':'Images de démonstration associées à ce scénario fictif. Les valeurs du dossier sont synthétiques et ne sont pas les données cliniques du patient représenté sur la radiographie.',
    }
    image_case['report']='Scénario entièrement synthétique pour démontrer le parcours des quatre agents. Les images associées sont des ressources de test et ne valident pas les données du dossier.'
    samples.append(image_case)
    for p in samples:
        if p['biological'] is None: p['biological']=None
        f=OUT/f"{p['id']}.json"; f.write_text(json.dumps(p,ensure_ascii=False,indent=2),encoding='utf-8')
        if p['id'] != 'DEMO-005':
            make_image(OUT/f"{p['id']}.png",int(p['id'][-3:]))
if __name__=='__main__': main()
