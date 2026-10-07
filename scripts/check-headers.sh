#!/usr/bin/env bash
# Checks that source, workflow and shell files begin with the licence header.
#
# (c) Copyright 2026 Liminal HQ, Scott Morris
# SPDX-License-Identifier: Apache-2.0 OR MIT

# The header is a one-line summary, a bare comment line, then the copyright and SPDX lines
# (`//` comments for .rs/.ts/.tsx/.js, `#` for workflow YAML and shell scripts, placed after
# any shebang). Config-only files, `design/` and generated output are exempt.
set -euo pipefail
cd "$(dirname "$0")/.."

EXEMPT='^(design/|eslint\.config\.js$|vitest\.config\.ts$|playwright\.config\.ts$|episodes/[^/]+/vite\.config\.ts$)'

fail=0
while IFS= read -r file; do
  [[ "$file" =~ $EXEMPT ]] && continue
  case "$file" in
    *.rs | *.ts | *.tsx | *.js) c='//' ;;
    *.yml | *.yaml | *.sh) c='#' ;;
    *) continue ;;
  esac
  offset=0
  if [ "$c" = '#' ] && [[ "$(sed -n 1p "$file")" == '#!'* ]]; then offset=1; fi
  # `sed` reads only what it needs; a `tail | head` pipe can die of SIGPIPE under `pipefail`.
  header="$(sed -n "$((offset + 1)),$((offset + 4))p" "$file")"
  summary="$(sed -n 1p <<<"$header")"
  if ! [[ "$summary" == "$c "*. ]] ||
    [ "$(sed -n 2p <<<"$header")" != "$c" ] ||
    [ "$(sed -n 3p <<<"$header")" != "$c (c) Copyright 2026 Liminal HQ, Scott Morris" ] ||
    [ "$(sed -n 4p <<<"$header")" != "$c SPDX-License-Identifier: Apache-2.0 OR MIT" ]; then
    echo "missing or malformed licence header: $file"
    fail=1
  fi
done < <(git ls-files)

if [ "$fail" -ne 0 ]; then
  echo "See AGENTS.md (Licence and Copyright) for the required header." >&2
  exit 1
fi
echo "licence headers ok"
