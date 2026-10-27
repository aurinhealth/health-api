#!/usr/bin/env python3
"""TestFlight "What to Test" notes for the build just uploaded.

The notes are written by hand in each pull request's description, in Czech
and in English (the app's TestFlight information has both languages):

  ## TestFlight
  **Co je nového**
  - Jídlo a pití se uloží hned a okno se zavře okamžitě.
  **Co otestovat**
  - Přidej jídlo a hned ho smaž přes Vrátit.
  **What's new**
  - Food and drinks save at once and the sheet closes right away.
  **What to test**
  - Add a food and delete it straight away with Undo.

A pull request with nothing for testers says "Nic k otestování" in that
section instead. The notes file holds the Czech text, then a line
"--- English ---" and the English text; a file without that line (text typed
in by hand) goes to every language as it is.

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
      "What to Test" in every language of the app's TestFlight information:
      Czech in cs, English in the others.
      Needs ASC_KEY_ID, ASC_ISSUER_ID, ASC_KEY_PATH, BUNDLE_ID,
      MARKETING_VERSION and BUILD_NUMBER in the environment.

  testflight_notes.py release NOTES_FILE
      "Vydat": sets the notes on build BUILD_NUMBER (already in TestFlight),
      and, only with EXTERNAL=true (Vydat's "external" ticked), adds it to the
      external testers' group (EXTERNAL_GROUP, or the only external group) and
      sends it to Apple's beta review. Same environment
      as upload, without MARKETING_VERSION. With RELEASE_ALL=1, write takes
      every pull request since BASE_SHA, not only the ones touching ios-native/.

Standard library only (the JWT is signed with the openssl command).
"""
import base64, json, os, re, subprocess, sys, time, unicodedata, urllib.error, urllib.request

LIMIT = 4000  # App Store Connect's limit for whatsNew
API = "https://api.appstoreconnect.apple.com/v1"
NEW, TEST = "Co je nového", "Co otestovat"
NEW_EN, TEST_EN = "What's new", "What to test"
HEADINGS = {h.lower(): h for h in (NEW, TEST, NEW_EN, TEST_EN)}
NOTHING = "nic k otestování"
ENGLISH = "--- English ---"  # splits the notes file into Czech and English
EXAMPLE = f"""## TestFlight
**{NEW}**
- Jídlo a pití se uloží hned a okno se zavře okamžitě.
**{TEST}**
- Přidej jídlo a hned ho smaž přes Vrátit.
**{NEW_EN}**
- Food and drinks save at once and the sheet closes right away.
**{TEST_EN}**
- Add a food and delete it straight away with Undo."""
# What a build says when the pull requests give nothing to quote: (cs, en).
OTHERS = {"cs": "Další drobné úpravy.", "en": "Other small improvements."}
NONE = {"cs": "Drobné úpravy, nic nového k otestování.", "en": "Small fixes, nothing new to test."}


def git(*args):
    return subprocess.run(["git", *args], check=True, capture_output=True, text=True).stdout


def section(body):
    """The pull request's TestFlight section: {heading: bullet list} for the
    four headings (empty lists when it says there is nothing to test), None
    when it is missing."""
    lines = (body or "").replace("\r", "").split("\n")
    start = next((i for i, l in enumerate(lines) if re.match(r"#{2,3}\s*TestFlight\s*$", l.strip(), re.I)), None)
    if start is None:
        return None
    lists, current, text = {h: [] for h in HEADINGS.values()}, None, []
    for raw in lines[start + 1:]:
        line = raw.strip()
        if re.match(r"#{1,3}\s", line) and not re.match(r"#{1,3}\s*(co je nového|co otestovat|what's new|what to test)", line, re.I):
            break  # the next section of the description
        if line.startswith("---") or line.startswith("🤖"):
            break  # the attribution footer
        heading = re.sub(r"[#*_:\s]+", " ", line.replace("’", "'")).strip().lower()
        if heading in HEADINGS:
            current = HEADINGS[heading]
        elif re.match(r"[-*•]\s+", line) and current:
            lists[current].append(re.sub(r"^[-*•]\s+", "", line).replace("**", "").replace("`", ""))
        text.append(line)
    if not any(lists.values()):
        return lists if NOTHING in " ".join(text).lower() else None
    return lists


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


