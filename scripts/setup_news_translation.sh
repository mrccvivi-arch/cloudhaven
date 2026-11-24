#!/usr/bin/env bash
set -euo pipefail

python3 -m pip install --disable-pip-version-check 'ctranslate2==4.6.3' 'sentencepiece==0.2.1'
for direction in en_zh zh_en; do
  curl --fail --silent --show-error --location --retry 2 --max-time 75 \
    "https://data.argosopentech.com/argospm/v1/translate-${direction}-1_9.argosmodel" \
    --output "$RUNNER_TEMP/daily-world-${direction}.argosmodel"
done
echo "DAILY_WORLD_TRANSLATION_MODEL=$RUNNER_TEMP/daily-world-en_zh.argosmodel" >> "$GITHUB_ENV"
echo "DAILY_WORLD_REVERSE_MODEL=$RUNNER_TEMP/daily-world-zh_en.argosmodel" >> "$GITHUB_ENV"
