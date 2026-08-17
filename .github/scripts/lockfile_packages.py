#!/usr/bin/env python3
"""Print the packages a lockfile records, together with where each is fetched from.

Supports bun.lock, yarn.lock (v1 classic + berry), pnpm-lock.yaml and Cargo.lock.
Parses text only: never installs, never resolves, never touches the network.

  lockfile_packages.py <lockfile>                "<name>\\t<source>", one per line
  lockfile_packages.py <base_lock> <head_lock>   what the head lockfile adds:
      new     <name>  <source>   name is absent from the base lockfile
      source  <name>  <source>   name is already present, fetched from somewhere new

Comparing names alone is not enough: repointing an existing package at a tarball,
a git remote, a local path or a different registry keeps the name identical, so a
name-only diff reports nothing. The source is therefore compared too. It excludes
the version for plain registry dependencies, so an ordinary version bump is not
reported, while a change of protocol, host or path is.

A lockfile that cannot be parsed is a hard error rather than an empty result: this
runs as a merge gate, and "unparseable" must never read as "nothing was added".
"""

import json
import re
import sys
from pathlib import Path


# Descriptors can carry a protocol ("pkg@npm:...", "pkg@patch:...") or a peer suffix
# ("pkg@1.2.3(peer@4.5.6)"). Both confuse a naive rsplit on '@'.
_PROTOCOL = re.compile(
    r"@(?:npm|patch|workspace|file|link|portal|git|git\+[a-z]+|https?|ssh|exec|virtual|alias|github):"
)

# A reference starting with one of these is not a plain registry version.
_REF_PROTOCOL = re.compile(
    r"^(?:npm|patch|workspace|file|link|portal|git|git\+[a-z]+|https?|ssh|exec|virtual|alias|github):"
)

# A semver, or a range that resolves to one. Anything else after "npm:" names a
# different package, i.e. an alias.
_VERSIONISH = re.compile(r"^[\^~><=v\s]*\d")

# Hosts that serve the public npm registry; a URL pointing at one of these is an
# ordinary registry download, so the version in its path is not part of the source.
_NPM_REGISTRY_HOSTS = ("registry.npmjs.org", "registry.yarnpkg.com")

DEFAULT_REGISTRY = "registry:default"


def split_name(spec):
    """'@scope/pkg@1.2.3' -> '@scope/pkg';  'pkg@npm:@other/pkg@^1' -> 'pkg'."""
    spec = spec.split("(", 1)[0]  # drop pnpm peer suffix
    proto = _PROTOCOL.search(spec)
    if proto and proto.start() > 0:
        return spec[: proto.start()]
    at = spec.rfind("@")
    return spec[:at] if at > 0 else spec


def split_ref(locator):
    """'@scope/pkg@1.2.3' -> ('@scope/pkg', '1.2.3')."""
    name = split_name(locator)
    rest = locator[len(name) :]
    return name, rest[1:] if rest.startswith("@") else ""


def source_of(ref, registry=""):
    """Classify where a package is fetched from, ignoring its version."""
    if ref.startswith("npm:"):
        target = ref[4:]
        # yarn writes ordinary registry deps as "pkg@npm:1.2.3"; an alias names
        # another package instead ("pkg@npm:other-pkg@1.2.3").
        if _VERSIONISH.match(target):
            return f"registry:{registry}" if registry else DEFAULT_REGISTRY
        return f"npm-alias:{split_name(target)}"
    if _REF_PROTOCOL.match(ref):
        return ref
    return f"registry:{registry}" if registry else DEFAULT_REGISTRY


def source_of_url(url):
    """Classify a resolved download URL (yarn v1's 'resolved', pnpm tarballs)."""
    host = url.split("://", 1)[-1].split("/", 1)[0]
    if host in _NPM_REGISTRY_HOSTS:
        return DEFAULT_REGISTRY
    return url.split("#", 1)[0]


def _add(out, locator, registry="", source=None):
    name, ref = split_ref(locator)
    out.setdefault(name, set()).add(source or source_of(ref, registry))


def _strip_jsonc(text):
    """Drop comments and trailing commas so json can load a JSONC document."""
    out = []
    i, n = 0, len(text)
    while i < n:
        c = text[i]
        if c == '"':
            j = i + 1
            while j < n:
                if text[j] == "\\":
                    j += 2
                    continue
                if text[j] == '"':
                    break
                j += 1
            out.append(text[i : j + 1])
            i = j + 1
        elif c == "/" and i + 1 < n and text[i + 1] in "/*":
            if text[i + 1] == "/":
                j = text.find("\n", i)
            else:
                j = text.find("*/", i + 2)
                j = -1 if j == -1 else j + 2
            i = n if j == -1 else j
        elif c == ",":
            j = i + 1
            while j < n and text[j].isspace():
                j += 1
            if not (j < n and text[j] in "]}"):
                out.append(c)
            i += 1
        else:
            out.append(c)
            i += 1
    return "".join(out)


