#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_LOCAL="$ROOT_DIR/.env.local"

if [ ! -f "$ENV_LOCAL" ]; then
  echo "❌ $ENV_LOCAL not found. Create or copy a .env.local at project root."
  exit 1
fi

echo "🔁 Populating service .env files from .env.local"
for svc in "$ROOT_DIR"/services/*; do
  if [ -d "$svc" ]; then
    name="$(basename "$svc")"
    dest="$svc/.env"
    echo " - $name -> $dest"
    sed "s/<service>/$name/g" "$ENV_LOCAL" > "$dest"
  fi
done

echo "✅ .env files populated for services"
