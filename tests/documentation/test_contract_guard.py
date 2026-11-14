"""Context-aware contract guard regression and mutation controls; no API calls."""
import copy,importlib.util,pathlib,unittest
GUARD=pathlib.Path(__file__).resolve().parents[2]/'scripts/check-doc-contracts.py'
spec=importlib.util.spec_from_file_location('doc_contract_guard',GUARD)
guard=importlib.util.module_from_spec(spec);spec.loader.exec_module(guard)

class ContractProjectionTests(unittest.TestCase):
 def setUp(self):
  names=['content','headers','examples','example','default','enum','const','description','summary','properties','schemas','paths','responses','securitySchemes']
  schema={'type':'object','description':'Schema annotation','properties':{n:{'type':'string','description':'Field annotation','default':{'description':'literal','summary':'literal'}} for n in names},'required':['content','headers'],'examples':[{'description':'literal','headers':{'summary':'literal'}}]}
  self.doc={'openapi':'3.1.0','info':{'title':'API identity','version':'1','description':'Info annotation'},'servers':[{'url':'https://api.example.test','description':'Server annotation'}],'paths':{'/sample':{'post':{'operationId':'createSample','summary':'Create sample','description':'Operation annotation','requestBody':{'required':True,'content':{'application/json':{'schema':{'$ref':'#/components/schemas/Example'},'example':{'description':'literal'}}}},'responses':{'201':{'description':'Response annotation','headers':{'X-Trace':{'description':'Header annotation','schema':{'type':'string'}}},'content':{'application/json':{'schema':{'$ref':'#/components/schemas/Example'}}}}}}}},'components':{'schemas':{'Example':schema,'description':{'type':'string','description':'Named-schema annotation','enum':['fixed']}},'securitySchemes':{'description':{'type':'apiKey','in':'header','name':'x-api-key','description':'Security annotation'}}},'x-data':{'description':'literal extension','summary':'literal extension'}}
 def check(self,mutate,allowed=False):
  changed=copy.deepcopy(self.doc);mutate(changed)
  equal=guard.project(self.doc)==guard.project(changed)
  self.assertEqual(equal,allowed)
 def test_all_reserved_property_names_allow_only_their_schema_annotation(self):
  for name in self.doc['components']['schemas']['Example']['properties']:
   with self.subTest(name=name):
    self.check(lambda d:d['components']['schemas']['Example']['properties'][name].update(description='Translated'),allowed=True)
    self.check(lambda d:d['components']['schemas']['Example']['properties'][name].update(type='integer'))
    self.check(lambda d:d['components']['schemas']['Example']['properties'][name]['default'].update(description='changed'))
 def test_schema_and_security_names_are_data_but_their_annotations_are_prose(self):
  self.check(lambda d:d['components']['schemas']['description'].update(description='Translated'),True)
  self.check(lambda d:d['components']['schemas']['description'].update(enum=['changed']))
  self.check(lambda d:d['components']['securitySchemes']['description'].update(description='Translated'),True)
  self.check(lambda d:d['components']['securitySchemes']['description'].update(name='Authorization'))
 def test_real_content_and_header_metadata_are_editorial(self):
  self.check(lambda d:d['paths']['/sample']['post']['responses']['201'].update(description='Translated'),True)
  self.check(lambda d:d['paths']['/sample']['post']['responses']['201']['headers']['X-Trace'].update(description='Translated'),True)
  self.check(lambda d:d['paths']['/sample']['post']['responses']['201']['headers']['X-Trace']['schema'].update(type='integer'))
 def test_examples_defaults_enums_and_extensions_remain_fully_protected(self):
  self.check(lambda d:d['components']['schemas']['Example']['examples'][0].update(description='changed'))
  self.check(lambda d:d['components']['schemas']['Example']['examples'][0]['headers'].update(summary='changed'))
  self.check(lambda d:d['paths']['/sample']['post']['requestBody']['content']['application/json']['example'].update(description='changed'))
  self.check(lambda d:d['x-data'].update(description='changed'))
 def test_names_required_limits_and_api_behavior_are_protected(self):
  self.check(lambda d:d['components']['schemas'].update(Renamed=d['components']['schemas'].pop('Example')))
  self.check(lambda d:d['components']['schemas']['Example']['properties'].update(renamed=d['components']['schemas']['Example']['properties'].pop('content')))
  self.check(lambda d:d['components']['schemas']['Example'].update(required=['headers']))
  self.check(lambda d:d['components']['schemas']['Example']['properties']['content'].update(maxLength=8))
  self.check(lambda d:d['paths']['/sample']['post'].update(operationId='newOperation'))
  self.check(lambda d:d['servers'][0].update(url='https://changed.example.test'))
  self.check(lambda d:d['info'].update(title='Changed identity'))
 def test_only_genuine_annotation_context_is_ignored(self):
  self.check(lambda d:d['paths']['/sample']['post'].update(summary='Translated'),True)
  self.check(lambda d:d['components']['schemas']['Example'].update(summary='Not a JSON Schema annotation'))
  self.check(lambda d:d.update(description='Unknown root data'))
 def test_projection_does_not_mutate_source(self):
  before=copy.deepcopy(self.doc);guard.project(self.doc);self.assertEqual(before,self.doc)

if __name__=='__main__':unittest.main()
