from PIL import Image
import numpy as np, cv2, colorsys, json
U='/root/.claude/uploads/ecd13ed2-02c5-5b53-9ec4-04b4e1b3ffd5/'
OUT='/home/user/code-hub/public/assets/drive/'
im=Image.open(U+'a0ea3323-image.png').convert('RGBA')
a=np.asarray(im)[...,3]; m=(a>40).astype(np.uint8)
n,lb,st,_=cv2.connectedComponentsWithStats(m,8)
boxes=[tuple(int(v) for v in st[i][:4]) for i in range(1,n) if st[i,4]>600]
boxes.sort(key=lambda b:(round((b[1]+b[3]/2)/120),b[0]))
def crop(i):
    x,y,w,h=boxes[i]; c=im.crop((x-2,y-2,x+w+2,y+h+2))
    arr=np.asarray(c).copy(); arr[...,3]=np.where(arr[...,3]<60,0,255); return Image.fromarray(arr)
def fit(c,L):  # comprimento (altura) em px
    s=L/c.height; return c.resize((max(1,round(c.width*s)),L),Image.LANCZOS)
def tint(c,rgb,mode='white'):
    arr=np.asarray(c).astype(np.float32)/255; r,g,b,al=arr[...,0],arr[...,1],arr[...,2],arr[...,3]
    mx=arr[...,:3].max(-1); mn=arr[...,:3].min(-1); s=(mx-mn)/np.maximum(mx,1e-6)
    if mode=='white': body=(s<0.18)&(mx>0.5)&(al>0)
    else: body=(s>0.35)&(al>0)  # carro já colorido: troca a cor
    t=np.array(rgb,np.float32)/255
    shade=(mx/ (0.95 if mode=='white' else max(0.3,float(mx[body].max()) if body.any() else 1)))[...,None]
    out=arr.copy(); out[...,:3]=np.where(body[...,None],np.clip(t*shade*1.05,0,1),arr[...,:3])
    return Image.fromarray((out*255).astype(np.uint8))
meta={}
def save(name,c,L,kind):
    f=fit(c,L); f.save(OUT+'cars/'+name+'.png',optimize=True); meta[name]={'w':f.width,'h':f.height,'kind':kind}
# trânsito (sem marcas reconhecíveis)
for i,nm in zip([0,1,2,3,4,5,6,35,36],['civ-branco','civ-preto','civ-vermelho','civ-prata','civ-branco2','civ-preto2','civ-branco3','civ-hatch','civ-jipe']): save(nm,crop(i),66,'carro')
save('civ-azul',tint(crop(2),(52,104,214),'color'),66,'carro')
save('civ-amarelo',tint(crop(0),(236,190,46)),66,'carro')
save('civ-verde',tint(crop(35),(70,170,90)),66,'carro')
save('caminhao-cinza',crop(18),92,'caminhao'); save('caminhao-amarelo',crop(20),92,'caminhao')
save('taxi',crop(24),66,'taxi'); save('onibus',crop(26),96,'onibus'); save('onibus-verde',crop(27),96,'onibus')
save('policia',crop(23),66,'policia'); save('ambulancia',crop(22),70,'ambulancia'); save('bombeiros',crop(25),92,'bombeiros')
for i,nm in zip([28,29,30,31,33],['moto-vermelha','moto-preta','moto-azul','moto-verde','moto-scooter']): save(nm,crop(i),40,'moto')
save('bike',crop(34),36,'bike')
# carros do jogador (mesmas chaves da concessionária)
P={'car-hatch-cinza':(3,None),'car-compacto-roxo':(35,(132,84,214)),'car-sedan-vinho':(2,(128,28,52)),'car-van-bege':(6,(214,190,140)),
   'car-pickup-azul':(4,(46,98,206)),'car-pickup-laranja':(4,(236,128,40)),'car-hatch-rosa':(35,(236,120,180)),'car-classico-amarelo':(0,(240,200,40)),
   'car-esportivo-verde':(2,(46,170,80)),'car-conversivel-vermelho':(2,None),'car-tunado-rosa':(2,(220,60,170)),'car-sorvete':(6,(150,220,235))}
for k,(i,col) in P.items():
    c=crop(i)
    if col: c=tint(c,col,'color' if i==2 else 'white')
    save(k,c,66,'meu')
json.dump(meta,open(OUT+'cars/sprites.json','w'),separators=(',',':'))
print(len(meta))
