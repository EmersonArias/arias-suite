"""Read-only extraction of supplied workbook templates. Never imports completed inspections.
Usage: python3 scripts/import-technical-book-templates.py ../upload
"""
from pathlib import Path
from zipfile import ZipFile
from xml.etree import ElementTree as ET
import hashlib, json, posixpath, re, sys
ROOT=Path(__file__).resolve().parents[1]
SOURCE=Path(sys.argv[1])
NS={'s':'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}
BOOKS=[]

def load(pattern):
    matches=list(SOURCE.glob(pattern))
    if len(matches)!=1: raise ValueError(f'Expected exactly one workbook: {pattern}')
    p=matches[0]; sheets={}
    with ZipFile(p) as z:
        strings=[]
        if 'xl/sharedStrings.xml' in z.namelist():
            strings=[''.join(t.text or '' for t in i.findall('.//s:t',NS)) for i in ET.fromstring(z.read('xl/sharedStrings.xml')).findall('s:si',NS)]
        rels={r.attrib['Id']:r.attrib['Target'] for r in ET.fromstring(z.read('xl/_rels/workbook.xml.rels'))}
        for s in ET.fromstring(z.read('xl/workbook.xml')).findall('s:sheets/s:sheet',NS):
            t=rels[s.attrib['{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id']]
            target=t.lstrip('/') if t.startswith('/') else posixpath.normpath('xl/'+t)
            cells={}
            for c in ET.fromstring(z.read(target)).findall('.//s:sheetData/s:row/s:c',NS):
                v=c.find('s:v',NS); value=v.text if v is not None else ''
                if c.attrib.get('t')=='s': value=strings[int(value)]
                if c.attrib.get('t')=='inlineStr': value=''.join(c.find('s:is',NS).itertext())
                if value: cells[c.attrib['r']]=value.strip()
            sheets[s.attrib['name']]=cells
    return {'workbook':p.name,'sha256':hashlib.sha256(p.read_bytes()).hexdigest(),'sheets':sheets}

def book(pattern,sheet,id,title,code,icon,asset='Equipo / referencia',notes=None):
    src=load(pattern)
    b={k:src[k] for k in ['workbook','sha256']}
    b.update(id=id,title=title,code=code,icon=icon,sheet=sheet,assetLabel=asset,fields=[],notes=notes or [])
    BOOKS.append(b)
    return b,src['sheets'][sheet]

def field(b,c,cell,id,kind='check',label=None,section='Comprobaciones',unit=None,frequency=None,reference=None,min=None,adverse=None):
    if cell not in c or not c[cell]: raise ValueError(f'Missing source label {b["id"]}: {cell}')
    f={'id':id,'label':label or c[cell], 'kind':kind,'source':cell,'sourceLabel':c[cell],'section':section}
    for k,v in dict(unit=unit,frequency=frequency,reference=reference,min=min,adverse=adverse).items():
        if v is not None:f[k]=v
    b['fields'].append(f)

b,c=book('R-SSTT-01-04*.xlsx','Hoja1','legionella','Autocontrol de Legionella','R-SSTT-01-04','legionella','Punto / instalación',[
 'Se conserva la frecuencia de cada actividad. La plantilla indica 2023; límites y puntos pendientes de validar con el plan vigente.',
 'Las filas de apertura de grifos se repiten en el original: se mantienen separadas. La temperatura de entrada AFCH figura con un visto; se deja como anotación hasta aclararlo.'])
for row in range(8,33):
    label=c.get(f'A{row}')
    if not label: continue
    ref=c.get(f'C{row}',''); freq=c.get(f'B{row}','')
    kind='number' if any(ch.isdigit() for ch in ref) else 'check'
    if row==31:kind='text'
    field(b,c,f'A{row}',f'activity-{row}',kind,section={'D':'Diario','S':'Semanal','M':'Mensual','V':'Según plan'}.get(freq,'Controles'),unit='°C' if kind=='number' and 'TEMPERATURA' in label.upper() or row==22 else 'ppm' if 'CLORO' in label else None,frequency=freq,reference=ref)

b,c=book('R-SSTT-01-05*.xlsx','Hoja1','bombas','Revisión de bombas','R-SSTT-01-05','pump',notes=['La hoja Hoja2 contiene una portada de cuadros BT y no se usa como ficha de bombas.'])
for cell,id,label in [('B2','model',None),('C2','body',None),('D2','paint',None)]:field(b,c,cell,id,'text' if id=='model' else 'check',label=label)
for phase in ['R','S','T']:field(b,c,'E2','amps-'+phase,'number','Consumo fase '+phase,'Mediciones','A',min=0)
for cell,id,label,unit in [('F4','pressure-in','Presión entrada','bar'),('G4','pressure-out','Presión salida','bar'),('H4','temp-bms','Temperatura Sauter','°C'),('I4','temp-gauge','Temperatura termómetro','°C')]:field(b,c,cell,id,'number',label,'Mediciones',unit,min=0 if unit=='bar' else None)
field(b,c,'F2','gauge','check','Estado del manómetro')
field(b,c,'H2','thermometer','check','Estado del termómetro')
for cell,id,label in [('J4','valve-in','Llave de entrada'),('K4','valve-out','Llave de salida'),('L4','drain-in','Vaciado entrada'),('M4','drain-out','Vaciado salida')]:field(b,c,cell,id,label=label)

for sheet,id,title in [('CLIMATIZADORES','climatizadores','Climatizadores / extractores'),('FANCOILS ZONAS COMUNES-SALAS','fancoils-comunes','Fancoils de zonas comunes y salas')]:
    b,c=book('R-SSTT-01-06*.xlsx',sheet,id,title,'R-SSTT-01-06','air-handler',notes=['Las dos hojas de este libro tienen controles propios. Los fancoils de habitaciones corresponden al R-SSTT-01-07.','TA, ACT y ELEC se conservan como abreviaturas del original; no se reinterpretan.'])
    field(b,c,'B3','equipment-id','text',section='Identificación')
    headers=([('C','Arranque motor impulsión'),('D','Arranque motor impulsión'),('E','Arranque motor retorno'),('F','Arranque motor retorno'),('G','Frío'),('H','Frío'),('I','Frío'),('J','Frío'),('K','Calor'),('L','Calor'),('M','Calor'),('N','Calor'),('O','Limpieza de filtros'),('P','Limpieza de filtros'),('Q','Correa'),('R','Correa'),('S','Intensidad motor'),('U','Carcasa'),('V','Servomotor / compuerta'),('W','Servomotor / compuerta'),('X','Servomotor / compuerta'),('Y','Sonda temperatura'),('Z','Sonda temperatura')] if id=='climatizadores' else [('C','Motor'),('D','Motor'),('E','Frío'),('F','Frío'),('G','Frío'),('H','Calor'),('I','Calor'),('J','Calor'),('K','Limpieza de filtros'),('L','Limpieza de filtros'),('M','Carcasa'),('N','Bandeja de condensados'),('O','Aislamientos'),('P','Sonda temperatura'),('Q','Sonda temperatura')])
    for col,group in headers:
        cell=col+'4' if col+'4' in c else col+'3'
        label=group+(' · '+c[cell] if cell.endswith('4') else '')
        if group=='Intensidad motor':
            for phase in ['U','V','W']:field(b,c,cell,'amps-'+phase,'number','Intensidad motor · '+phase,group,'A',min=0)
            continue
        kind='number' if group=='Sonda temperatura' else 'text' if group=='Correa' or c[cell] in ['TA','ACT','ELEC'] else 'check'
        field(b,c,cell,'col-'+col,kind,label,group,'°C' if group=='Sonda temperatura' else None)

b,c=book('R-SSTT-01-07*.xlsx','Hoja1','fancoils','Fancoils de habitaciones','R-SSTT-01-07','fancoil','Habitación',notes=['El seguimiento visual por habitación sigue independiente. No se modifica ningún estado de habitaciones al guardar una prueba.'])
for row in range(5,24):
    kind='number' if row in [7,8,11,19,20,21] else 'check'
    field(b,c,f'A{row}',f'control-{row}',kind,section='Mediciones' if kind=='number' else 'Comprobaciones',unit='°C' if row in [7,8] else 'dB' if row in [19,20,21] else None,min=0 if row in [19,20,21] else None)
b['notes'].append('El libro no indica la unidad de CAUDAL V3; se conserva como dato numérico sin atribuirle una unidad.')

b,c=book('R-SSTT-01-08*.xlsx','SSTT BT','cuadros-bt','Cuadros eléctricos BT','R-SSTT-01-08','electrical',notes=['El original indica una revisión anual por SSTT Central. No se sustituye el catálogo existente de cuadros.','Se registra el resultado de cada comprobación. Las mediciones se anotan en el detalle del control correspondiente.'])
field(b,c,'B3','panel-name','text',section='Identificación')
for col in 'DEFGHIJKLM':field(b,c,col+'3','control-'+col)

b,c=book('R-SSTT-01-09*.xlsx','FICHA','fotoluminiscentes','Elementos fotoluminiscentes','R-SSTT-01-09','photoluminescent',notes=['La ficha contiene identificación, ubicación, planta, caducidad, tipo y revisión anual. Las notas normativas del archivo son documentación histórica pendiente de revisar.'])
for cell,id,kind in [('C1','floor','text'),('D1','expiry','date'),('E1','type','text'),('F1','annual-review','check')]:field(b,c,cell,id,kind)

b,c=book('R-SSTT-01-10*.xlsx','Hoja 1','luces-emergencia','Luces de emergencia','R-SSTT-01-10','emergency','N.º hotel / luminaria',notes=['La ficha tiene cuatro revisiones por luminaria, con columnas P, B y L. El resumen distingue piloto, batería/electrónica y luminaria.','Se utiliza Hoja 1 como estructura; Hoja 1 (2) se conserva como variante sin importar ni combinar resultados históricos.'])
for cell,id,kind,label in [('C4','panel','text','Ubicación cuadro / PIA'),('D4','number','text','N.º'),('E5','pilot','check','Piloto (P)'),('F5','battery','check','Batería / electrónica (B)'),('G5','lamp','check','Luminaria (L)')]:field(b,c,cell,id,kind,label)

b,c=book('R-SSTT-01-11*.xlsx','Hoja2','puertas-cortafuegos','Puertas cortafuegos','R-SSTT-01-11','firedoor','ID puerta',notes=['La hoja de 2025 contiene siete comprobaciones por trimestre. Se conserva la identificación de la revisión y el historial.','La hoja de 2024 tiene una columna sin título (AE2); no se inventa su significado.'])
field(b,c,'A4','floor','text')
for col in ['C','G','K','O','S','W','AA']:field(b,c,col+'4','control-'+col,adverse='X')

b,c=book('R-SSTT-01-12*.xlsx','EXTINTOR 2025','extintores','Extintores','R-SSTT-01-12','fire','N.º extintor',notes=['Se usa la estructura EXTINTOR 2025. La hoja EXTINTOR es una variante; no se fusionan inspecciones.'])
field(b,c,'B6','plate','text');field(b,c,'C6','type','text');field(b,c,'D6','correct-location','check')
for col in ['F','G','H','I','J','K']:field(b,c,col+'6','control-'+col)

b,c=book('R-SSTT-01-12*.xlsx','B.I.E','bie','Bocas de incendio equipadas','R-SSTT-01-12','fire','ID BIE',notes=['EST, KG, PINT y MANG se mantienen como en el original; KG se recoge numéricamente sin reinterpretar su significado.'])
for cell,id,kind,label in [('B4','type','text',None),('C4','sign','text',None),('F4','state','check','EST · Estado'),('G4','kg','number','KG'),('H4','paint','check','PINT · Pintura'),('I4','hose','check','MANG · Manguera')]:field(b,c,cell,id,kind,label)

for sheet,id,title in [('REV.TRI EQUIPOS CPI','pci','Equipos, medios y alarmas PCI'),('SPRINKLERS ROCIADORES','rociadores','Rociadores y sistemas automáticos')]:
    b,c=book('R-SSTT-01-12*.xlsx',sheet,id,title,'R-SSTT-01-12','fire','Instalación / zona')
    for cell in sorted(c,key=lambda k:(int(re.sub('[A-Z]','',k)),k)):
        if re.fullmatch('B[0-9]+',cell):field(b,c,cell,'control-'+cell,'yesno',adverse='SI' if cell=='B8' and id=='pci' else 'NO')

b,c=book('R-SSTT-02-02*.xlsx','Hoja1','calibraciones','Calibraciones','R-SSTT-02-02','calibration','ID / descripción del instrumento',notes=['Las dos hojas tienen variantes de inventario. La ficha recoge ambas temperaturas; no se aplica una tolerancia no indicada en el libro.'])
field(b,c,'B1','description','text',section='Identificación')
for cell,id,label in [('D1','thermostat',None),('E1','infrared',None)]:field(b,c,cell,id,'number',label,'Mediciones','°C')

b,c=book('FICHA FONDO HABITACIONES*.xlsx','FICHA','fondo-habitaciones','Revisión a fondo de habitaciones','FICHA FONDO HABITACIONES','daily','Habitación',notes=['Documento auxiliar sin código R-SSTT. No se le asigna una periodicidad que el archivo no establece.'])
for row in range(3,38):field(b,c,f'A{row}',f'control-{row}')
b,c=book('FICHA REVISION HABITACIONES*.xlsx','ACCIONES','revision-habitaciones','Actuaciones en habitaciones','FICHA REVISION HABITACIONES','daily','Habitación',notes=['El archivo registra averías, material, fecha y técnico. Se usa la primera cabecera; una cabecera intermedia repite MATERIAL donde aparece AVERÍAS en la primera.'])
field(b,c,'C1','faults','text');field(b,c,'D1','materials','text')

# Master documents are read-only source references, not a new live planner or inventory.
plan=load('R-SSTT-01-01*.xlsx');pc=plan['sheets']['PAM']
plan_rows=[]
for row in range(6,40):
    if not pc.get(f'C{row}'):continue
    slots=[]
    for month in range(12):
        values=[]
        for week in range(4):
            n=4+month*4+week; col=''
            while n:n,z=divmod(n-1,26);col=chr(65+z)+col
            if pc.get(f'{col}{row}'):values.append({'slot':week+1,'action':pc[f'{col}{row}']})
        if values:slots.append({'month':month+1,'slots':values})
    plan_rows.append({'sourceRow':row,'equipment':pc.get(f'B{row}',''),'title':pc[f'C{row}'],'schedule':slots})
assets=load('R-SSTT-01-02*.xlsx');ac=assets['sheets']['Hoja1']
asset_rows=[]
for row in range(2,400):
    if not ac.get(f'A{row}') or not ac.get(f'C{row}'):continue
    asset_rows.append(dict(sourceRow=row,id=ac[f'A{row}'],newId=ac.get(f'B{row}',''),name=ac[f'C{row}'],floor=ac.get(f'D{row}',''),location=ac.get(f'E{row}',''),maintainer=ac.get(f'F{row}','')))
context={'plan':{k:plan[k] for k in ['workbook','sha256']},'assets':{k:assets[k] for k in ['workbook','sha256']}}
context['plan'].update(year=pc.get('AK2',''),rows=plan_rows,legend=[{'code':pc[f'D{r}'],'label':pc[f'E{r}']} for r in range(41,49)])
context['assets']['rows']=asset_rows
for b in BOOKS:
    assert b['fields'] and len({f['id'] for f in b['fields']})==len(b['fields'])
content="// Generated by scripts/import-technical-book-templates.py. Headers only; no inspection results.\nimport type { BookDefinition } from './types'\nexport const bookDefinitions: BookDefinition[] = "+json.dumps(BOOKS,ensure_ascii=False,indent=2)+"\nexport const sourceCatalog = "+json.dumps(context,ensure_ascii=False,indent=2)+"\n"
(ROOT/'src/features/technicalbooks/bookDefinitions.ts').write_text(content)
print(f'{len(BOOKS)} forms; {sum(len(b["fields"]) for b in BOOKS)} source controls; {len(plan_rows)} planning rows; {len(asset_rows)} equipment references')
