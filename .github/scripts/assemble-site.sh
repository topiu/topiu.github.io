#!/usr/bin/env bash
# Assembles _site/ for GitHub Pages. Run from the repository root; the deploy
# workflow calls it, and it runs the same way locally.
#
#   landing/   -> /         copied as-is: the landing page, its icons, redirects
#   <app>/     -> /<app>/   with a package.json: npm ci, npm test, then
#                           BASE_PATH=/<app>/ npm run build, publishing dist/
#   <app>/     -> /<app>/   without one but holding an .html page: copied as-is;
#                           the page is index.html, or the folder's only .html
#                           file when there is no index.html, so a single-file
#                           app can be uploaded under its download name
#
# Every app is then listed in _site/apps.json with the name, description and
# icon from its own index.html (apps-json.mjs), so adding an app means adding a
# folder: neither the workflow nor the landing page needs to change.

set -euo pipefail
shopt -s nullglob

rm -rf _site
mkdir -p _site
if [ -d landing ]; then cp -r landing/. _site/; fi

apps=()
for dir in */; do
  app="${dir%/}"
  case "$app" in landing|_site|node_modules) continue ;; esac

  if [ -f "$app/package.json" ]; then
    echo "::group::build $app"
    ( cd "$app" \
      && npm ci --no-audit --no-fund \
      && npm test \
      && BASE_PATH="/$app/" npm run build )
    mkdir -p "_site/$app"
    cp -r "$app/dist/." "_site/$app/"
    echo "::endgroup::"
  else
    pages=( "$app"/*.html )
    [ ${#pages[@]} -gt 0 ] || continue   # no page to publish: not an app
    mkdir -p "_site/$app"
    cp -r "$app/." "_site/$app/"
    if [ ! -f "$app/index.html" ]; then
      if [ ${#pages[@]} -ne 1 ]; then
        echo "::error::$app/ has several .html files and no index.html. Rename the main page to index.html."
        exit 1
      fi
      cp "${pages[0]}" "_site/$app/index.html"
    fi
    echo "static $app (${pages[*]})"
  fi
  apps+=("$app")
done

node .github/scripts/apps-json.mjs _site "${apps[@]}"

echo "publishing:"
find _site -maxdepth 2 -mindepth 1 | sort
