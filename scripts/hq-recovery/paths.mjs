import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {LIMITS,digest,refuse} from './common.mjs';
export const DEFAULT_PROJECT_ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const inside=(value,root)=>{const relative=path.relative(root,value);return relative===''||relative!=='..'&&!relative.startsWith(`..${path.sep}`)&&!path.isAbsolute(relative);};
function powershell(script,args){
 const encodedArgs=Buffer.from(JSON.stringify(args),'utf8').toString('base64');
 const code=`$arguments=ConvertFrom-Json ([Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${encodedArgs}'))); ${script} @arguments`;
 try{return execFileSync('powershell.exe',['-NoLogo','-NoProfile','-NonInteractive','-EncodedCommand',Buffer.from(code,'utf16le').toString('base64')],{encoding:'utf8',timeout:10000,windowsHide:true,stdio:['ignore','pipe','pipe']}).trim();}catch{refuse('custody_failed');}
}
export function noLinks(value,native=true){
 const absolute=path.resolve(value);
 if(/^\\\\|^\/\/|^\\\?\\|^\\\.\\/.test(value)||value.includes('\0')||value.split(/[\\/]/).includes('.local-volabi')||process.platform==='win32'&&/:[^\\/]/.test(value.slice(2)))refuse('unsafe_path');
 const parsed=path.parse(absolute);let current=parsed.root;
 for(const piece of absolute.slice(parsed.root.length).split(path.sep).filter(Boolean)){
  current=path.join(current,piece);if(!fs.existsSync(current))continue;
  const stat=fs.lstatSync(current);if(stat.isSymbolicLink())refuse('unsafe_path');
 }
 if(process.platform==='win32'&&native){
  const answer=powershell("& { param($p) $ErrorActionPreference='Stop'; $q=[IO.Path]::GetFullPath($p); while($q){ if(Test-Path -LiteralPath $q){$a=(Get-Item -Force -LiteralPath $q).Attributes;if(($a -band [IO.FileAttributes]::ReparsePoint)-ne 0){exit 7}}; $q=[IO.Path]::GetDirectoryName($q) }; 'ok' }",[absolute]);
  if(answer!=='ok')refuse('unsafe_path');
 }
 return absolute;
}
export function noLinksBatch(values){
 for(const value of values)noLinks(value,false);
 if(process.platform==='win32'){
  const answer=powershell("& { param($paths) $ErrorActionPreference='Stop'; foreach($p in $paths){$q=[IO.Path]::GetFullPath($p);while($q){if([IO.File]::Exists($q)-or [IO.Directory]::Exists($q)){if(([IO.File]::GetAttributes($q)-band [IO.FileAttributes]::ReparsePoint)-ne 0){exit 7}};$q=[IO.Path]::GetDirectoryName($q)}};'ok' }",[values]);if(answer!=='ok')refuse('unsafe_path');
 }
}
function projectRoots(projectRoot){const roots=[DEFAULT_PROJECT_ROOT,projectRoot].map(x=>fs.realpathSync(x));return [...new Set(roots)];}
export function safeExisting(value,{projectRoot=DEFAULT_PROJECT_ROOT,file=false,maxBytes=LIMITS.package}={}){
 const resolved=noLinks(value);if(!fs.existsSync(resolved))refuse('path_missing');const real=fs.realpathSync(resolved);
 for(const root of projectRoots(projectRoot))if(inside(real,root))refuse('project_path_forbidden');
 const st=fs.lstatSync(real);if(file?!st.isFile():!st.isDirectory())refuse('unsafe_path');
 if(file&&(st.nlink!==1||st.size>maxBytes))refuse(st.size>maxBytes?'file_limit':'unsafe_path');
 return {path:real,identity:{dev:st.dev,ino:st.ino,size:st.size,mtimeMs:st.mtimeMs}};
}
export function restrictDirectory(value){
 if(process.platform==='win32'){
  const answer=powershell("& { param($p) $ErrorActionPreference='Stop'; $sid=[Security.Principal.WindowsIdentity]::GetCurrent().User; $a=New-Object Security.AccessControl.DirectorySecurity; $a.SetOwner($sid); $a.SetAccessRuleProtection($true,$false); $r=New-Object Security.AccessControl.FileSystemAccessRule($sid,'FullControl','ContainerInherit,ObjectInherit','None','Allow'); $a.AddAccessRule($r); [IO.Directory]::SetAccessControl($p,$a); $v=[IO.Directory]::GetAccessControl($p); if(-not $v.AreAccessRulesProtected){exit 8}; foreach($rule in $v.Access){if($rule.IdentityReference.Translate([Security.Principal.SecurityIdentifier]).Value -ne $sid.Value -or $rule.AccessControlType -ne 'Allow'){exit 9}}; if($v.Access.Count -ne 1){exit 10}; $sid.Value }",[value]);
  if(!/^S-1-[\d-]+$/.test(answer))refuse('custody_failed');return answer;
 }
 fs.chmodSync(value,0o700);if((fs.statSync(value).mode&0o777)!==0o700||fs.statSync(value).uid!==process.getuid())refuse('custody_failed');return String(process.getuid());
}
export function createOwnedRoot(value,{projectRoot=DEFAULT_PROJECT_ROOT,sourcePaths=[]}={}){
 const resolved=noLinks(value);if(fs.existsSync(resolved))refuse('target_exists');
 const parent=fs.realpathSync(path.dirname(resolved));noLinks(parent);
 for(const root of projectRoots(projectRoot))if(inside(path.join(parent,path.basename(resolved)),root))refuse('project_path_forbidden');
 for(const source of sourcePaths){const real=fs.realpathSync(source);if(inside(resolved,real)||inside(real,resolved))refuse('source_overlap');}
 fs.mkdirSync(resolved,{mode:0o700});
 try{const owner=restrictDirectory(resolved);const stat=fs.lstatSync(resolved);return {path:resolved,owner,dev:stat.dev,ino:stat.ino};}catch(error){try{fs.rmdirSync(resolved);}catch{}throw error;}
}
export function assertOwned(root,native=true){
 noLinks(root.path,native);const stat=fs.lstatSync(root.path);if(!stat.isDirectory()||stat.dev!==root.dev||stat.ino!==root.ino)refuse('custody_changed');
 if(process.platform==='win32'&&native){
  const answer=powershell("& { param($p,$expected) $ErrorActionPreference='Stop'; $v=[IO.Directory]::GetAccessControl($p);if(-not $v.AreAccessRulesProtected -or $v.Access.Count-ne 1){exit 8}; $r=$v.Access[0];if($r.IdentityReference.Translate([Security.Principal.SecurityIdentifier]).Value-ne $expected -or $r.AccessControlType-ne 'Allow'){exit 9}; 'ok' }",[root.path,root.owner]);if(answer!=='ok')refuse('custody_changed');
 }else if(process.platform!=='win32'&&((stat.mode&0o777)!==0o700||String(stat.uid)!==root.owner))refuse('custody_changed');
}
export function exclusiveFile(root,name,bytes){
 if(!/^[a-zA-Z0-9][a-zA-Z0-9.-]*$/.test(name))refuse('unsafe_member');assertOwned(root,false);
 const target=path.join(root.path,name),fd=fs.openSync(target,'wx',0o600);try{fs.writeFileSync(fd,bytes);fs.fsyncSync(fd);}finally{fs.closeSync(fd);}return target;
}
export function publish(root,temporaryName,name){
 assertOwned(root);const temporary=path.join(root.path,temporaryName),target=path.join(root.path,name);
 const st=fs.lstatSync(temporary);if(!st.isFile()||st.isSymbolicLink()||st.nlink!==1)refuse('unsafe_path');fs.linkSync(temporary,target);fs.unlinkSync(temporary);return target;
}
export function boundedRead(location,maxBytes,{native=true}={}){
 noLinks(location,native);const fd=fs.openSync(location,fs.constants.O_RDONLY|(fs.constants.O_NOFOLLOW||0));
 try{const before=fs.fstatSync(fd);if(!before.isFile()||before.nlink!==1||before.size>maxBytes)refuse('file_limit');const bytes=Buffer.alloc(before.size);let read=0;while(read<bytes.length){const n=fs.readSync(fd,bytes,read,bytes.length-read,null);if(!n)refuse('file_changed');read+=n;}const after=fs.fstatSync(fd);if(after.size!==before.size||after.mtimeMs!==before.mtimeMs||fs.statSync(location).ino!==before.ino)refuse('file_changed');return bytes;}finally{fs.closeSync(fd);}
}
export function cleanFiles(root,names){
 assertOwned(root);for(const name of names){if(!/^[a-zA-Z0-9][a-zA-Z0-9.-]*$/.test(name))refuse('unsafe_member');const target=path.join(root.path,name);if(!fs.existsSync(target))continue;const st=fs.lstatSync(target);if(st.isSymbolicLink()||!st.isFile()||st.nlink!==1)refuse('cleanup_needed');fs.unlinkSync(target);}
}
export const identityDigest=identity=>digest(JSON.stringify(identity));
