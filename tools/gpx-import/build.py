import os,sys,math,json,datetime as dt
sys.path.insert(0,os.path.dirname(os.path.abspath(__file__)))
from gpxlib import load,locate,hv

def prep(day):
    P,W=load(day); O=locate(P,W)
    byname={w['name']:w for w in O}
    n=len(P)
    if P[0]['ele'] is not None:
        E=[p['ele'] for p in P]
    else:  # no track elevation: pin waypoint elevations where the track passes within 40 m, interpolate between
        E=[None]*n
        for w in W:
            for i,p in enumerate(P):
                if hv((w['lat'],w['lon']),(p['lat'],p['lon']))<40: E[i]=w['ele']
        known=[i for i in range(n) if E[i] is not None]
        for i in range(n):
            if E[i] is None:
                lo=max([k for k in known if k<i],default=known[0]); hi=min([k for k in known if k>i],default=known[-1])
                E[i]=E[lo] if hi==lo else E[lo]+(E[hi]-E[lo])*(P[i]['d']-P[lo]['d'])/max(1,P[hi]['d']-P[lo]['d'])
    S=[sum(E[max(0,i-3):i+4])/len(E[max(0,i-3):i+4]) for i in range(n)]
    for i,p in enumerate(P): p['s']=S[i]
    return P,O,byname

def seg(P,a,b):
    """distance(km), up, down, tobler minutes between track idx a->b (b<a means walking the track backwards)"""
    step=1 if b>=a else -1
    d=up=dn=0.0; t=0.0; acc=0.0
    for i in range(a,b,step):
        p,q=P[i],P[i+step]
        dx=hv((p['lat'],p['lon']),(q['lat'],q['lon'])); dz=q['s']-p['s']
        d+=dx; up+=max(0,dz); dn+=max(0,-dz)
        if dx>0.5:
            s=max(-1.0,min(1.0,dz/dx)); v=6*math.exp(-3.5*abs(s+0.05))  # Tobler km/h
            t+=dx/1000/v*60
        else: t+=0
    return d/1000,up,dn,t

def moving(P,a,b):
    """elapsed minutes between track idx a and b, minus stops (>=5 min with <30 m movement, or overnight gaps)"""
    if P[0]['t'] is None or b<=a: return None
    m=0.0
    for i in range(a,b):
        dtm=(P[i+1]['t']-P[i]['t']).total_seconds(); dx=hv((P[i]['lat'],P[i]['lon']),(P[i+1]['lat'],P[i+1]['lon']))
        if dtm>3*3600: continue
        if dtm>=300 and dx<30: continue
        m+=dtm
    return round(m/60)

def nearest_after(P,lat,lon,start):
    ds=[(hv((lat,lon),(P[i]['lat'],P[i]['lon'])),i) for i in range(start,len(P))]
    j=next((i for d,i in ds if d<60),min(ds)[1])
    while j+1<len(P) and hv((lat,lon),(P[j+1]['lat'],P[j+1]['lon']))<hv((lat,lon),(P[j]['lat'],P[j]['lon'])): j+=1
    return j

def build(day,spec,comm_names=(),flags_extra=None):
    P,O,byname=prep(day)
    rows=[];last=0;prev_wt=None  # the day starts at the beginning of the track
    for r in spec:
        r=dict(r); kind=r['k']
        if kind=='gpx':
            w=byname[r['g']]; r['i']=w['i']; r['lat']=w['lat']; r['lon']=w['lon']; r['alt']=round(w['ele']); r['wt']=w['t']
        elif kind=='at':
            w=byname[r['g']]; r['i']=nearest_after(P,w['lat'],w['lon'],last+1); r['lat']=w['lat']; r['lon']=w['lon']; r['alt']=round(w['ele']); r['wt']=None
        elif kind=='mirror':
            src=next(x for x in rows if x.get('label')==r['of'] and x['k']=='gpx'); r.update(i=src['i'],lat=src['lat'],lon=src['lon'],alt=src['alt'],wt=None,mir=True)
        if 'i' in r:
            if r['k'] in('gpx','at','mirror') and r.get('type','行走')=='行走':
                a=last; b=r['i']
                d,up,dn,t=seg(P,a,b)
                r.update(km=round(d,2),up=round(up),dn=round(dn),tob=t)
                if r['k']=='mirror' or b<a: r['act']=None
                elif P[0]['t'] is not None: r['act']=moving(P,a,b)
                else:
                    pw=prev_wt; r['act']=round((r['wt']-pw).total_seconds()/60) if (r.get('wt') and pw) else None
            last=r['i']; prev_wt=r.get('wt')
        else:
            if kind=='plan': r.update(tob=None)
        if kind=='gpx' and last is not None and 'km' not in r: r.update(km=None,up=None,dn=None,tob=None,act=None)
        rows.append(r)
        if 'i' not in r: pass
    # communication waypoints -> flag nearest located walking row (by track position)
    loc=[x for x in rows if 'i' in x and x['k']!='mirror']
    for w in O:
        if '通訊' in w['name']:
            best=min(loc,key=lambda x:hv((w['lat'],w['lon']),(x['lat'],x['lon'])))
            best.setdefault('comm',[]).append(w['name'])
    # spans: walking rows accumulate until a row with shang closes the span
    walk=[x for x in rows if x.get('type','行走')=='行走' and x['k']!='rest']
    span=[];k_num=k_den=0.0;spans=[]
    for x in rows:
        if x['k'] in ('rest',) or x.get('type') in ('營地','交通','休息'):
            if x.get('type')!='交通' and x.get('anchor')!=False: pass
            continue
        if x.get('custom') is not None: continue
        span.append(x)
        if x.get('shang') is not None:
            spans.append(span); 
            tob=[s['tob'] for s in span]
            if all(t is not None for t in tob) and sum(tob)>0:
                k_num+=x['shang']; k_den+=sum(tob)
            span=[]
    k=k_num/k_den if k_den else 1.0
    for sp in spans:
        sh=sp[-1]['shang']; tob=[s['tob'] for s in sp]
        if len(sp)==1:
            sp[0]['D']=sh; sp[0]['Z']=round(tob[0]*k) if tob[0] else None
        elif all(t is not None and t>0 for t in tob):
            tot=sum(tob); vals=[round(sh*t/tot) for t in tob]; vals[-1]+=sh-sum(vals)
            for s,v in zip(sp,vals): s['Z']=v
            sp[-1]['spannote']=f"上河 {sh} 分（含前 {len(sp)-1} 段，依坡度分配）"
        else:
            # some rows lack geometry: give shang to last row, others blank
            sp[-1]['D']=sh
    for s in span:  # trailing rows without a closing shang -> calibrated estimate
        if s.get('tob'): s['Z']=round(s['tob']*k)
    return rows,k
