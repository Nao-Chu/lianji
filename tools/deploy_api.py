import base64, json, subprocess, sys, os, tempfile, time
from datetime import datetime, timedelta, timezone

REPO = "Nao-Chu/bencao-jingwei"
API = "https://api.github.com"
# 仓库根目录：<repo>/tools/
BASE = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))

dirty = subprocess.check_output(["git", "status", "--porcelain"], cwd=BASE,
                                text=True, encoding="utf-8").strip()
if dirty:
    sys.exit("working tree is not clean; commit first:\n" + dirty)

def cred():
    out = subprocess.run(["git", "credential", "fill"], input="protocol=https\nhost=github.com\n\n",
                         capture_output=True, text=True, cwd=BASE,
                         env={**os.environ, "GIT_TERMINAL_PROMPT": "0"})
    vals = dict(line.split("=", 1) for line in out.stdout.splitlines() if "=" in line)
    if not vals.get("password"):
        sys.exit("no stored GitHub credential")
    return vals["password"]

TOKEN = cred()

def api(method, path, payload=None):
    last = ""
    for attempt in range(4):
        cmd = ["curl", "-sS", "--max-time", "60", "-w", "\n%{http_code}",
               "-X", method,
               "-H", "Authorization: Bearer " + TOKEN,
               "-H", "Accept: application/vnd.github+json",
               "-H", "Content-Type: application/json; charset=utf-8"]
        tmp = None
        if payload is not None:
            fd, tmp = tempfile.mkstemp(suffix=".json")
            with os.fdopen(fd, "wb") as f:
                f.write(json.dumps(payload, ensure_ascii=False).encode("utf-8"))
            cmd += ["--data-binary", "@" + tmp]
        try:
            proc = subprocess.run(cmd + [API + path], capture_output=True, timeout=90)
            text = proc.stdout.decode("utf-8", "replace")
            cut = text.rfind("\n")
            status = int(text[cut + 1:].strip() or 0)
            body = text[:cut]
            if status >= 200 and status < 300:
                return status, json.loads(body) if body.strip() else {}
            last = f"{status}: {body[:800]}"
            if status not in (0, 502, 503, 504):
                break
        except Exception as e:
            last = repr(e)
        finally:
            if tmp:
                try: os.unlink(tmp)
                except OSError: pass
        time.sleep(2 + attempt * 2)
    sys.exit(f"API {method} {path} failed: {last}")

tree_raw = subprocess.check_output(["git", "ls-tree", "-r", "-z", "HEAD"], cwd=BASE)
entries = []
for item in tree_raw.split(b"\0"):
    if not item:
        continue
    meta, path = item.split(b"\t", 1)
    mode, typ, sha = meta.decode().split()
    entries.append({"mode": mode, "type": typ, "sha": sha, "path": path.decode("utf-8")})

for e in entries:
    blob = subprocess.check_output(["git", "cat-file", "blob", e["sha"]], cwd=BASE)
    status, res = api("POST", f"/repos/{REPO}/git/blobs", {
        "content": base64.b64encode(blob).decode("ascii"),
        "encoding": "base64",
    })
    if res.get("sha") != e["sha"]:
        sys.exit(f"blob sha mismatch for {e['path']}")

tree_payload = [{"path": e["path"], "mode": e["mode"], "type": e["type"], "sha": e["sha"]} for e in entries]
status, tree_res = api("POST", f"/repos/{REPO}/git/trees", {"tree": tree_payload})
local_tree = subprocess.check_output(["git", "rev-parse", "HEAD^{tree}"], cwd=BASE, text=True, encoding="utf-8").strip()
print("tree match:", tree_res.get("sha") == local_tree)
if tree_res.get("sha") != local_tree:
    sys.exit("tree mismatch")

raw_commit = subprocess.check_output(["git", "cat-file", "-p", "HEAD"], cwd=BASE, text=True, encoding="utf-8")
lines = raw_commit.splitlines()
parents = [l.split()[1] for l in lines if l.startswith("parent ")]
author_line = next(l for l in lines if l.startswith("author "))
committer_line = next(l for l in lines if l.startswith("committer "))
# exact message bytes from raw commit: everything after the first blank line
body = raw_commit.split("\n\n", 1)[1]
msg_with_nl = body  # raw body retains the trailing newline

def parse_person(line):
    left, tz = line.rsplit(" ", 1)
    who, ts = left.rsplit(" ", 1)
    name, email = who.rsplit(" <", 1)
    for prefix in ("author ", "committer "):
        if name.startswith(prefix):
            name = name[len(prefix):]
    email = email[:-1]
    sign = 1 if tz[0] == "+" else -1
    off = sign * (int(tz[1:3]) * 60 + int(tz[3:5]))
    dt = datetime.fromtimestamp(int(ts), tz=timezone(timedelta(minutes=off)))
    return {"name": name, "email": email, "date": dt.isoformat()}

author = parse_person(author_line)
committer = parse_person(committer_line)
print("parents:", parents)

status, commit_res = api("POST", f"/repos/{REPO}/git/commits", {
    "message": msg_with_nl,
    "tree": tree_res["sha"],
    "parents": parents,
    "author": author,
    "committer": committer,
})
local_head = subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=BASE, text=True, encoding="utf-8").strip()
print("commit:", commit_res.get("sha"), "local:", local_head, "match:", commit_res.get("sha") == local_head)

status, ref_res = api("PATCH", f"/repos/{REPO}/git/refs/heads/main", {
    "sha": commit_res["sha"],
    "force": True,
})
print("ref main ->", ref_res.get("object", {}).get("sha"))
print("done. sync local tracking ref:")
print(f"  git update-ref refs/remotes/origin/main {commit_res.get('sha')}")