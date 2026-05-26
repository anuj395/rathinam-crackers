#!/usr/bin/env python3
import os,re
count=0
for root,dirs,files in os.walk('artifacts'):
    if 'node_modules' in root.split(os.sep):
        continue
    for f in files:
        if not f.endswith(('.ts','.tsx','.js','.jsx')):
            continue
        path=os.path.join(root,f)
        try:
            s=open(path,encoding='utf8').read()
        except Exception:
            continue
        orig=s
        # replace quoted relative paths ending with .ts or .tsx to .js
        s=re.sub(r"(['\"])(\.\.?/[^'\"]+?)\.tsx?\1", lambda m: m.group(1)+m.group(2)+'.js'+m.group(1), s)
        if s!=orig:
            open(path,'w',encoding='utf8').write(s)
            count+=1
print('REVERTED',count,'files')
