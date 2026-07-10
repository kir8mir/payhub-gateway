#!/bin/sh
set -e
# echo "****************************************** Applying migrations"
npx prisma db push
exec node dist/src/main.js