#!/usr/bin/env python3
"""TestFlight "What to Test" notes for the build just uploaded.

The notes are written by hand, in Czech, in each pull request's description:

  ## TestFlight
  **Co je nového**
  - Jídlo a pití se uloží hned a okno se zavře okamžitě.
  **Co otestovat**
  - Přidej jídlo a hned ho smaž přes Vrátit.

A pull request with nothing for testers says "Nic k otestování" in that
section instead.

  testflight_notes.py write BASE_SHA OUT_FILE
      Collects the TestFlight sections of the pull requests merged since
      BASE_SHA (squash commits touching ios-native/, newest first) into
      OUT_FILE. With PR_NUMBER set, takes just that pull request.
      Needs GH_TOKEN and GITHUB_REPOSITORY to read the descriptions.

  testflight_notes.py check
      Fails a pull request (GITHUB_EVENT_PATH) whose description has no
      usable TestFlight section.

  testflight_notes.py upload NOTES_FILE
      Waits until App Store Connect lists the build, then sets the notes as
      "What to Test" in every language of the app's TestFlight information.
      Needs ASC_KEY_ID, ASC_ISSUER_ID, ASC_KEY_PATH, BUNDLE_ID,
      MARKETING_VERSION and BUILD_NUMBER in the environment.

Standard library only (the JWT is signed with the openssl command).
"""
import base64, json, os, re, subprocess, sys, time, unicodedata, urllib.error, urllib.request

LIMIT = 4000  # App Store Connect's limit for whatsNew
API = "https://api.appstoreconnect.apple.com/v1"
NEW, TEST = "Co je nového", "Co otestovat"
NOTHING = "nic k otestování"
EXAMPLE = f"""## TestFlight
**{NEW}**
- Jídlo a pití se uloží hned a okno se zavře okamžitě.
**{TEST}**
- Přidej jídlo a hned ho smaž přes Vrátit."""


def git(*args):
    return subprocess.run(["git", *args], check=True, capture_output=True, text=True).stdout


def section(body):
    """The pull request's TestFlight section: (new, test) bullet lists,
    ([], []) when it says there is nothing to test, None when it is missing."""
    lines = (body or "").replace("\r", "").split("\n")
    start = next((i for i, l in enumerate(lines) if re.match(r"#{2,3}\s*TestFlight\s*$", l.strip(), re.I)), None)
    if start is None:
        return None
    lists, current, text = {NEW: [], TEST: []}, None, []
    for raw in lines[start + 1:]:
        line = raw.strip()
        if re.match(r"#{1,3}\s", line) and not re.match(r"#{1,3}\s*(co je nového|co otestovat)", line, re.I):
            break  # the next section of the description
        if line.startswith("---") or line.startswith("🤖"):
            break  # the attribution footer
        heading = re.sub(r"[#*_:\s]+", " ", line).strip().lower()
        if heading in (NEW.lower(), TEST.lower()):
            current = NEW if heading == NEW.lower() else TEST
        elif re.match(r"[-*•]\s+", line) and current:
            lists[current].append(re.sub(r"^[-*•]\s+", "", line).replace("**", "").replace("`", ""))
        text.append(line)
    if not lists[NEW] and not lists[TEST]:
        return ([], []) if NOTHING in " ".join(text).lower() else None
    return lists[NEW], lists[TEST]


def pull_request(number):
    req = urllib.request.Request(f"https://api.github.com/repos/{os.environ['GITHUB_REPOSITORY']}/pulls/{number}",
                                 headers={"Authorization": "Bearer " + os.environ["GH_TOKEN"],
                                          "Accept": "application/vnd.github+json"})
    try:
        with urllib.request.urlopen(req) as res:
            return json.load(res)
    except urllib.error.HTTPError:
        return None


def plain(line):
    """App Store Connect refuses symbols such as ✓, ✕ or emoji in whatsNew
    (build 86); arrows and punctuation pass."""
    line = "".join(c for c in line if unicodedata.category(c) != "So")
    return re.sub(r"\s+([,.;:])", r"\1", re.sub(r"\s{2,}", " ", line)).strip()


def render(entries):
    """entries: (title, section) per pull request, newest first."""
    new, test, untold = [], [], False
    for _, sec in entries:
        if sec is None:
            untold = True
        else:
            new += [plain(l) for l in sec[0]]
            test += [plain(l) for l in sec[1]]
    if untold:
        # A pull request without the section (from before it existed): its
        # title is often English, so it is only counted, never quoted.
        new.append("Další drobné úpravy.")
    if not new and not test:
        return "Drobné úpravy, nic nového k otestování."
    parts = []
    if new:
        parts.append(NEW + "\n" + "\n".join("• " + l for l in new))
    if test:
        parts.append(TEST + "\n" + "\n".join("• " + l for l in test))
    text = "\n\n".join(parts)
    if len(text) > LIMIT:
        text = text[: LIMIT - 1].rsplit("\n", 1)[0] + "\n…"
    return text


