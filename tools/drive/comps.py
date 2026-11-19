import cv2, numpy as np, sys, json
from PIL import Image, ImageDraw
U='/root/.claude/uploads/ecd13ed2-02c5-5b53-9ec4-04b4e1b3ffd5/'
name, f, mode = sys.argv[1], sys.argv[2], sys.argv[3]
im=cv2.imread(U+f)
if mode=='black':
    fg=(im.max(-1)>38).astype(np.uint8)
else:  # painel navy do megapack
    hsv=cv2.cvtColor(im,cv2.COLOR_BGR2HSV); v=hsv[...,2].astype(int); s=hsv[...,1].astype(int)
    bg=(v<70)
    fg=(~bg).astype(np.uint8)
fg=cv2.morphologyEx(fg,cv2.MORPH_CLOSE,np.ones((int(sys.argv[5]) if len(sys.argv)>5 else 3,)*2,np.uint8))
n,lb,st,_=cv2.connectedComponentsWithStats(fg,8)
boxes=[[int(v) for v in st[i][:5]] for i in range(1,n) if st[i,4]>int(sys.argv[4]) and st[i,2]<400 and st[i,3]<400]
boxes.sort(key=lambda b:(b[1]//30,b[0]))
json.dump(boxes,open(name+'.json','w'))
vis=Image.open(U+f).convert('RGB'); d=ImageDraw.Draw(vis)
for i,(x,y,w,h,a) in enumerate(boxes):
    d.rectangle([x,y,x+w,y+h],outline=(255,0,255)); d.text((x+1,y+1),str(i),fill=(0,255,0))
vis.save(name+'_idx.png'); print(name,len(boxes))
