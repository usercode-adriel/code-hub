# remove os carros "pintados" na imagem das ruas (o trânsito agora é de verdade): componentes coloridos/brancos
# grandes dentro do asfalto, longe dos cruzamentos (faixas de pedestre e marcações ficam).
import cv2, numpy as np, json
R=json.load(open('/home/user/code-hub/public/assets/drive/roads.json'))
im=cv2.imread('/root/.claude/uploads/ecd13ed2-02c5-5b53-9ec4-04b4e1b3ffd5/b4e6209a-image.png')
road=np.load('roadm.npy').astype(np.uint8)
# só o miolo da rua
core=cv2.erode(road,cv2.getStructuringElement(cv2.MORPH_ELLIPSE,(5,5)))
for k,n in R['nodes'].items():
    cv2.circle(core,(n[0],n[1]),44 if len(n)>2 and n[2]=='round' else 30,0,-1)
for lot in R['lots']: x0,y0,x1,y1=lot['rect']; core[y0-4:y1+4,x0-4:x1+4]=0
hsv=cv2.cvtColor(cv2.medianBlur(im,3),cv2.COLOR_BGR2HSV)
V=hsv[...,2].astype(int); S=hsv[...,1].astype(int); Hh=hsv[...,0].astype(int)
asph=(V<120)&(S<120)
yellowline=(Hh>15)&(Hh<35)&(S>110)
odd=((~asph)&(~yellowline)&(core>0)).astype(np.uint8)
odd=cv2.morphologyEx(odd,cv2.MORPH_CLOSE,cv2.getStructuringElement(cv2.MORPH_RECT,(5,5)))
n,lb,st,_=cv2.connectedComponentsWithStats(odd,8)
mask=np.zeros_like(odd)
for i in range(1,n):
    x,y,w,h,a=st[i]
    if a>=70 and max(w,h)>=12 and min(w,h)>=6: mask[lb==i]=1
mask=cv2.dilate(mask,cv2.getStructuringElement(cv2.MORPH_ELLIPSE,(7,7)))&road
print('carros removidos (px):',int(mask.sum()), 'componentes', int((cv2.connectedComponents(mask)[0])-1))
out=cv2.inpaint(im,mask*255,5,cv2.INPAINT_TELEA)
cv2.imwrite('city_clean.png',out)
cv2.imwrite('inpaint_mask.png',mask*255)
