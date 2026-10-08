#!/usr/bin/env bash
# Serves the Episode 1 dev build on the local network so a phone can open it.
#
# (c) Copyright 2026 Liminal HQ, Scott Morris
# SPDX-License-Identifier: Apache-2.0 OR MIT

# Builds the WASM, then starts Vite on every interface (port 5173) and prints the addresses to try.
# Plain http over the LAN is not a secure context, so fullscreen, the wake lock and the Gamepad API
# are unavailable there; `adb reverse` (printed below) makes the phone see http://localhost instead.
set -euo pipefail
cd "$(dirname "$0")/.."

bun run build:wasm

# The computer's IPv4 addresses (Linux `ip`, then `hostname -I`), keeping LAN ranges and skipping Docker's.
ips=$( (ip -4 -o addr show scope global 2>/dev/null | awk '{print $4}' | cut -d/ -f1) || true )
[ -n "$ips" ] || ips=$(hostname -I 2>/dev/null || true)
echo
echo "On the same Wi-Fi, open one of these on the phone:"
for ip in $ips; do
  case "$ip" in 172.1[6-9].*|172.2*|172.3[01].*) continue ;; esac
  echo "  http://$ip:5173/?debug&level=0    (straight into Crater Fields)"
  echo "  http://$ip:5173/                  (the title screen)"
done
echo
echo "For a secure context (fullscreen, wake lock, gamepad), plug the phone in with USB debugging and run:"
echo "  adb reverse tcp:5173 tcp:5173"
echo "then open http://localhost:5173/ in Chrome on the phone."
echo

exec bun run --cwd episodes/episode-1 dev --host
