from PIL import Image
im = Image.open('themes/captains-cabin/assets/hero-empty-state.webp').convert('RGB')
W, H = im.size
GROUND = (14, 20, 31); INK = (244, 234, 212)
def lin(c):
    c/=255; return c/12.92 if c<=0.04045 else ((c+0.055)/1.055)**2.4
def lum(p): r,g,b=(lin(v) for v in p); return .2126*r+.7152*g+.0722*b
def ratio(a,b):
    x,y=sorted((lum(a),lum(b)),reverse=True); return (x+.05)/(y+.05)
def blend(p,a): return tuple(round(p[i]*(1-a)+GROUND[i]*a) for i in range(3))

step=H//60
bands=[]
for top in range(0,H,step):
    px=list(im.crop((0,top,W,min(H,top+step))).getdata())
    bands.append((top/H, max(px,key=lum)))

def evaluate(stops, label):
    def alpha(f):
        for (f0,a0),(f1,a1) in zip(stops,stops[1:]):
            if f0<=f<=f1:
                t=0 if f1==f0 else (f-f0)/(f1-f0); return a0+t*(a1-a0)
        return stops[-1][1]
    worst=(99,None)
    for f,px in bands:
        if f < 0.42: continue          # above the heading; no text can sit here
        r=ratio(blend(px,alpha(f)),INK)
        if r<worst[0]: worst=(r,f)
    visible=sum(1 for f,_ in bands if alpha(f)<0.85)/len(bands)
    print('%-22s worst %5.2f:1 at %3.0f%%   image still visible over %2.0f%% of panel  %s'
          % (label, worst[0], worst[1]*100, visible*100, 'OK' if worst[0]>=4.5 else 'FAILS'))
    return worst[0]

evaluate([(0,0),(.30,.10),(.45,.45),(.58,.86),(.68,1),(1,1)],       'current (shipped calc)')
evaluate([(0,0),(.35,.06),(.50,.30),(.64,.70),(.78,.95),(1,1)],     'milder A')
evaluate([(0,0),(.40,.05),(.55,.25),(.70,.62),(.86,.92),(1,1)],     'milder B')
evaluate([(0,0),(.42,.04),(.58,.20),(.74,.55),(.90,.88),(1,.97)],   'milder C (most image)')
