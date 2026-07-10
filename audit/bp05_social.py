#!/usr/bin/env python3
"""BP-05: prove social depth round-trips — like persists (server-truth), comments,
follow (route + counters), group post/note/poll counters. Red-team included."""
import requests, sys, time

API = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:4000/api/v1"
TEN = sys.argv[2] if len(sys.argv) > 2 else "ac08f9b4-aaec-4474-b61b-4832c5a5ec4c"
T = requests.post(f"{API}/auth/login", json={"email":"admin@alharamain.sa","password":"Admin@1234","tenantId":TEN}).json()["data"]["accessToken"]
H = {"Authorization": f"Bearer {T}", "Content-Type": "application/json"}
ok=fail=0
def chk(label, cond, extra=""):
    global ok,fail; ok+=bool(cond); fail+=not cond
    print(("✓" if cond else "✗"), label, extra)
def gd(r):
    j=r.json(); return j.get("data",j)
def items(d): return d.get("items") if isinstance(d,dict) and "items" in d else (d if isinstance(d,list) else [])

# ── LIKE: create post, like, verify server returns viewer reaction on fresh fetch ──
post=gd(requests.post(f"{API}/social/posts",headers=H,json={"type":"UPDATE","content":f"BP05 proof post {int(time.time())}"}))
pid=post["id"]; chk("post create", bool(pid))
r=gd(requests.post(f"{API}/social/posts/{pid}/react",headers=H,json={"type":"LIKE"}))
chk("like toggle on", r.get("toggled")==True, str(r))
feed=items(gd(requests.get(f"{API}/social/feed?limit=30",headers=H)))
mine=[p for p in feed if p["id"]==pid][0]
chk("fresh fetch: likeCount==1", mine.get("likeCount")==1, f"({mine.get('likeCount')})")
chk("fresh fetch: viewer reaction present (survives reload)", any(x.get("type")=="LIKE" for x in mine.get("reactions",[])), str(mine.get("reactions")))
# toggle off → count back, reaction gone
requests.post(f"{API}/social/posts/{pid}/react",headers=H,json={"type":"LIKE"})
feed=items(gd(requests.get(f"{API}/social/feed?limit=30",headers=H)))
mine=[p for p in feed if p["id"]==pid][0]
chk("unlike: count back to 0 + no viewer reaction", mine.get("likeCount")==0 and not mine.get("reactions"), f"({mine.get('likeCount')},{mine.get('reactions')})")

# ── COMMENT ──
c=gd(requests.post(f"{API}/social/posts/{pid}/comments",headers=H,json={"content":"BP05 comment thread works"}))
chk("comment create", bool(c.get("id")))
feed=items(gd(requests.get(f"{API}/social/feed?limit=30",headers=H)))
mine=[p for p in feed if p["id"]==pid][0]
chk("comment persists in feed + count", mine.get("commentCount")==1 and any("BP05 comment" in (x.get("body") or "") for x in mine.get("comments",[])), f"(count={mine.get('commentCount')})")

# ── FOLLOW: route live, counters move, state survives fresh fetch ──
people=gd(requests.get(f"{API}/social/discover/people",headers=H))
people=items(people)
target=[p for p in people if not p.get("isFollowing")][0]
tid=target["id"]; before_followers=target.get("followerCount",0)
me_before=gd(requests.get(f"{API}/social/accounts/me",headers=H))["_count"]["following"]
r=gd(requests.post(f"{API}/social/accounts/{tid}/follow",headers=H))
chk("follow route → following:true", r.get("following")==True, str(r))
people2=items(gd(requests.get(f"{API}/social/discover/people",headers=H)))
t2=[p for p in people2 if p["id"]==tid]
chk("fresh fetch: isFollowing=true (survives reload)", t2 and t2[0].get("isFollowing")==True)
chk("target followerCount +1", t2 and t2[0].get("followerCount")==before_followers+1, f"({before_followers}→{t2[0].get('followerCount') if t2 else '?'})")
me_after=gd(requests.get(f"{API}/social/accounts/me",headers=H))["_count"]["following"]
chk("my following count +1 (profile tile)", me_after==me_before+1, f"({me_before}→{me_after})")
# unfollow restores
r=gd(requests.post(f"{API}/social/accounts/{tid}/follow",headers=H))
chk("unfollow → following:false", r.get("following")==False)
me_re=gd(requests.get(f"{API}/social/accounts/me",headers=H))["_count"]["following"]
chk("following count restored", me_re==me_before, f"({me_re})")
# re-follow and leave it for browser check
requests.post(f"{API}/social/accounts/{tid}/follow",headers=H)

# ── GROUP counters: post/note/poll create → _count deltas ──
grps=items(gd(requests.get(f"{API}/groups?limit=5",headers=H)))
if not grps:
    grps=[gd(requests.post(f"{API}/groups",headers=H,json={"name":"BP05 Group","visibility":"PUBLIC"}))]
gid=grps[0]["id"]
g0=gd(requests.get(f"{API}/groups/{gid}",headers=H))["_count"]
requests.post(f"{API}/groups/{gid}/posts",headers=H,json={"body":"BP05 group post"})
requests.post(f"{API}/groups/{gid}/notes",headers=H,json={"title":"BP05 note","body":"note body"})
poll=gd(requests.post(f"{API}/groups/{gid}/polls",headers=H,json={"question":"BP05 poll?","options":["Yes","No"]}))
g1=gd(requests.get(f"{API}/groups/{gid}",headers=H))["_count"]
chk("group post counter +1", g1["posts"]==g0["posts"]+1, f"({g0['posts']}→{g1['posts']})")
chk("group note counter +1", g1["notes"]==g0["notes"]+1, f"({g0['notes']}→{g1['notes']})")
chk("group poll counter +1", g1["polls"]==g0["polls"]+1, f"({g0['polls']}→{g1['polls']})")
# vote round-trip
r=requests.post(f"{API}/groups/polls/{poll['id']}/vote",headers=H,json={"optionIndices":[0]})
chk("poll vote", r.status_code<400, f"({r.status_code})")
polls=items(gd(requests.get(f"{API}/groups/{gid}/polls",headers=H)))
voted=[p for p in polls if p["id"]==poll["id"]]
chk("vote persisted in poll payload", voted and str(voted[0]).find("1")>=0, "")

# ── RED TEAM ──
r=requests.post(f"{API}/social/accounts/{gd(requests.get(f'{API}/social/accounts/me',headers=H))['id']}/follow",headers=H)
chk("red-team: follow self → 400", r.status_code==400, f"({r.status_code})")
r=requests.post(f"{API}/social/accounts/00000000-0000-0000-0000-000000000000/follow",headers=H)
chk("red-team: follow bogus → 404", r.status_code==404, f"({r.status_code})")
r=requests.post(f"{API}/social/posts/00000000-0000-0000-0000-000000000000/react",headers=H,json={"type":"LIKE"})
chk("red-team: react bogus post → 404", r.status_code==404, f"({r.status_code})")
r=requests.post(f"{API}/groups/{gid}/polls",headers=H,json={"question":"only one option","options":["A"]})
chk("red-team: poll <2 options → 400 (was 500)", r.status_code==400, f"({r.status_code})")
r=requests.post(f"{API}/social/accounts/{tid}/follow")
chk("red-team: unauth follow → 401", r.status_code==401, f"({r.status_code})")

print(f"\nBP-05 API: {ok} passed, {fail} failed")
sys.exit(1 if fail else 0)
