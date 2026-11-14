#!/usr/bin/env python3
"""Protect public API contract structure while allowing description/summary edits.
Python 3 + Ruby standard-library YAML parser. No API access or private source needed.
"""
import argparse,hashlib,json,pathlib,subprocess,sys
CONTRACTS=['api-reference/openapi.yaml','api-reference/campaign-leads.openapi.yaml']
DATA={'example','examples','default','enum','const'}
MAPS={'properties','schemas','paths','responses','content','examples','headers','securitySchemes'}
def load(path):
 return json.loads(subprocess.check_output(['ruby','-ryaml','-rjson','-e','puts JSON.generate(YAML.load_file(ARGV[0]))',str(path)],text=True))
def project(value,path=(),data=False):
 if isinstance(value,list):return [project(v,path+(i,),data) for i,v in enumerate(value)]
 if not isinstance(value,dict):return value
 result={}
 for key,item in value.items():
  # Map entries can themselves be named description/examples; they remain contract data.
  annotation=(key in {'description','summary'} and isinstance(item,str) and not data and (not path or path[-1] not in MAPS))
  if not annotation:result[key]=project(item,path+(key,),data or key in DATA)
 return result

def digest(value):return hashlib.sha256(json.dumps(value,sort_keys=True,separators=(',',':'),ensure_ascii=False).encode()).hexdigest()
def fingerprints(source):
 result={}
 for rel in CONTRACTS:
  doc=project(load(source/rel));parts={'whole_contract':digest(doc)}
  parts.update({'operation:'+method.upper()+' '+path:digest(op) for path,item in doc.get('paths',{}).items() for method,op in item.items() if method in {'get','post','put','patch','delete','options','head','trace'}})
  parts.update({'schema:'+name:digest(item) for name,item in doc.get('components',{}).get('schemas',{}).items()})
  result[rel]=parts
 return result

def selftest():
 original={'components':{'schemas':{'Sample':{'type':'object','properties':{'description':{'type':'string'},'examples':{'type':'integer'}},'required':['description','examples'],'example':{'description':'literal','examples':2},'description':'prose'},'description':{'type':'string','enum':['fixed']}}}}
 def clone():return json.loads(json.dumps(original))
 changed=clone();changed['components']['schemas']['Sample']['description']='clearer prose';assert project(changed)==project(original)
 for mutate in [lambda x:x['components']['schemas']['Sample']['properties']['description'].update(type='integer'),lambda x:x['components']['schemas']['Sample']['properties']['examples'].update(type='string'),lambda x:x['components']['schemas']['Sample']['example'].update(description='changed'),lambda x:x['components']['schemas']['description'].update(enum=['changed'])]:
  changed=clone();mutate(changed);assert project(changed)!=project(original)

def main():
 p=argparse.ArgumentParser();p.add_argument('--source',type=pathlib.Path,default=pathlib.Path('.'));p.add_argument('--baseline',type=pathlib.Path,default=pathlib.Path('tests/documentation/contract-fingerprints.json'));p.add_argument('--write-baseline',action='store_true',help='Explicit reviewed initialization only; never automatically refresh in CI.');a=p.parse_args();selftest();actual=fingerprints(a.source)
 if a.write_baseline:
  a.baseline.parent.mkdir(parents=True,exist_ok=True);a.baseline.write_text(json.dumps({'scope':'Public API structure; only prose description/summary strings excluded. Examples/defaults/enums and field/schema names remain protected.','contracts':actual},indent=2)+'\n');print('Initialized explicit baseline. Review it before commit.');return 0
 baseline=json.loads(a.baseline.read_text())['contracts'];changes=[]
 for rel in sorted(set(baseline)|set(actual)):
  for key in sorted(set(baseline.get(rel,{}))|set(actual.get(rel,{}))):
   if baseline.get(rel,{}).get(key)!=actual.get(rel,{}).get(key):changes.append(rel+' :: '+key)
 if changes:
  print('Protected API contract changed:\n'+'\n'.join(changes));return 1
 print('Both public API contracts preserve protected structure; negative controls passed.');return 0
if __name__=='__main__':sys.exit(main())
