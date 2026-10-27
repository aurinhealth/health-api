#!/usr/bin/env python3
"""Turns a capability on for a bundle ID in the Apple Developer account.

  asc_capability.py BUNDLE_ID CAPABILITY

The export (-allowProvisioningUpdates) registers new bundle IDs itself but
does not add capabilities to one already registered: the Apple Watch app's
ID gets HealthKit here before its profile is made. A bundle ID not
registered yet is left to the export. Needs ASC_KEY_ID, ASC_ISSUER_ID and
ASC_KEY_PATH (testflight_notes.py signs the token).
"""
import os, sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from testflight_notes import call  # noqa: E402


def main(bundle, capability):
    found = [b for b in call("GET", f"/bundleIds?filter[identifier]={bundle}&limit=200")["data"]
             if b["attributes"]["identifier"] == bundle]
    if not found:
        print(f"{bundle} is not registered yet; the export registers it.")
        return
    bundle_id = found[0]["id"]
    caps = call("GET", f"/bundleIds/{bundle_id}/bundleIdCapabilities")["data"]
    if any(c["attributes"]["capabilityType"] == capability for c in caps):
        print(f"{bundle} already has {capability}.")
        return
    call("POST", "/bundleIdCapabilities",
         {"data": {"type": "bundleIdCapabilities", "attributes": {"capabilityType": capability},
                   "relationships": {"bundleId": {"data": {"type": "bundleIds", "id": bundle_id}}}}},
         allow=(409,))
    print(f"{capability} turned on for {bundle}.")


if __name__ == "__main__":
    if len(sys.argv) != 3:
        sys.exit(__doc__)
    main(sys.argv[1], sys.argv[2])
