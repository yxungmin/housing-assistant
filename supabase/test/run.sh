#!/usr/bin/env bash
# 마이그레이션을 빈 Postgres에 처음부터 적용하고 동작까지 확인한다.
#   npm run db:check          (Docker 필요)
# Supabase에 적용하기 전에 이걸 통과시킨다. 실제 프로젝트는 건드리지 않는다.
set -euo pipefail

NAME=housing-pg-check
IMAGE=postgres:16-alpine
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

cleanup() { docker rm -f "$NAME" >/dev/null 2>&1 || true; }
trap cleanup EXIT

if ! docker info >/dev/null 2>&1; then
  echo "Docker가 켜져 있지 않다. Docker Desktop을 실행한 뒤 다시 돌린다."
  exit 1
fi

cleanup
echo "Postgres 띄우는 중 ($IMAGE)"
docker run -d --name "$NAME" -e POSTGRES_PASSWORD=check -e POSTGRES_DB=housing "$IMAGE" >/dev/null

for _ in $(seq 1 60); do
  if docker exec "$NAME" pg_isready -U postgres -d housing >/dev/null 2>&1; then break; fi
  sleep 1
done

psql() { docker exec -i -e PGPASSWORD=check "$NAME" psql -v ON_ERROR_STOP=1 -q -U postgres -d housing "$@"; }

psql < "$ROOT/supabase/test/00_shim.sql"
for f in "$ROOT"/supabase/migrations/*.sql; do
  echo "  $(basename "$f")"
  psql < "$f"
done
for f in "$ROOT"/supabase/seed/*.sql; do
  echo "  seed $(basename "$f")"
  psql < "$f"
done

psql < "$ROOT/supabase/test/01_checks.sql"
