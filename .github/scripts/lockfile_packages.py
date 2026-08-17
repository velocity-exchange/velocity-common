#!/usr/bin/env python3
"""Print the set of package names recorded in a lockfile, one per line.

Supports bun.lock, yarn.lock (v1 classic + berry), pnpm-lock.yaml and Cargo.lock.
Parses text only -- never installs, never resolves, never touches the network.

  lockfile_packages.py <lockfile>                  list every package name
  lockfile_packages.py <base_lock> <head_lock>     list names present only in head
"""

import re
import sys
from pathlib import Path


# yarn/pnpm descriptors can carry a protocol ("pkg@npm:...", "pkg@patch:...") or a
# peer-suffix ("pkg@1.2.3(peer@4.5.6)"). Both confuse a naive rsplit on '@'.
_PROTOCOL = re.compile(
    r"@(?:npm|patch|workspace|file|link|portal|git|git\+ssh|git\+https|https?|ssh|exec|virtual|alias):"
)


def split_name(spec):
    """'@scope/pkg@1.2.3' -> '@scope/pkg';  'pkg@npm:@other/pkg@^1' -> 'pkg'."""
    spec = spec.split("(", 1)[0]  # drop pnpm peer suffix
    proto = _PROTOCOL.search(spec)
    if proto and proto.start() > 0:
        return spec[: proto.start()]
    at = spec.rfind("@")
    return spec[:at] if at > 0 else spec


def bun(text):
    # "packages": { "<key>": ["<name>@<version>", "<registry>", {...}, "<hash>"] }
    # The key is not always the plain package name -- bun.lock represents a hoisted
    # duplicate version with a compound key like "anchor-bankrun/@coral-xyz/anchor",
    # so the name must come from the array's own first element, not the key.
    #
    # bun.lock is also JSONC, so formatting is not significant to bun itself -- a
    # hand-edited file can legally place two entries on one line, which a line-anchored
    # regex would miss. Match `"<key>": [ "<first-elem>"` anywhere in the text (not
    # anchored to line-start), and only treat it as a package entry when the first
    # element actually carries a version/protocol suffix that split_name strips off.
    # That rejects the format's other bracketed keys -- "os": [...], "cpu": [...] --
    # whose elements ("linux", "x64", ...) have no such suffix to strip.
    names = set()
    for m in re.finditer(r'"[^"]+":\s*\[\s*"([^"]+)"', text):
        first = m.group(1)
        name = split_name(first)
        if name != first:
            names.add(name)
    return names


def yarn(text):
    names = set()
    if "__metadata:" in text:  # berry / v2+
        # resolution: "@scope/pkg@npm:1.2.3" | "pkg@workspace:." | "pkg@patch:..."
        for m in re.finditer(r'^\s+resolution:\s*"([^"]+)"', text, re.M):
            names.add(split_name(m.group(1)))
    else:  # v1 classic -- comma-separated descriptor headers ending in ':'
        for line in text.splitlines():
            if not line or line[0].isspace() or line.startswith("#"):
                continue
            line = line.rstrip()
            if not line.endswith(":"):
                continue
            for spec in line[:-1].split(", "):
                spec = spec.strip().strip('"')
                if spec:
                    names.add(split_name(spec))
    return names


def pnpm(text):
    # v9 packages:/snapshots: entries -> "  '@scope/pkg@1.2.3':" or "  pkg@1.2.3:"
    names = set()
    for m in re.finditer(r"^  '?([^'\s:][^'\s]*)'?:\s*$", text, re.M):
        spec = m.group(1)
        if "@" in spec.lstrip("@"):
            names.add(split_name(spec))
    # legacy v5/v6 style -> "  /@scope/pkg/1.2.3:" or "  /pkg/1.2.3:"
    for m in re.finditer(r"^  /((?:@[^/\s]+/)?[^/\s]+)/\d", text, re.M):
        names.add(m.group(1))
    return {n for n in names if n}


def cargo(text):
    return set(re.findall(r'^name = "([^"]+)"$', text, re.M))


PARSERS = {
    "bun.lock": bun,
    "yarn.lock": yarn,
    "pnpm-lock.yaml": pnpm,
    "Cargo.lock": cargo,
}


def extract(path):
    p = Path(path)
    parser = PARSERS.get(p.name)
    if parser is None:
        sys.exit(f"unsupported lockfile: {p.name}")
    if not p.exists():  # lockfile added in this PR -> everything in it is new
        return set()
    return parser(p.read_text(encoding="utf-8", errors="replace"))


if __name__ == "__main__":
    if len(sys.argv) == 2:
        for n in sorted(extract(sys.argv[1])):
            print(n)
    elif len(sys.argv) == 3:
        for n in sorted(extract(sys.argv[2]) - extract(sys.argv[1])):
            print(n)
    else:
        sys.exit(__doc__)
