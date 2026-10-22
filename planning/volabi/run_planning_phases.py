from pathlib import Path
import subprocess,sys,json,time
sys.stdout.reconfigure(encoding='utf-8', errors='replace')
root=Path(__file__).resolve().parent
core=Path(r"C:\Users\Yousif's PC\.design-architect\core")
s=core/'scripts';r=core/'references';o=root/'.design-architect';o.mkdir(exist_ok=True)
py=sys.executable;ctx=o/'bmad_context.json';pages=o/'pages.json';pg=o/'page_graph.json';g=o/'graph.json';th=o/'theme.json';pl=o/'plan.json';vg=o/'viewgraph.json'
steps=[('1 mine',[s/'parse_bmad.py',root,'--output',ctx]),('2 classify and3 expand',[s/'expand_scope.py','--context',ctx,'--templates',r/'canonical_templates.yaml','--areas','hq','--mode','minimal','--output',pages]),('4 enumerate',[s/'enumerate_states.py','--pages',pages,'--context',ctx,'--patterns',r/'state_patterns.yaml','--output',pg]),('5 closure',[s/'close_graph.py','--graph',pg,'--library',r/'affordance_library.yaml','--rules',r/'closure_rules.yaml','--native-patterns',r/'native_patterns.yaml','--context',ctx,'--areas','hq','--out-dir',o]),('6 components',[s/'component_census.py','--graph',g,'--inventory',r/'component_inventory.yaml','--out-dir',o]),('6b assets',[s/'asset_census.py','--graph',g,'--census',o/'component_census.json','--out-dir',o]),('7 theme',[s/'resolve_theme.py',root,'--context',ctx,'--output',th]),('8 plan',[s/'build_plan.py','--page-graph',g,'--theme',th,'--context',ctx,'--output-json',pl,'--output-md',o/'plan.md']),('8 map',[s/'build_graph.py','--plan',pl,'--context',ctx,'--output',vg]),('8 mermaid',[s/'render_mermaid.py','--graph',vg,'--mode','auto','--output',o/'plan.mermaid']),('8 interactive scope map',[s/'render_html.py','--graph',vg,'--output',o/'plan.html'])]
results=[]
for label,args in steps:
 start=time.time();cmd=[str(py)]+[str(x) for x in args];p=subprocess.run(cmd,capture_output=True,text=True,encoding='utf-8',errors='replace');results.append({'phase':label,'command':cmd,'exit_code':p.returncode,'elapsed_seconds':round(time.time()-start,3),'stdout':p.stdout,'stderr':p.stderr});(o/'PHASE_EXECUTION.json').write_text(json.dumps(results,indent=2),encoding='utf-8');print(label,p.returncode,p.stdout[-400:].strip())
 if p.returncode:sys.exit(p.returncode)
print('Planning phases1-8 only. No global registry, --approved, seed, renderer or output audit was run.')
