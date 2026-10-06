#!/usr/bin/env python3
"""Build the compaction corpus from Claude Code session journals.

Scans ~/.claude/projects/*/*.jsonl for `compact_boundary` records and, for
each boundary, extracts:

  state at the boundary — preTokens, last answer's leftover tails
  ("Хвосты для агента/владельца"), a promise-of-more-work flag on the last
  answer, edits since the last commit, unpushed commits, live background
  tasks (any whose task-notification arrives after the boundary);

  aftermath — owner messages after the boundary (records with
  `origin.kind == "human"` only: task notifications, cross-session peer
  messages, hook feedback and the compact summary itself are not owner
  input), complaints and re-asked questions among them, rewrites of
  session-written files, failing edits.

A boundary counts as a loss when the owner afterwards complained about
forgetting, re-asked a question already asked, or an edit on a file the
session itself had written failed (its content was forgotten). Rewrite
counts are printed too but do not label: continued work rewrites files.

Output: a TSV of the boundaries (event kinds and counts only — no command
text, no paths) to corpus.tsv next to this script's output dir, plus a
per-feature loss-rate table to stdout. Nothing leaves the machine.

Usage: python3 scripts/corpus.py [output-dir]   (default: cwd)
"""

import csv
import glob
import json
import os
import re
import sys

ROOT = os.path.expanduser("~/.claude/projects")

TAIL_RE = re.compile(
    r"^\s*[>*_+\-]*\s*(?:\d+[.)]\s*)?Хвосты для (агента|владельца|человека)\s*:?\s*(.*)$",
    re.M,
)
NONE_WORDS = {"нет", "none", ""}
PROMISE_RE = re.compile(
    r"(потом|позже|затем|вернусь|вернёмся|осталось\s+(сделать|доделать)|"
    r"надо будет|нужно будет|сделаю|доделаю|докручу|i will|i'll|next i|"
    r"then i|to do\b|remaining)",
    re.I,
)
COMPLAINT_RE = re.compile(
    r"(ты (уже )?забыл|не помнишь|уже (делал|писал|сказал|говорил|делали|"
    r"обсуждали)|я же (сказал|писал|говорил|просил|уже)|опять (ты|то же|это)|"
    r"снова (ты|то же|это) (дел|дела|спраш|пише)|потерял|куда дел|"
    r"почему ты (не|опять|снова)|ты опять|повторяю|как мы оказались|"
    r"возвращаться есть куда|ты помнишь|you forgot|forgot|why did you|"
    r"you already|lost it|had to re-?do)",
    re.I,
)
# Records without `origin` (old journals): text starting with these is not
# owner input.
SYNTHETIC_USER_RE = re.compile(
    r"^\s*(This session is being continued|Goal check-in|Stop hook feedback|"
    r"Another Claude session sent|Base directory for this skill|<command|"
    r"<local-command|<system|<task-notification|Caveat:|\[Image:|# ?\w)",
    re.I,
)
PASTED_RE = re.compile(r"<pasted_content[^>]*>\s*", re.I)
EDIT_ERR_RE = re.compile(
    r"(modified since|has been modified|String to replace|oldString|"
    r"not found in|does not exist|No changes were made|stale)",
    re.I,
)
GIT_COMMIT_RE = re.compile(r"\bgit\s+(?:-C\s+\S+\s+)?commit\b")
GIT_PUSH_RE = re.compile(
    r"\bgit\s+(?:-C\s+\S+\s+)?push\b|gh\s+pr\s+(merge|create)\b"
)
WAITER_RE = re.compile(
    r"\b(until|while|for)\b.*\b(sleep|gh\s+(pr|run|api)|curl|test|\[)", re.S
)
EDIT_TOOLS = {"Edit", "Write", "MultiEdit", "NotebookEdit"}
READ_TOOLS = {"Bash", "Read", "Grep", "Glob"}
TASKID_RE = re.compile(r"<task-id>(\w+)</task-id>")
BGID_RE = re.compile(r"background with ID: (\w+)")


def msg_of(d):
    m = d.get("message")
    return m if isinstance(m, dict) else {}


def texts_of(msg):
    c = msg.get("content")
    if isinstance(c, str):
        return c
    if isinstance(c, list):
        return "\n".join(
            b.get("text", "")
            for b in c
            if isinstance(b, dict) and b.get("type") == "text"
        )
    return ""


def uses_of(msg):
    c = msg.get("content")
    if isinstance(c, list):
        return [
            b for b in c if isinstance(b, dict) and b.get("type") == "tool_use"
        ]
    return []


def results_of(msg):
    c = msg.get("content")
    if isinstance(c, list):
        return [
            b
            for b in c
            if isinstance(b, dict) and b.get("type") == "tool_result"
        ]
    return []


