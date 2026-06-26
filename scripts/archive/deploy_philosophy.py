#!/usr/bin/env python3
import os, time, json, urllib.request
import paramiko
from pathlib import Path

REPO = Path('/workspace')
ssh  = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('43.133.145.77', username='root', password=os.environ['SERVER_PASS'], timeout=20)
sftp = ssh.open_sftp()

def run(cmd, t=60):
    _, o, e = ssh.exec_command(cmd, get_pty=True, timeout=t)
    out = (o.read()+e.read()).decode(errors='replace').strip()
    for l in out.split('\n')[-4:]:
        if l.strip(): print('   ', l)
    return out

def upload_dir(local, remote):
    local = Path(local)
    created = set()
    for item in sorted(local.rglob('*')):
        if item.is_dir(): continue
        rel = item.relative_to(local)
        rpath = f"{remote}/{rel}".replace('\\', '/')
        parent = rpath.rsplit('/', 1)[0]
        if parent not in created:
            run(f'mkdir -p "{parent}"', t=10); created.add(parent)
        sftp.put(str(item), rpath)
        print(f'  upload: {rel}')

print('[1] Upload backend journal router...')
sftp.put(str(REPO / 'backend/routers/journal.py'), '/opt/zentalk/backend/routers/journal.py')

print('[2] Upload frontend dist...')
run('rm -rf /www/wwwroot/zen.mplusm.site/*')
upload_dir(REPO / 'frontend' / 'dist', '/www/wwwroot/zen.mplusm.site')

print('[3] Restart backend...')
run('pm2 restart zentalk-backend')
time.sleep(6)
print('  Health:', run('curl -sf http://127.0.0.1:8765/health'))

print('[4] Test four-layer tag extraction...')
payload = {
    'scene': '今天帮朋友处理了很多事',
    'feeling': '感觉掏空了，但又不好意思拒绝',
    'reflection': '我总是把别人的需要放在自己前面'
}
req = urllib.request.Request('https://zen.mplusm.site/api/journal/tags',
    data=json.dumps(payload).encode(),
    headers={'Content-Type': 'application/json'}, method='POST')
with urllib.request.urlopen(req, timeout=50) as r:
    d = json.loads(r.read())
    print(f'  object:      {d.get("object")}')
    print(f'  operation:   {d.get("operation")}')
    print(f'  tension:     {d.get("tension")}')
    print(f'  output_form: {d.get("output_form")}')
    print(f'  emotion:     {d.get("emotion")}')
    print(f'  summary:     {d.get("summary")}')

print('\n✓ Done! https://zen.mplusm.site')
sftp.close(); ssh.close()
