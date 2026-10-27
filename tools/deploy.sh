#!/usr/bin/env bash
#
# Build nothing, test everything, publish, restart, purge, verify.
#
# There is no auto-deploy on this repo: this script IS the deploy. It runs all three kinds of test
# the site standard asks for — unit, end-to-end, live — because a site whose tests have not been run
# is not deployed yet, it is only uploaded.
#
# The app is a Node process behind Caddy (there is an API, so there has to be an origin): the files
# go to /opt/redqueen-vs-sharks/site, the server to /opt/redqueen-vs-sharks/server, the board to
# /opt/redqueen-vs-sharks/data — which is NOT overwritten, because it is other people's scores.
set -euo pipefail
cd "$(dirname "$0")/.."

HOST="redqueen-vs-sharks-with-laser-beams-attached-to-their-heads.nodejavascript.com"
DEST="/opt/redqueen-vs-sharks"

echo "== unit + static =="
node --test test/units.test.js test/static.test.js

echo "== end-to-end =="
node --test test/e2e.test.js

echo "== publish the files =="
rsync -az --delete --rsync-path="sudo rsync" site/ dvs-sites:"/tmp/redqueen-site/"
ssh dvs-sites "sudo mkdir -p $DEST/data && sudo rsync -a --delete /tmp/redqueen-site/ $DEST/site/ && rm -rf /tmp/redqueen-site"
rsync -az --rsync-path="sudo rsync" server/ dvs-sites:/tmp/redqueen-server/
rsync -az --rsync-path="sudo rsync" package.json dvs-sites:/tmp/redqueen-pkg.json
ssh dvs-sites "sudo rsync -a /tmp/redqueen-server/ $DEST/server/ && sudo cp /tmp/redqueen-pkg.json $DEST/package.json && rm -rf /tmp/redqueen-server /tmp/redqueen-pkg.json && sudo chown -R www-data:www-data $DEST/data && sudo chmod -R a+rX $DEST/site $DEST/server"

echo "== restart the app =="
ssh dvs-sites "sudo systemctl restart redqueen-vs-sharks && sleep 1 && systemctl is-active redqueen-vs-sharks"

echo "== purge the CDN =="
( cd ~/Documents/git/gitlab.com/datavisionstudios/docker-compose-master && .venv/bin/python3 ~/.cloudflare_purge.py --all )

echo "== smoke check =="
for path in / /game.js /rules.js /world.js /vendor/three.module.js /favicon.ico /manifest.webmanifest /robots.txt /sitemap.xml /og.png /api/scores; do
  code=$(curl -s -o /dev/null -w '%{http_code}' "https://$HOST$path")
  printf '  %-26s %s\n' "$path" "$code"
  [ "$code" = "200" ] || { echo "FAILED: $path returned $code"; exit 1; }
done

cache=$(curl -sI "https://$HOST/" | grep -i '^cache-control' | tr -d '\r')
case "$cache" in
  *no-store*) echo "  cache-control: $cache" ;;
  *) echo "FAILED: the shell is not no-store ($cache)"; exit 1 ;;
esac

echo "== live check =="
node tools/live-check.mjs

echo
echo "deployed."