def render_one(entries, lang):
    """One language's notes; entries: (title, section) per pull request, newest first."""
    new_h, test_h = (NEW, TEST) if lang == "cs" else (NEW_EN, TEST_EN)
    new, test, untold = [], [], False
    for _, sec in entries:
        if sec is None or (any(sec.values()) and not sec[new_h] and not sec[test_h]):
            # No section (from before it existed), or one without this
            # language: the title isn't quoted, only counted.
            untold = True
        elif sec:
            new += [plain(l) for l in sec[new_h]]
            test += [plain(l) for l in sec[test_h]]
    if untold:
        new.append(OTHERS[lang])
    if not new and not test:
        return NONE[lang]
    parts = []
    if new:
        parts.append(new_h + "\n" + "\n".join("• " + l for l in new))
    if test:
        parts.append(test_h + "\n" + "\n".join("• " + l for l in test))
    text = "\n\n".join(parts)
    if len(text) > LIMIT:
        text = text[: LIMIT - 1].rsplit("\n", 1)[0] + "\n…"
    return text


def render(entries):
    """The notes file: Czech, the ENGLISH line, English."""
    return render_one(entries, "cs") + "\n\n" + ENGLISH + "\n\n" + render_one(entries, "en")


def languages(notes):
    """{"cs": text, "en": text} from a notes file; one text for both without ENGLISH."""
    cs, sep, en = notes.partition("\n" + ENGLISH + "\n")
    return {"cs": cs.strip()[:LIMIT], "en": (en if sep else cs).strip()[:LIMIT]}


def notes_since(base):
    if os.environ.get("PR_NUMBER"):
        pr = pull_request(os.environ["PR_NUMBER"]) or {}
        return render([(pr.get("title", ""), section(pr.get("body")))])
    rev = f"{base}..HEAD" if base else "-15"
    paths = [] if os.environ.get("RELEASE_ALL") == "1" else ["--", "ios-native"]
    log = git("log", "--no-merges", "--format=%s", rev, *paths)
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
    czech, english = sec[NEW] + sec[TEST], sec[NEW_EN] + sec[TEST_EN]
    lines = czech + english
    if english and not czech:
        sys.exit(f"::error::Sekce TestFlight potřebuje i českou část ({NEW} / {TEST}).")
    if czech and not re.search(r"[ěščřžýáíéůúťďň]", " ".join(czech), re.I):
        sys.exit("::error::Česká část sekce TestFlight má být česky (Co je nového / Co otestovat).")
    if sec[NEW] and not sec[TEST]:
        sys.exit(f"::error::Sekce TestFlight potřebuje i „{TEST}“: konkrétní kroky v aplikaci.")
    if czech and not english:
        sys.exit(f"::error::Sekce TestFlight potřebuje i anglickou verzi pod „**{NEW_EN}**“ a „**{TEST_EN}**“ "
                 "(stejné body anglicky, pro testery s angličtinou):\n\n" + EXAMPLE)
    if sec[NEW_EN] and not sec[TEST_EN]:
        sys.exit(f"::error::Anglická část sekce TestFlight potřebuje i „{TEST_EN}“.")
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


