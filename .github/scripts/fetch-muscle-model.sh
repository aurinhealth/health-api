#!/bin/bash
# Copies the licensed 3D muscle figure (Muscle3D.swift) from R2 into the app's bundle before the
# Xcode project is generated: ios-native/Aurin/Resources/Models/muscles-v1.bin, gitignored. The
# repository is public, so the file is never committed; the app then has the figure without a
# download, in the sample day too. Without the key (a fork's pull request) the build goes on
# without it and the app downloads the figure as before.
#
# Repository secrets: MUSCLE_MODEL_R2_KEY_ID and MUSCLE_MODEL_R2_SECRET, an R2 API token
# (Object Read only, bucket loadwise-food-catalog only), and CLOUDFLARE_ACCOUNT_ID.
set -euo pipefail

key=models/muscles-v1.bin.gz   # src/muscle-model.js MUSCLE_MODEL_FORMATS[1]
out="$(git rev-parse --show-toplevel)/ios-native/Aurin/Resources/Models/muscles-v1.bin"

if [ -z "${MUSCLE_MODEL_R2_KEY_ID:-}" ] || [ -z "${MUSCLE_MODEL_R2_SECRET:-}" ] || [ -z "${CLOUDFLARE_ACCOUNT_ID:-}" ]; then
  echo "::warning::No 3D muscle model in the app (missing MUSCLE_MODEL_R2_KEY_ID, MUSCLE_MODEL_R2_SECRET or CLOUDFLARE_ACCOUNT_ID); it downloads it instead."
  exit 0
fi

command -v aws >/dev/null || brew install --quiet awscli
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
AWS_ACCESS_KEY_ID="$MUSCLE_MODEL_R2_KEY_ID" AWS_SECRET_ACCESS_KEY="$MUSCLE_MODEL_R2_SECRET" AWS_DEFAULT_REGION=auto \
  aws s3 cp --only-show-errors "s3://loadwise-food-catalog/$key" "$tmp/model.gz" \
  --endpoint-url "https://$CLOUDFLARE_ACCOUNT_ID.r2.cloudflarestorage.com"
gunzip -c "$tmp/model.gz" > "$tmp/model.bin"
# The format build-muscle-model.mjs writes starts with AURM.
if [ "$(head -c 4 "$tmp/model.bin")" != "AURM" ]; then
  echo "::error::$key is not a model from scripts/build-muscle-model.mjs"
  exit 1
fi
mkdir -p "$(dirname "$out")"
mv "$tmp/model.bin" "$out"
echo "3D muscle model in the app: $(wc -c < "$out" | tr -d ' ') bytes"
