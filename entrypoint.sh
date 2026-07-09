#!/bin/sh
set -e
# echo "****************************************** Applying migrations"
npx prisma migrate deploy
exec node dist/src/main.js