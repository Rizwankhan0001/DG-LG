#!/bin/sh
set -eu
# A newly attached persistent volume can be owned by root. Only initialize
# the application's dedicated storage directory before dropping privileges.
if [ "$(id -u)" = "0" ]; then
  mkdir -p /app/storage
  chown node:node /app/storage
  chmod 700 /app/storage
  exec gosu node "$@"
fi
exec "$@"