def leftovers(text):
    hits = TAIL_RE.findall(text)
    if not hits:
        return "unknown"
    vals = [v.strip().lower().rstrip(".") for _, v in hits]
    if all(v in NONE_WORDS for v in vals):
        return "none"
    if any(w == "агента" and v not in NONE_WORDS for w, v in hits):
        return "listed_agent"
    return "listed_owner"


def shingle(s):
    return set(re.findall(r"[a-zа-яё]{3,}", s.lower()))


def jaccard(a, b):
    return len(a & b) / len(a | b) if a and b else 0.0


def user_text(d):
    """The owner's typed text, or None for synthetic/tool records."""
    if (
        d.get("type") != "user"
        or d.get("isMeta")
        or d.get("isCompactSummary")
    ):
        return None
    org = d.get("origin") or {}
    human = (
        org.get("kind") == "human"
        or d.get("turnOrigin") == "human"
        or d.get("promptSource") in ("typed", "queued")
    )
    m = msg_of(d)
    if results_of(m):
        return None
    t = texts_of(m).strip()
    if not t:
        return None
    t = PASTED_RE.sub("", t)
    if not human and (SYNTHETIC_USER_RE.search(t) or t.startswith("<")):
        return None
    if "interrupted" in t.lower() and len(t) < 40:
        return None
    return t


def analyze(recs):
    out = []
    bounds = [
        i
        for i, d in enumerate(recs)
        if d.get("type") == "system"
        and d.get("subtype") == "compact_boundary"
    ]
    for bi in bounds:
        b = recs[bi]
        meta = b.get("compactMetadata") or {}
        pre, post = recs[:bi], recs[bi + 1 : next((j for j in bounds if j > bi), len(recs))]
        # task-notifications land anywhere the journal puts them
        notified = {}
        for i, d in enumerate(recs):
            blob = json.dumps(d, ensure_ascii=False)
            if "task-notification" in blob:
                for tid in TASKID_RE.findall(blob):
                    notified.setdefault(tid, i)
        # PRE: last answer's tails/promise, git, pending calls
        pre_ass = [d for d in pre if d.get("type") == "assistant"]
        last_text = ""
        for d in reversed(pre_ass):
            t = texts_of(msg_of(d))
            if t.strip():
                last_text = t
                break
        lo = leftovers(last_text)
        promise = bool(PROMISE_RE.search(TAIL_RE.sub("", last_text)))
        writes = []
        commit_i = []
        last_push = -1
        pending = {}
        bg_by_use = {}
        for i, d in enumerate(pre):
            if d.get("type") == "assistant":
                for u in uses_of(msg_of(d)):
                    inp = u.get("input") or {}
                    name = u.get("name", "")
                    pending[u.get("id")] = name
                    if name in EDIT_TOOLS:
                        p = inp.get("file_path") or inp.get("notebook_path")
                        if p:
                            writes.append(i)
                    if name == "Bash":
                        cmd = inp.get("command", "")
                        if GIT_COMMIT_RE.search(cmd):
                            commit_i.append(i)
                        if GIT_PUSH_RE.search(cmd):
                            last_push = i
            elif d.get("type") == "user":
                tur = d.get("toolUseResult")
                if isinstance(tur, dict):
                    bed = tur.get("bashEditDiff") or {}
                    writes.extend(i for _ in bed.get("changedFiles") or [])
                    gop = tur.get("gitOperation") or {}
                    if "commit" in gop:
                        commit_i.append(i)
                    if "push" in gop or (gop.get("pr") or {}).get(
                        "action"
                    ) == "merged":
                        last_push = i
                    bgid = tur.get("backgroundTaskId")
                    if bgid:
                        for x in results_of(msg_of(d)):
                            bg_by_use[bgid] = x.get("tool_use_id")
                for x in results_of(msg_of(d)):
                    pending.pop(x.get("tool_use_id"), None)
        last_commit = max(commit_i) if commit_i else -1
        edits_pending = len([i for i in writes if i > last_commit])
        unpushed = len({i for i in commit_i if i > last_push})
        # live at the boundary: a background task whose notification lands
        # after the boundary (or never)
        live_bg = 0
        for i, d in enumerate(pre):
            if d.get("type") != "assistant":
                continue
            for u in uses_of(msg_of(d)):
                if u.get("name") == "Bash" and (u.get("input") or {}).get(
                    "run_in_background"
                ):
                    bgid = next(
                        (k for k, v in bg_by_use.items() if v == u.get("id")),
                        None,
                    )
                    nidx = notified.get(bgid) if bgid else None
                    if nidx is None or nidx > bi:
                        live_bg += 1
        live_agents = sum(1 for n in pending.values() if n == "Agent")
        # POST: owner texts, rework of own-written paths, failed edits
        post_users = [
            t for d in post if (t := user_text(d)) is not None
        ]
        post_edit_ids = set()
        edit_errs = 0
        tools = 0
        for d in post:
            if d.get("type") == "assistant" and tools < 60:
                for u in uses_of(msg_of(d)):
                    tools += 1
                    inp = u.get("input") or {}
                    if u.get("name") in EDIT_TOOLS:
                        post_edit_ids.add(u.get("id"))
            elif d.get("type") == "user":
                for x in results_of(msg_of(d)):
                    if x.get("tool_use_id") in post_edit_ids and (
                        x.get("is_error") or x.get("isError")
                    ) and EDIT_ERR_RE.search(
                        json.dumps(x.get("content"), ensure_ascii=False)[:800]
                    ):
                        edit_errs += 1
        complaint = any(
            COMPLAINT_RE.search(t) for t in post_users[:10]
        )
        pre_shingles = [
            sh
            for d in pre
            if (t := user_text(d)) is not None and len(sh := shingle(t)) >= 4
        ]
        rep_sim = 0.0
        for t in post_users[:5]:
            sh = shingle(t)
            if (
                len(sh) >= 4
                and len(t) >= 20
                and t.strip().lower() not in {"resume", "ok resume", "продолжаем"}
            ):
                rep_sim = max(
                    rep_sim,
                    max((jaccard(sh, ps) for ps in pre_shingles), default=0.0),
                )
        out.append(
            dict(
                at=b.get("timestamp", ""),
                trigger=meta.get("trigger"),
                preTokens=meta.get("preTokens"),
                leftovers=lo,
                promise=promise,
                editsPending=edits_pending,
                unpushed=unpushed,
                liveBg=live_bg,
                liveAgents=live_agents,
                postTurns=len(post_users),
                complaint=complaint,
                repeat=rep_sim >= 0.5,
                repSim=round(rep_sim, 2),
                editErrs=edit_errs,
            )
        )
    return out


