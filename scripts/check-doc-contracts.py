#!/usr/bin/env python3
"""Protect public API contract structure while allowing description/summary edits.
Python 3 + Ruby standard-library YAML parser. No API access or private source needed.
"""
import argparse,copy,hashlib,json,pathlib,subprocess,sys
CONTRACTS=['api-reference/openapi.yaml','api-reference/campaign-leads.openapi.yaml']
PROJECTION_VERSION=2
SCOPE='Public API structure; only genuine OpenAPI/JSON Schema description/summary strings in known object contexts excluded. Mapping names, examples (including metadata), defaults, enums, extensions and unknown data remain protected.'
# Only known OpenAPI/JSON Schema objects expose editorial annotations. Mapping
# entries are names, never keywords. Unknown objects/extensions and every example,
# default, enum and const are opaque, including keys named description/summary.
HTTP_METHODS={'get','post','put','patch','delete','options','head','trace'}
CHILDREN={
 'openapi':{'info':'info','servers':'list:server','paths':'map:path_item','webhooks':'map:path_item','components':'components','tags':'list:tag','externalDocs':'external_docs'},
 'info':{},
 'server':{'variables':'map:server_variable'},
 'server_variable':{},
 'path_item':{**{m:'operation' for m in HTTP_METHODS},'parameters':'list:parameter','servers':'list:server'},
 'operation':{'parameters':'list:parameter','requestBody':'request_body','responses':'map:response','callbacks':'map:callback','servers':'list:server','externalDocs':'external_docs'},
 'components':{'schemas':'map:schema','responses':'map:response','parameters':'map:parameter','requestBodies':'map:request_body','headers':'map:header','securitySchemes':'map:security_scheme','links':'map:link','callbacks':'map:callback','pathItems':'map:path_item'},
 'parameter':{'schema':'schema','content':'map:media_type'},
 'header':{'schema':'schema','content':'map:media_type'},
 'request_body':{'content':'map:media_type'},
 'response':{'headers':'map:header','content':'map:media_type','links':'map:link'},
 'media_type':{'schema':'schema','encoding':'map:encoding'},
 'encoding':{'headers':'map:header'},
 'link':{'server':'server'},
 'security_scheme':{'flows':'oauth_flows'},
 'oauth_flows':{k:'oauth_flow' for k in ('implicit','password','clientCredentials','authorizationCode')},
 'oauth_flow':{},
 'tag':{'externalDocs':'external_docs'},
 'external_docs':{},
 'schema':{
  **{k:'map:schema' for k in ('properties','patternProperties','$defs','definitions','dependentSchemas','dependencies')},
  **{k:'list:schema' for k in ('allOf','anyOf','oneOf','prefixItems')},
  **{k:'schema' for k in ('items','additionalItems','additionalProperties','unevaluatedProperties','unevaluatedItems','contains','propertyNames','not','if','then','else','contentSchema')},
 },
}
ANNOTATIONS={
 'info':{'description','summary'},'path_item':{'description','summary'},
 'operation':{'description','summary'},
 **{k:{'description'} for k in ('server','server_variable','parameter','header','request_body','response','link','security_scheme','tag','external_docs','schema')},
}
def load(path):
 return json.loads(subprocess.check_output(['ruby','-ryaml','-rjson','-e','puts JSON.generate(YAML.load_file(ARGV[0]))',str(path)],text=True))
def project(value,path=(),data=False,*,_kind='openapi'):
 if data or _kind=='opaque':return copy.deepcopy(value)
 if _kind.startswith('map:'):
  if not isinstance(value,dict):return copy.deepcopy(value)
  child=_kind[4:]
  return {key:project(item,path+(key,),_kind=child) for key,item in value.items()}
 if _kind.startswith('list:'):
  if not isinstance(value,list):return copy.deepcopy(value)
  return [project(item,path+(i,),_kind=_kind[5:]) for i,item in enumerate(value)]
 if _kind=='callback':
  return project(value,path,_kind='map:path_item')
 # Older JSON Schema tuple-style items are schemas; scalar list entries stay data.
 if isinstance(value,list) and _kind=='schema':
  return [project(item,path+(i,),_kind='schema') for i,item in enumerate(value)]
 if not isinstance(value,dict):return copy.deepcopy(value)
 annotations=ANNOTATIONS.get(_kind,set())
 # OAS 3.1 Reference Objects can carry summary/description. A schema $ref is
 # a JSON Schema keyword and does not make arbitrary schema keys annotations.
 if '$ref' in value and _kind not in {'schema','openapi','components'}:
  annotations=annotations|{'description','summary'}
 result={}
 for key,item in value.items():
  if key in annotations and isinstance(item,str):continue
  child=CHILDREN.get(_kind,{}).get(key,'opaque')
  result[key]=project(item,path+(key,),_kind=child)
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
  a.baseline.parent.mkdir(parents=True,exist_ok=True);a.baseline.write_text(json.dumps({'scope':SCOPE,'projection_version':PROJECTION_VERSION,'contracts':actual},indent=2)+'\n');print('Initialized explicit baseline. Review it before commit.');return 0
 saved=json.loads(a.baseline.read_text())
 if saved.get('projection_version')!=PROJECTION_VERSION:
  print('Contract projection version differs. Review and explicitly migrate the baseline from unchanged published English contracts.');return 1
 baseline=saved['contracts'];changes=[]
 for rel in sorted(set(baseline)|set(actual)):
  for key in sorted(set(baseline.get(rel,{}))|set(actual.get(rel,{}))):
   if baseline.get(rel,{}).get(key)!=actual.get(rel,{}).get(key):changes.append(rel+' :: '+key)
 if changes:
  print('Protected API contract changed:\n'+'\n'.join(changes));return 1
 print('Both public API contracts preserve protected structure; negative controls passed.');return 0
if __name__=='__main__':sys.exit(main())
