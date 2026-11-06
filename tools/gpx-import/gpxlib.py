import os,math,glob,xml.etree.ElementTree as ET,datetime as dt
def hv(a,b):
    R=6371000;p1,p2=math.radians(a[0]),math.radians(b[0]);dp=p2-p1;dl=math.radians(b[1]-a[1])
    return 2*R*math.asin(math.sqrt(math.sin(dp/2)**2+math.cos(p1)*math.cos(p2)*math.sin(dl/2)**2))
def load(day):
    f=[x for x in glob.glob(os.path.join(os.environ.get('GPX_DIR','gpx'),'*.gpx')) if f'-{day}_' in x][0]
    t=ET.parse(f).getroot();ns={'g':t.tag.split('}')[0][1:]}
    P=[]
    for p in t.findall('.//g:trkpt',ns):
        e=p.findtext('g:ele',None,ns);tm=p.findtext('g:time',None,ns)
        P.append(dict(lat=float(p.get('lat')),lon=float(p.get('lon')),ele=float(e) if e else None,
                      t=dt.datetime.fromisoformat(tm.replace('Z','+00:00')) if tm else None))
    cum=[0.0]
    for i in range(1,len(P)): cum.append(cum[-1]+hv((P[i-1]['lat'],P[i-1]['lon']),(P[i]['lat'],P[i]['lon'])))
    for i,p in enumerate(P): p['d']=cum[i]
    W=[]
    for w in t.findall('g:wpt',ns):
        tm=w.findtext('g:time',None,ns)
        W.append(dict(name=w.findtext('g:name','',ns).strip(),lat=float(w.get('lat')),lon=float(w.get('lon')),
                      ele=float(w.findtext('g:ele','0',ns)),t=dt.datetime.fromisoformat(tm.replace('Z','+00:00')) if tm else None))
    return P,W
def locate(P,W):
    """attach track index to each waypoint, return in visiting order"""
    has_t=P[0]['t'] is not None
    wt=[w['t'] for w in W]; distinct=len(set(wt))>len(W)//2
    if has_t and distinct and P[0]['t']-dt.timedelta(hours=1)<=min(wt)<=P[-1]['t']+dt.timedelta(hours=1):
        for w in W:
            w['i']=min(range(len(P)),key=lambda i:abs((P[i]['t']-w['t']).total_seconds()))
            w['off']=hv((w['lat'],w['lon']),(P[w['i']]['lat'],P[w['i']]['lon']))
        return sorted(W,key=lambda w:w['t'])
    order=sorted(W,key=lambda w:w['t']) if distinct else None
    if order is None:  # project geometrically, order by along-track position (first close pass)
        for w in W:
            ds=[hv((w['lat'],w['lon']),(p['lat'],p['lon'])) for p in P]
            i=next((k for k in range(len(P)) if ds[k]<60),min(range(len(P)),key=lambda k:ds[k]))
            # refine to local min in run
            while i+1<len(P) and ds[i+1]<ds[i]: i+=1
            w['i']=i;w['off']=ds[i]
        return sorted(W,key=lambda w:w['i'])
    prev=0
    for w in order:
        ds=[hv((w['lat'],w['lon']),(P[k]['lat'],P[k]['lon'])) for k in range(prev,len(P))]
        j=next((k for k in range(len(ds)) if ds[k]<60),min(range(len(ds)),key=lambda k:ds[k]))
        while j+1<len(ds) and ds[j+1]<ds[j]: j+=1
        w['i']=prev+j;w['off']=ds[j];prev=w['i']
    return order
