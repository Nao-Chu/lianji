import re, json, io, os, sys, datetime

# 仓库根目录：<repo>/tools/
BASE = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
DIR = "library/"

PAGES = [
    dict(file="解表药.html", id="jiebiao", short="解表药", name="解表药", water="表",
         accent="#b06a2c", kicker="外感第一站", tagline="把邪气从表面请出去",
         desc="先分风寒、风热，再看开表、解肌、祛风与清利头目的差别。",
         related=[("清热药.html","表邪入里化热，清热药接着处理气分与营血之热。"),
                  ("温里药.html","表寒不解，寒邪入里；温里药接着处理“里寒”这一层。"),
                  ("止咳化痰药.html","外邪束肺，常见咳喘痰多；表解则肺气易宣。")]),
    dict(file="清热药.html", id="qingre", short="清热药", name="清热药", water="热",
         accent="#2e6f9e", kicker="热邪分层", tagline="先辨热在哪一层，再选哪一味凉",
         desc="泻火、燥湿、解毒、凉血、退虚热五段推进，把气分、营血与脏腑之热分开。",
         related=[("解表药.html","表热入里、里热外透，解表与清热常前后相接。"),
                  ("攻下药.html","实热内结、腑气不通，急下存阴；清热与泻下同走“泄热”一路。"),
                  ("利水渗湿药.html","湿热常相兼为病，清热燥湿与利湿同用，分消上下。")]),
    dict(file="攻下药.html", id="xiexia", short="泻下逐水", name="泻下药 · 逐水药", water="下",
         accent="#a35a1f", kicker="有形之邪", tagline="让实邪从二便走",
         desc="泻下分寒热峻缓，逐水按强弱与部位排开；先辨有形之邪停在哪里。",
         related=[("清热药.html","实热积滞，常以泻下泄热；热去则津存。"),
                  ("活血止血药.html","里实积滞常夹瘀热；攻下与逐瘀，是“通”法的两面。"),
                  ("温里药.html","同是里实，一寒一热：巴豆霜治寒实，大黄芒硝治实热。")]),
    dict(file="利水渗湿药.html", id="lishui", short="利水渗湿", name="祛风湿 · 化湿 · 利水渗湿药", water="湿",
         accent="#4a7f6b", kicker="湿邪三态", tagline="湿在上中下，各有出口",
         desc="祛风湿、芳香化湿、利水渗湿三条线：外湿从关节走，中湿从脾胃化，下湿从小便出。",
         related=[("清热药.html","湿热交结，清热与利湿同用，湿去则热孤。"),
                  ("补虚益气药.html","脾虚生湿、肾虚水泛；利水治标，补虚治本。"),
                  ("止咳化痰药.html","痰湿同源，湿聚成痰；化湿与化痰常同看。")]),
    dict(file="温里药.html", id="wenli", short="温里药", name="温里药", water="温",
         accent="#c0392b", kicker="寒邪入里", tagline="寒在哪里，就温到哪里",
         desc="按“温哪里、怎么温”两条轴，分清回阳、温中、引火归元与散肝寒。",
         related=[("解表药.html","寒在表用解表，寒入里用温里；桂枝生姜与姜附一脉相承。"),
                  ("行气消食药.html","寒凝则气滞，温里散寒与行气止痛常相须为用。"),
                  ("补虚益气药.html","温里祛寒邪，补阳扶阳气；一祛一补，同走扶阳一路。")]),
    dict(file="止咳化痰药.html", id="huatan", short="化痰止咳", name="化痰止咳平喘药", water="痰",
         accent="#0e8f7e", kicker="肺系主战场", tagline="痰、咳、喘，一条线分清",
         desc="温化寒痰、清热化痰、止咳平喘三段推进，先辨寒热，再分痰咳喘。",
         related=[("解表药.html","表邪犯肺是咳喘的入口，解表与宣肺常前后相接。"),
                  ("利水渗湿药.html","湿聚成痰，健脾化湿与化痰止咳同走“治痰先治湿”一路。"),
                  ("补虚益气药.html","久咳虚喘多归虚证，补气、补阴、收涩是治本的一环。")]),
    dict(file="行气消食药.html", id="xingqi", short="行气消食", name="理气药 · 消食药", water="气",
         accent="#8a5a9e", kicker="气机与食积", tagline="先定位气堵在哪，再看积的是什么",
         desc="理气按气滞部位分五组，消食按食积类型分三组；先定位，再选药。",
         related=[("温里药.html","寒凝气滞，温中散寒与行气止痛常同用。"),
                  ("活血止血药.html","气行则血行，气滞日久常致血瘀；行气与活血前后相接。"),
                  ("攻下药.html","食积化热、腑气不通，消食导滞与泻下通腑常相兼。")]),
    dict(file="活血止血药.html", id="huoxue", short="活血化瘀", name="活血化瘀药", water="血",
         accent="#c9366b", kicker="血分辨治", tagline="瘀与血，先分虚实再分部位",
         desc="止血、活血止痛、活血调经、破血消癥四条线，按药力峻缓逐级推进。",
         related=[("行气消食药.html","气为血帅，气滞则血瘀；行气与活血常相须为用。"),
                  ("攻下药.html","逐瘀与攻下同属“通”法，里实瘀热常相兼为病。"),
                  ("补虚益气药.html","瘀血不去、新血不生；活血与补血、养血常需同看。")]),
    dict(file="补虚益气药.html", id="buxu", short="补虚收涩", name="补虚药 · 收涩药", water="补",
         accent="#1f9d6b", kicker="扶正与固摄", tagline="补回来，再把漏掉的收住",
         desc="补气、补阳、补血、补阴四类扶正，收涩药负责敛汗、敛肺、涩肠、固精。",
         related=[("温里药.html","补阳与温里同走扶阳一路：前者补虚，后者散寒。"),
                  ("利水渗湿药.html","脾肾虚则水湿不化；补虚治本，利水治标。"),
                  ("活血止血药.html","血虚与血瘀常互为因果；补血药常与活血药同用。"),
                  ("止咳化痰药.html","久咳虚喘、脾虚生痰；补虚是痰咳治本的一环。")]),
]

