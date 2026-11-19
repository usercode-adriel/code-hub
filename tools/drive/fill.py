import cv2, numpy as np, json
R=json.load(open('/home/user/code-hub/public/assets/drive/roads.json')); N=R['nodes']
im=cv2.imread('/root/.claude/uploads/ecd13ed2-02c5-5b53-9ec4-04b4e1b3ffd5/b4e6209a-image.png')
mask=cv2.imread('inpaint_mask.png',0)>0
H,W=mask.shape
axis=np.zeros((H,W),np.uint8)
def pts(rd):
    if rd.get('shape'): return rd['shape']
    return [rd.get('via',{}).get(n) or N[n][:2] for n in rd['path']]
for rd in R['roads']:
    P=pts(rd)
    for a,b in zip(P,P[1:]):
        dx,dy=b[0]-a[0],b[1]-a[1]
        cv2.line(axis,tuple(map(int,a)),tuple(map(int,b)),1 if abs(dx)>=abs(dy) else 2,int(rd['w'])+4)
near=np.zeros((H,W),np.uint8)
for k,n in N.items():
    r=58 if len(n)>2 and n[2]=='round' else 40
    cv2.circle(near,(n[0],n[1]),r,1,-1)
hsv=cv2.cvtColor(im,cv2.COLOR_BGR2HSV)
bright=(hsv[...,2]>185)&(hsv[...,1]<60)
out=im.copy()
ys,xs=np.nonzero(mask)
for y,x in zip(ys,xs):
    ax=axis[y,x]
    if ax==0: continue
    done=False
    for d in range(3,90):
        for s in (d,-d):
            yy,xx=(y,x+s) if ax==1 else (y+s,x)
            if 0<=yy<H and 0<=xx<W and not mask[yy,xx] and axis[yy,xx]==ax and not near[yy,xx] and not (bright[yy,xx] and near[y,x]==0 and d>40):
                out[y,x]=im[yy,xx]; done=True; break
        if done: break
# curvas (shape): o que sobrou vai por inpaint suave
rest=(mask&(axis==0)).astype(np.uint8)
if rest.any(): out=cv2.inpaint(out,rest*255,3,cv2.INPAINT_TELEA)
cv2.imwrite('city_clean.png',out)
a=im; b=out
cv2.imwrite('cmp.png',np.vstack([a[150:520,500:1100],b[150:520,500:1100]]))
