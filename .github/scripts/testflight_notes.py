#!/usr/bin/env python3
"""TestFlight "What to Test" notes for the build just uploaded.

  testflight_notes.py write BASE_SHA OUT_FILE
      Writes the changes to the app since BASE_SHA (commits touching
      ios-native/, newest first) to OUT_FILE.

  testflight_notes.py upload NOTES_FILE
      Waits until App Store Connect lists the build, then sets the notes as
      "What to Test" in every language of the app's TestFlight information.
      Needs ASC_KEY_ID, ASC_ISSUER_ID, ASC_KEY_PATH, BUNDLE_ID,
      MARKETING_VERSION and BUILD_NUMBER in the environment.

Standard library only (the JWT is signed with the openssl command).
"""
import base64, json, os, re, subprocess, sys, time, urllib.error, urllib.request

LIMIT = 4000  # App Store Connect's limit for whatsNew
API = "https://api.appstoreconnect.apple.com/v1"


def git(*args):
    return subprocess.run(["git", *args], check=True, capture_output=True, text=True).stdout


def notes_since(base):
    rev = f"{base}..HEAD" if base else "-15"
    log = git("log", "--no-merges", "--format=%x1e%s%x1f%b", rev, "--", "ios-native")
    lines = []
    for entry in filter(None, log.split("\x1e")):
        subject, _, body = entry.partition("\x1f")
        lines.append("• " + subject.strip())
        # Squash merges list the PR's commits as "* title" lines.
        for line in body.splitlines():
            if line.startswith("* "):
                lines.append("   – " + line[2:].strip())
    text = "\n".join(lines) or "Drobné úpravy."
    if len(text) > LIMIT:
        text = text[: LIMIT - 1].rsplit("\n", 1)[0] + "\n…"
    return text


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
    # The build shows up a few minutes after the upload, while Apple processes it.
    for _ in range(40):
        builds = call("GET", query)["data"]
        if builds:
            break
        time.sleep(30)
    else:
        sys.exit("The build did not appear in App Store Connect within 20 minutes")
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
    if sys.argv[1] == "write":
        with open(sys.argv[3], "w", encoding="utf-8") as out:
            out.write(notes_since(sys.argv[2]) + "\n")
    elif sys.argv[1] == "upload":
        upload(sys.argv[2])
    else:
        sys.exit(__doc__)