def strip_tags(s):
    s = re.sub(r"<br\s*/?>", " ", s)
    s = re.sub(r"<[^>]+>", "", s)
    s = s.replace("&nbsp;", " ").replace("&amp;", "&").replace("&lt;", "<").replace("&gt;", ">")
    return re.sub(r"\s+", " ", s).strip()

def parse_page(meta):
    path = os.path.join(BASE, DIR, meta["file"])
    file_out = DIR + meta["file"]
    html = io.open(path, encoding="utf-8").read()
    title = re.search(r"<title>(.*?)</title>", html, re.S).group(1)
    h1m = re.search(r"<h1>(.*?)<span>(.*?)</span></h1>", html, re.S)
    h1 = strip_tags(h1m.group(1)) if h1m else title
    subtitle = strip_tags(h1m.group(2)) if h1m else ""
    sections = []
    herbs = []
    for sm in re.finditer(r'<section id="([^"]+)"[^>]*>(.*?)</section>', html, re.S):
        sid, body = sm.group(1), sm.group(2)
        gm = re.search(r'<h2 class="grp-title">.*?<span class="dot"></span>(.*?)<small>(.*?)</small>', body, re.S)
        cat_name = strip_tags(gm.group(1)) if gm else sid
        cat_count = strip_tags(gm.group(2)) if gm else ""
        am = re.search(r'<div class="axis">(.*?)</div>', body, re.S)
        axis = strip_tags(am.group(1)) if am else ""
        chunks = body.split('<div class="cluster">')[1:]
        groups = []
        for chunk in chunks:
            hm = re.search(r'<div class="cluster-head">.*?<h3>(.*?)</h3>(.*?)</div>', chunk, re.S)
            gtitle = strip_tags(hm.group(1)) if hm else ""
            hintm = re.search(r'<span class="hint">(.*?)</span>', hm.group(2), re.S) if hm else None
            hint = strip_tags(hintm.group(1)) if hintm else ""
            cards = []
            for cm in re.finditer(r'<article class="card">(.*?)</article>', chunk, re.S):
                cb = cm.group(1)
                nm = re.search(r'<h4>(.*?)<span class="tag">(.*?)</span>', cb, re.S)
                name = strip_tags(nm.group(1)) if nm else ""
                tag = strip_tags(nm.group(2)) if nm else ""
                fields = {}
                for lm in re.finditer(r'<p class="line"><span class="k ([a-z])">(.*?)</span>(.*?)</p>', cb, re.S):
                    key = strip_tags(lm.group(2))
                    val = strip_tags(lm.group(3))
                    if key and val:
                        fields[key] = (fields[key] + "；" + val) if key in fields else val
                card = dict(n=name, t=tag, p=file_out, s=sid, cat=cat_name, g=gtitle,
                            gx=fields.get("功效",""), zz=fields.get("主证",""),
                            tx=fields.get("特长",""), note=fields.get("注意","") or fields.get("炮制",""))
                cards.append(card)
                herbs.append(card)
            groups.append(dict(name=gtitle, hint=hint, herbs=[c["n"] for c in cards]))
        sections.append(dict(id=sid, name=cat_name, count=cat_count, axis=axis,
                             groups=groups, herbs=sum((g["herbs"] for g in groups), [])))
    meta_out = dict(id=meta["id"], file=file_out, short=meta["short"], name=meta["name"],
                    water=meta["water"], accent=meta["accent"], kicker=meta["kicker"],
                    tagline=meta["tagline"], desc=meta["desc"], h1=h1, subtitle=subtitle,
                    cats=[dict(name=s["name"], id=s["id"], count=s["count"], groups=len(s["groups"]),
                               axis=s["axis"], herbs=s["herbs"]) for s in sections],
                    stats=dict(herbs=len(herbs), cats=len(sections),
                               groups=sum(len(s["groups"]) for s in sections)),
                    related=[dict(file=DIR + f, reason=r) for f, r in meta["related"]])
    return meta_out, herbs

