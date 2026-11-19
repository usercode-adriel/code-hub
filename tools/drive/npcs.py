import cv2, numpy as np, json
from PIL import Image
U='/root/.claude/uploads/ecd13ed2-02c5-5b53-9ec4-04b4e1b3ffd5/'
im=cv2.imread(U+'87fb08c8-image.png'); fg=(im.max(-1)>40)
pil=Image.open(U+'87fb08c8-image.png').convert('RGBA')
def runs(a,minlen=10,gap=4):
    out=[];s=None;last=None
    for i,v in enumerate(list(a)+[False]*(gap+1)):
        if v:
            if s is None: s=i
            last=i
        elif s is not None and i-last>gap:
            if last-s+1>=minlen: out.append((s,last+1))
            s=None
    return out
bands={'r1':(116,212),'r2':(214,310),'r3':(364,458),'r4':(459,553),'r5':(610,698),'r6':(698,780),'r7':(828,912),'r8':(916,998)}
res={}
for k,(y0,y1) in bands.items():
    col=fg[y0:y1,:].sum(0)>2
    boxes=[]
    for x0,x1 in runs(col,14,3):
        sub=fg[y0:y1,x0:x1]; ys=np.nonzero(sub.any(1))[0]
        boxes.append([int(x0),int(y0+ys[0]),int(x1),int(y0+ys[-1]+1)])
    res[k]=boxes
    print(k,len(boxes),[b[0] for b in boxes])
json.dump(res,open('npc_boxes.json','w'))
