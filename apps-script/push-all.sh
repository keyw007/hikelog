#!/usr/bin/env bash
# 把 apps-script/計劃書.gs 推到所有試算表的腳本專案（.clasp-*.json 各一個）。
# 用法：在任何位置執行  ./apps-script/push-all.sh
# 第一次要先：npm i -g @google/clasp、clasp login，並在 https://script.google.com/home/usersettings 開啟 Apps Script API
set -euo pipefail
cd "$(dirname "$0")"
for p in .clasp-*.json; do
  echo "== ${p#.clasp-}"
  clasp -P "$PWD/$p" -I "$PWD/.claspignore" push --force
done