def notes_since(base):
    if os.environ.get("PR_NUMBER"):
        pr = pull_request(os.environ["PR_NUMBER"]) or {}
        return render([(pr.get("title", ""), section(pr.get("body")))])
    rev = f"{base}..HEAD" if base else "-15"
    log = git("log", "--no-merges", "--format=%s", rev, "--", "ios-native")
    entries = []
    for subject in filter(None, log.splitlines()):
        m = re.search(r"\(#(\d+)\)\s*$", subject)
        pr = pull_request(m.group(1)) if m else None
        title = re.sub(r"\s*\(#\d+\)\s*$", "", subject).strip()
        entries.append((title, section(pr.get("body")) if pr else None))
    return render(entries)


def check():
    event = json.load(open(os.environ["GITHUB_EVENT_PATH"], encoding="utf-8"))
    sec = section(event["pull_request"].get("body"))
    if sec is None:
        sys.exit("::error::Popis PR nemá sekci TestFlight pro testery. Přidej ji do popisu "
                 "(česky, bez čísel PR a názvů v kódu), nebo do ní napiš „Nic k otestování“:\n\n" + EXAMPLE)
    lines = sec[0] + sec[1]
    if lines and not re.search(r"[ěščřžýáíéůúťďň]", " ".join(lines), re.I):
        sys.exit("::error::Sekce TestFlight má být česky (Co je nového / Co otestovat).")
    if sec[0] and not sec[1]:
        sys.exit(f"::error::Sekce TestFlight potřebuje i „{TEST}“: konkrétní kroky v aplikaci.")
    symbols = sorted({c for c in " ".join(lines) if unicodedata.category(c) == "So"})
    if symbols:
        sys.exit("::error::App Store Connect v sekci TestFlight nepřijme znaky " + " ".join(symbols) + ", napiš je slovy.")
    print(render([("", sec)]))


def b64(data):
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode()


def der_to_raw(der):
    # ECDSA-Sig-Value ::= SEQUENCE { r INTEGER, s INTEGER } → r || s, 32 bytes each.
    i = 2 if der[1] < 0x80 else 2 + (der[1] & 0x7F)
    out = b""
    for _ in range(2):
        assert der[i] == 0x02
        n = der[i + 1]
        out += der[i + 2 : i + 2 + n].lstrip(b"\x00").rjust(32, b"\x00")
        i += 2 + n
    return out


def token():
    header = b64(json.dumps({"alg": "ES256", "kid": os.environ["ASC_KEY_ID"], "typ": "JWT"}).encode())
    now = int(time.time())
    claims = {"iss": os.environ["ASC_ISSUER_ID"], "iat": now, "exp": now + 1080, "aud": "appstoreconnect-v1"}
    signing = f"{header}.{b64(json.dumps(claims).encode())}"
    der = subprocess.run(["openssl", "dgst", "-sha256", "-sign", os.environ["ASC_KEY_PATH"]],
                         input=signing.encode(), check=True, capture_output=True).stdout
    return f"{signing}.{b64(der_to_raw(der))}"


def call(method, path, body=None):
    req = urllib.request.Request(API + path, method=method,
                                 data=json.dumps(body).encode() if body else None,
                                 headers={"Authorization": "Bearer " + token(), "Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req) as res:
            return json.load(res) if res.status != 204 else {}
    except urllib.error.HTTPError as err:
        sys.exit(f"{method} {path} → {err.code}: {err.read().decode()[:500]}")


def upload(notes_file):
    notes = open(notes_file, encoding="utf-8").read().strip()[:LIMIT]
    env = os.environ
    apps = call("GET", f"/apps?filter[bundleId]={env['BUNDLE_ID']}")["data"]
    if not apps:
        sys.exit(f"No app with bundle ID {env['BUNDLE_ID']} in App Store Connect")
    app = apps[0]["id"]
    query = (f"/builds?filter[app]={app}&filter[version]={env['BUILD_NUMBER']}"
             f"&filter[preReleaseVersion.version]={env['MARKETING_VERSION']}")
    # The build shows up after the upload, while Apple processes it; that has
    # taken over 20 minutes (build 58), so this waits up to an hour.
    for _ in range(120):
        builds = call("GET", query)["data"]
        if builds:
            break
        time.sleep(30)
    else:
        sys.exit("The build did not appear in App Store Connect within an hour")
    build = builds[0]["id"]
    locales = {loc["attributes"]["locale"] for loc in call("GET", f"/apps/{app}/betaAppLocalizations")["data"]} or {"cs"}
    existing = {loc["attributes"]["locale"]: loc["id"] for loc in call("GET", f"/builds/{build}/betaBuildLocalizations")["data"]}
    for locale in sorted(locales):
        if locale in existing:
            call("PATCH", f"/betaBuildLocalizations/{existing[locale]}",
                 {"data": {"type": "betaBuildLocalizations", "id": existing[locale], "attributes": {"whatsNew": notes}}})
        else:
            call("POST", "/betaBuildLocalizations",
                 {"data": {"type": "betaBuildLocalizations", "attributes": {"locale": locale, "whatsNew": notes},
                           "relationships": {"build": {"data": {"type": "builds", "id": build}}}}})
        print(f"What to Test set for {locale}")


if __name__ == "__main__":
    if sys.argv[1] == "check":
        check()
    elif sys.argv[1] == "write":
        with open(sys.argv[3], "w", encoding="utf-8") as out:
            out.write(notes_since(sys.argv[2]) + "\n")
    elif sys.argv[1] == "upload":
        upload(sys.argv[2])
    else:
        sys.exit(__doc__)