def bun(text, path):
    # "packages": { "<key>": ["<name>@<ref>", "<registry>", {...}, "<hash>"] }
    #
    # Parsed as JSONC rather than scanned line by line, so what the gate sees is what
    # bun sees: formatting a file to hide entries from a regex cannot work. The key is
    # not always the package name (a hoisted duplicate gets a compound key such as
    # "anchor-bankrun/@coral-xyz/anchor"), so the name comes from the array's own first
    # element. The registry slot is absent for non-registry sources, where the protocol
    # in the locator already identifies the source.
    data = json.loads(_strip_jsonc(text))
    packages = data.get("packages")
    if not isinstance(packages, dict):
        sys.exit(f"{path}: no 'packages' object")
    out = {}
    for key, entry in packages.items():
        if not isinstance(entry, list) or not entry or not isinstance(entry[0], str):
            sys.exit(f"{path}: unexpected entry for {key!r}: {entry!r}")
        registry = entry[1] if len(entry) > 1 and isinstance(entry[1], str) else ""
        _add(out, entry[0], registry)
    return out


def yarn(text, path):
    out = {}
    if "__metadata:" in text:  # berry / v2+
        for m in re.finditer(r'^\s+resolution:\s*"([^"]+)"', text, re.M):
            _add(out, m.group(1))
        return out
    # v1 classic: comma-separated descriptor headers, then a "resolved" download URL.
    # The header carries a range, not a version, so the source comes from the URL.
    descriptors = []
    for line in text.splitlines():
        stripped = line.strip()
        if line and not line[0].isspace() and not line.startswith("#") and stripped.endswith(":"):
            descriptors = [s.strip().strip('"') for s in stripped[:-1].split(", ") if s.strip()]
            for spec in descriptors:
                _add(out, spec)
        elif stripped.startswith("resolved "):
            url = stripped.split(" ", 1)[1].strip().strip('"')
            for spec in descriptors:
                name, ref = split_ref(spec)
                if not _REF_PROTOCOL.match(ref):  # a protocol descriptor is its own source
                    out.setdefault(name, set()).add(source_of_url(url))
    return out


def pnpm(text, path):
    # v9 packages:/snapshots: entries -> "  '@scope/pkg@1.2.3':" or "  pkg@1.2.3:".
    # A resolution.tarball override is not inspected, so a pnpm-locked repo needs a
    # closer look here before relying on the source column.
    out = {}
    for m in re.finditer(r"^  '?([^'\s:][^'\s]*)'?:\s*$", text, re.M):
        spec = m.group(1)
        if "@" in spec.lstrip("@"):
            _add(out, spec)
    for m in re.finditer(r"^  /((?:@[^/\s]+/)?[^/\s]+)/\d", text, re.M):  # legacy v5/v6
        out.setdefault(m.group(1), set()).add(DEFAULT_REGISTRY)
    return out


def cargo(text, path):
    # [[package]] blocks: name, version, and an optional source ("registry+...",
    # "git+..."). A block with no source is a local path dependency.
    out = {}
    for block in text.split("[[package]]")[1:]:
        block = block.split("\n[", 1)[0]
        name = re.search(r'^name = "([^"]+)"$', block, re.M)
        if not name:
            continue
        src = re.search(r'^source = "([^"]+)"$', block, re.M)
        out.setdefault(name.group(1), set()).add(src.group(1).split("#", 1)[0] if src else "path")
    return out


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
        return {}
    text = p.read_text(encoding="utf-8", errors="replace")
    try:
        return parser(text, path)
    except SystemExit:
        raise
    except Exception as e:  # never let a parse failure read as "nothing was added"
        sys.exit(f"{path}: could not parse as {p.name}: {e}")


def diff(base, head):
    for name in sorted(head):
        if name not in base:
            for source in sorted(head[name]):
                yield "new", name, source
        else:
            for source in sorted(head[name] - base[name]):
                yield "source", name, source


if __name__ == "__main__":
    if len(sys.argv) == 2:
        for name, sources in sorted(extract(sys.argv[1]).items()):
            for source in sorted(sources):
                print(f"{name}\t{source}")
    elif len(sys.argv) == 3:
        for row in diff(extract(sys.argv[1]), extract(sys.argv[2])):
            print("\t".join(row))
    else:
        sys.exit(__doc__)
