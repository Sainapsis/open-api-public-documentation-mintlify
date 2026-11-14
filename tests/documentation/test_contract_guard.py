"""Negative controls for the public contract fingerprint guard (no API calls)."""
import copy,importlib.util,pathlib,unittest
GUARD=pathlib.Path(__file__).resolve().parents[2]/'scripts/check-doc-contracts.py'
spec=importlib.util.spec_from_file_location('doc_contract_guard',GUARD);guard=importlib.util.module_from_spec(spec);spec.loader.exec_module(guard)

class ContractProjectionTests(unittest.TestCase):
 def setUp(self):
  self.doc={'components':{'schemas':{'Example':{'type':'object','properties':{'description':{'type':'string','description':'Field annotation'},'examples':{'type':'boolean','default':False}},'required':['description'],'description':'Schema annotation','examples':[{'description':'literal response','examples':False}]},'description':{'type':'string','enum':['fixed']}}}}
 def assertProtected(self,mutate):
  changed=copy.deepcopy(self.doc);mutate(changed);self.assertNotEqual(guard.project(self.doc),guard.project(changed))
 def test_allows_editorial_schema_description(self):
  changed=copy.deepcopy(self.doc);changed['components']['schemas']['Example']['description']='Clearer annotation';self.assertEqual(guard.project(self.doc),guard.project(changed))
 def test_property_named_description_is_protected(self):
  self.assertProtected(lambda d:d['components']['schemas']['Example']['properties']['description'].update(type='integer'))
 def test_property_named_examples_is_protected(self):
  self.assertProtected(lambda d:d['components']['schemas']['Example']['properties']['examples'].update(type='string'))
 def test_example_value_named_description_is_protected(self):
  self.assertProtected(lambda d:d['components']['schemas']['Example']['examples'][0].update(description='silently changed'))
 def test_schema_named_description_is_protected(self):
  self.assertProtected(lambda d:d['components']['schemas']['description'].update(enum=['changed']))
 def test_default_and_required_are_protected(self):
  self.assertProtected(lambda d:d['components']['schemas']['Example']['properties']['examples'].update(default=True))
  self.assertProtected(lambda d:d['components']['schemas']['Example'].update(required=[]))

if __name__=='__main__':unittest.main()
