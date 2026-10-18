"""Reject private runtime/signing files and obvious credentials without printing values."""
from pathlib import Path
import re, subprocess, sys, tarfile
root=Path(__file__).resolve().parent.parent
rules={
 'private-key':re.compile(rb'-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----'),
 'personal-path':re.compile(rb'/(?:Users|home)/[a-z][a-z0-9_-]+/|[a-z0-9-]+\.tail[a-z0-9]+\.ts\.net'),
 'credential':re.compile(rb'(?:gh[pousr]_[A-Za-z0-9]{24,}|sk-[A-Za-z0-9_-]{24,})'),
 'credential-url':re.compile(rb'https?://[^\s"\x27<>]+[?&](?:token|api_key|access_token)=[A-Za-z0-9._~-]{16,}'),
}
findings=[]; count=0
def check(name,data):
 global count
 count+=1
 parts=Path(name).parts
 if any(p in ('node_modules','signing','fixture','profiles','sessions','.state','DerivedData') or p.startswith('.dsh-test') for p in parts) or Path(name).suffix in ('.p12','.p8','.pem','.key','.mobileprovision','.ipa'):findings.append((name,'private-runtime-file'))
 for label,pattern in rules.items():
  if pattern.search(data):findings.append((name,label))
for raw in subprocess.check_output(['git','ls-files','-z'],cwd=root).split(b'\0'):
 if raw:
  name=raw.decode();p=root/name
  if p.is_symlink():findings.append((name,'symlink'))
  elif p.is_file():check(name,p.read_bytes())
for path in (root/'artifacts').glob('*.tgz'):
 with tarfile.open(path) as archive:
  for member in archive.getmembers():
   if not member.isfile() or member.name.startswith('/') or '..' in Path(member.name).parts:findings.append((path.name,'unsafe-member'));continue
   check(path.name+'/'+member.name,archive.extractfile(member).read())
for name,rule in findings:print(rule+': '+name)
print(f'Audited {count} source/package records; {len(findings)} findings')
sys.exit(bool(findings))