def main():
    outdir = sys.argv[1] if len(sys.argv) > 1 else "."
    rows = []
    for f in glob.glob(os.path.join(ROOT, "*", "*.jsonl")):
        try:
            # A blank or half-written line must cost that line, not the whole
            # file: journals end with a newline and an interrupted write can
            # leave a partial record behind.
            recs = []
            for line in open(f):
                if not line.strip():
                    continue
                try:
                    d = json.loads(line)
                except ValueError:
                    continue
                if isinstance(d, dict):
                    recs.append(d)
            rows += analyze(recs)
        except Exception as e:
            print("ERR", f, e, file=sys.stderr)
    seen = set()
    uniq = []
    for r in rows:
        k = (r["at"], r["preTokens"])
        if k in seen:
            continue
        seen.add(k)
        uniq.append(r)
    obs = [r for r in uniq if r["postTurns"] >= 2]

    def is_loss(r):
        return r["complaint"] or r["repeat"] or r["editErrs"] > 0

    def rate(subset):
        n = len(subset)
        losses = sum(1 for r in subset if is_loss(r))
        return f"{losses}/{n} ({100 * losses // n if n else 0}%)"

    def split(name, pred):
        yes = [r for r in obs if pred(r)]
        no = [r for r in obs if not pred(r)]
        print(f"{name:26s} loss: {rate(yes):12s} | without: {rate(no)}")

    print(f"boundaries: {len(rows)}, unique: {len(uniq)}, observable: {len(obs)}")
    print(f"losses: {sum(1 for r in obs if is_loss(r))}")
    split("leftovers listed_agent", lambda r: r["leftovers"] == "listed_agent")
    split("leftovers unknown", lambda r: r["leftovers"] == "unknown")
    split("promise in last answer", lambda r: r["promise"])
    split("editsPending>0", lambda r: r["editsPending"] > 0)
    split("unpushed>0", lambda r: r["unpushed"] > 0)
    split("liveBg>0", lambda r: r["liveBg"] > 0)
    split("preTokens>400k", lambda r: (r["preTokens"] or 0) > 400000)
    split("manual", lambda r: r["trigger"] == "manual")
    print("\nloss rows:")
    for r in obs:
        if is_loss(r):
            print(
                " ",
                r["at"][:16],
                r["trigger"],
                f"C={int(r['complaint'])} R={int(r['repeat'])}({r['repSim']})",
                f"ee={r['editErrs']} post={r['postTurns']} lo={r['leftovers']}",
                f"ed={r['editsPending']} unp={r['unpushed']} bg={r['liveBg']}",
            )
    keys = [
        "at",
        "trigger",
        "preTokens",
        "leftovers",
        "promise",
        "editsPending",
        "unpushed",
        "liveBg",
        "liveAgents",
        "postTurns",
        "complaint",
        "repeat",
        "repSim",
        "editErrs",
    ]
    with open(os.path.join(outdir, "corpus.tsv"), "w") as fh:
        w = csv.DictWriter(fh, keys, delimiter="\t", extrasaction="ignore")
        w.writeheader()
        w.writerows(uniq)


if __name__ == "__main__":
    main()
