#!/usr/bin/env bash
set -euo pipefail

python3 -m pip install --disable-pip-version-check 'ctranslate2==4.6.3' 'sentencepiece==0.2.1'
curl --fail --silent --show-error --location --retry 2 --max-time 75 \
  'https://data.argosopentech.com/argospm/v1/translate-en_zh-1_9.argosmodel' \
  --output "$RUNNER_TEMP/daily-world-en-zh.argosmodel"
echo "DAILY_WORLD_TRANSLATION_MODEL=$RUNNER_TEMP/daily-world-en-zh.argosmodel" >> "$GITHUB_ENV"