missing_files = [m["file"] for m in PAGES if not os.path.exists(os.path.join(BASE, DIR, m["file"]))]
if missing_files:
    sys.exit("missing source pages:\n  " + "\n  ".join(missing_files))

pages_out, all_herbs = [], []
for meta in PAGES:
    p, hs = parse_page(meta)
    pages_out.append(p)
    all_herbs.extend(hs)

data = dict(built=datetime.date.today().isoformat(), pages=pages_out, herbs=all_herbs)
js = "/* 本草经纬 · 站点数据（由 %d 张导图自动提取，请勿手改） */\nwindow.SITE = " % len(pages_out) + json.dumps(data, ensure_ascii=False, indent=1) + ";\n"
io.open(os.path.join(BASE, "assets", "herbs.js"), "w", encoding="utf-8").write(js)

print("pages:", len(pages_out), "herbs:", len(all_herbs), "cats:", sum(p["stats"]["cats"] for p in pages_out), "groups:", sum(p["stats"]["groups"] for p in pages_out))
for p in pages_out:
    print(f'  {p["short"]:<6} {p["stats"]["herbs"]:>2}味 {p["stats"]["cats"]}类 {p["stats"]["groups"]}组 | cats: ' + " / ".join(f'{c["name"]}({len(c["herbs"])})' for c in p["cats"]))
bad = [h["n"] for h in all_herbs if not h["n"] or not h["gx"]]
print("missing:", bad)
dup = sorted({h["n"] for h in all_herbs if [x["n"] for x in all_herbs].count(h["n"])>1})
print("duplicate names across pages:", dup)