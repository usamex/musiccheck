#!/usr/bin/env bash
# Run node/npm/npx inside the pinned Node image when Node is not installed on the host.
# Usage: scripts/node-docker.sh [--port 8081] <workdir relative to repo root> <command...>
#   scripts/node-docker.sh apps/mobile npm ci
#   scripts/node-docker.sh apps/mobile npx tsc --noEmit
# Files are written as the calling user. Network is the host network so Metro/Expo can be reached on the LAN.
set -euo pipefail
NODE_IMAGE="${NODE_IMAGE:-node:24-bookworm-slim}"
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WORKDIR="${1:?workdir required (e.g. apps/mobile)}"
shift
TTY_FLAGS=()
if [ -t 0 ] && [ -t 1 ]; then TTY_FLAGS=(-it); fi
exec docker run --rm "${TTY_FLAGS[@]}" \
  --user "$(id -u):$(id -g)" \
  --network host \
  -e HOME=/tmp/home \
  -e npm_config_cache=/tmp/home/.npm \
  -e CI="${CI:-}" \
  -e EXPO_PUBLIC_API_BASE_URL="${EXPO_PUBLIC_API_BASE_URL:-}" \
  -v "$REPO_ROOT:/repo" \
  -v musiccheck-node-home:/tmp/home \
  -w "/repo/$WORKDIR" \
  "$NODE_IMAGE" "$@"
