# Constrói (do mesmo roads.json que o jogo usa) a máscara de ruas/calçadas e confere sobre a imagem.
import json, cv2, numpy as np
R=json.load(open('/home/user/code-hub/public/assets/drive/roads.json'))
im=cv2.imread('/root/.claude/uploads/ecd13ed2-02c5-5b53-9ec4-04b4e1b3ffd5/b4e6209a-image.png')
H,W=R['h'],R['w']; N=R['nodes']
road=np.zeros((H,W),np.uint8)
def pts(rd):
    out=[]
    for i,n in enumerate(rd['path']):
        p=N[n][:2]; v=rd.get('via',{}).get(n)
        if v: p=v
        out.append(p)
    if rd.get('shape'): out=rd['shape']
    return out
for rd in R['roads']:
    P=pts(rd)
    for a,b in zip(P,P[1:]): cv2.line(road,tuple(map(int,a)),tuple(map(int,b)),1,int(rd['w']),cv2.LINE_8)
for k,n in N.items():
    if len(n)>2 and n[2]=='round': cv2.circle(road,(n[0],n[1]),40,1,-1)
    elif len(n)>2 and n[2]=='corner': cv2.circle(road,(n[0],n[1]),15,1,-1)
    else: cv2.circle(road,(n[0],n[1]),19,1,-1)
for lot in R['lots']: x0,y0,x1,y1=lot['rect']; road[y0:y1,x0:x1]=1
island=np.zeros_like(road)
for k,n in N.items():
    if len(n)>2 and n[2]=='round': cv2.circle(island,(n[0],n[1]),17,1,-1)
road[island>0]=0
side=cv2.dilate(road|island,cv2.getStructuringElement(cv2.MORPH_ELLIPSE,(21,21)))&(1-road)&(1-island)
np.save('roadm.npy',road); np.save('sidem.npy',side)
ov=im.copy()
ov[road>0]=(ov[road>0]*0.45+np.array([255,0,255])*0.55).astype(np.uint8)
ov[side>0]=(ov[side>0]*0.55+np.array([0,255,255])*0.45).astype(np.uint8)
cv2.imwrite('mask_ov.png',ov)
