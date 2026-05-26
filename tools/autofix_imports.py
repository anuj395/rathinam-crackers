#!/usr/bin/env python3
import re,os
repo='.'
changed=[]
for root,dirs,files in os.walk(repo):
    if 'node_modules' in root.split(os.sep):
        continue
    if '.git' in root.split(os.sep):
        continue
    for f in files:
        if not f.endswith(('.ts','.tsx','.js','.jsx','.mjs','.cjs')):
            continue
        path=os.path.join(root,f)
        try:
            s=open(path,encoding='utf8').read()
        except Exception:
            continue
        original=s
        # find all quoted strings containing .js
        for m in re.finditer(r"['\"]([^'\"]+\.js)['\"]", s):
            imp=m.group(1)
            if not (imp.startswith('./') or imp.startswith('../')):
                continue
            tgt=os.path.normpath(os.path.join(os.path.dirname(path), imp))
            # prefer .ts
            alt_ts = tgt[:-3]+'.ts'
            alt_tsx = tgt[:-3]+'.tsx'
            if os.path.exists(alt_ts):
                s = s.replace(imp, imp[:-3]+'.ts')
            elif os.path.exists(alt_tsx):
                s = s.replace(imp, imp[:-3]+'.tsx')
            else:
                # if directory with index.ts
                if os.path.isdir(tgt):
                    if os.path.exists(os.path.join(tgt,'index.ts')):
                        s = s.replace(imp, imp[:-3]+'.ts')
        if s!=original:
            open(path,'w',encoding='utf8').write(s)
            changed.append(path)
print('UPDATED',len(changed),'files')
for p in changed:
    print('UPDATED:',p)
