#!/bin/sh
set -e
# npx prisma generate
# echo "****************************************** Applying migrations"
# npx prisma migrate deploy
exec node dist/main.js