def call(method, path, body=None, allow=()):
    """allow: HTTP codes that are an answer, not a failure (returned as {"status": code})."""
    req = urllib.request.Request(API + path, method=method,
                                 data=json.dumps(body).encode() if body else None,
                                 headers={"Authorization": "Bearer " + token(), "Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req) as res:
            return json.load(res) if res.status != 204 else {}
    except urllib.error.HTTPError as err:
        if err.code in allow:
            return {"status": err.code}
        sys.exit(f"{method} {path} → {err.code}: {err.read().decode()[:500]}")


def app_id():
    bundle = os.environ["BUNDLE_ID"]
    apps = call("GET", f"/apps?filter[bundleId]={bundle}")["data"]
    if not apps:
        sys.exit(f"No app with bundle ID {bundle} in App Store Connect")
    return apps[0]["id"]


def set_notes(app, build, notes):
    """notes: the notes file's text; Czech goes to cs, English to every other language."""
    texts = languages(notes)
    locales = {loc["attributes"]["locale"] for loc in call("GET", f"/apps/{app}/betaAppLocalizations")["data"]} or {"cs"}
    existing = {loc["attributes"]["locale"]: loc["id"] for loc in call("GET", f"/builds/{build}/betaBuildLocalizations")["data"]}
    for locale in sorted(locales):
        notes = texts["cs" if locale.startswith("cs") else "en"]
        if locale in existing:
            call("PATCH", f"/betaBuildLocalizations/{existing[locale]}",
                 {"data": {"type": "betaBuildLocalizations", "id": existing[locale], "attributes": {"whatsNew": notes}}})
        else:
            call("POST", "/betaBuildLocalizations",
                 {"data": {"type": "betaBuildLocalizations", "attributes": {"locale": locale, "whatsNew": notes},
                           "relationships": {"build": {"data": {"type": "builds", "id": build}}}}})
        print(f"What to Test set for {locale}")


def external_group(groups, name=""):
    """The external testers' group: the one called name, else the only one."""
    external = [g for g in groups if not g["attributes"].get("isInternalGroup")]
    if name:
        external = [g for g in external if g["attributes"].get("name") == name]
    if len(external) != 1:
        found = ", ".join(g["attributes"].get("name", "?") for g in groups if not g["attributes"].get("isInternalGroup")) or "žádná"
        sys.exit(f"::error::Nenašel jsem jednu externí skupinu testerů{' „' + name + '“' if name else ''} (externí skupiny: {found}). "
                 "Založ ji v App Store Connect → TestFlight → External Testing, nebo nastav EXTERNAL_GROUP.")
    return external[0]



def release(notes_file):
    notes = open(notes_file, encoding="utf-8").read()
    env = os.environ
    app = app_id()
    builds = call("GET", f"/builds?filter[app]={app}&filter[version]={env['BUILD_NUMBER']}")["data"]
    if not builds:
        sys.exit(f"::error::Build {env['BUILD_NUMBER']} v App Store Connectu není.")
    build = builds[0]
    state = build["attributes"].get("processingState")
    if state != "VALID":
        sys.exit(f"::error::Build {env['BUILD_NUMBER']} není připravený (stav {state}).")
    if build["attributes"].get("expired"):
        sys.exit(f"::error::Build {env['BUILD_NUMBER']} v TestFlightu vypršel.")
    set_notes(app, build["id"], notes)
    if env.get("EXTERNAL") != "true":
        print("External testers: not sent (Vydat's \"external\" not ticked; add the build by hand in App Store Connect)")
        return
    group = external_group(call("GET", f"/apps/{app}/betaGroups?limit=200")["data"], env.get("EXTERNAL_GROUP", ""))
    call("POST", f"/betaGroups/{group['id']}/relationships/builds", {"data": [{"type": "builds", "id": build["id"]}]})
    print(f"Build {env['BUILD_NUMBER']} added to {group['attributes'].get('name')}")
    # Apple reviews the first build of a version for external testers; a build
    # already sent (or approved) answers 409, which is fine.
    review = call("POST", "/betaAppReviewSubmissions",
                  {"data": {"type": "betaAppReviewSubmissions",
                            "relationships": {"build": {"data": {"type": "builds", "id": build["id"]}}}}}, allow=(409,))
    if review.get("status") == 409:
        print("Beta review: already submitted or not needed")
    else:
        print("Beta review: submitted")


def upload(notes_file):
    notes = open(notes_file, encoding="utf-8").read()
    env = os.environ
    app = app_id()
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
    set_notes(app, builds[0]["id"], notes)


if __name__ == "__main__":
    if sys.argv[1] == "check":
        check()
    elif sys.argv[1] == "write":
        with open(sys.argv[3], "w", encoding="utf-8") as out:
            out.write(notes_since(sys.argv[2]) + "\n")
    elif sys.argv[1] == "upload":
        upload(sys.argv[2])
    elif sys.argv[1] == "release":
        release(sys.argv[2])
    else:
        sys.exit(__doc__)
