#!/usr/bin/env bash
# Verifies _site/ after assemble-site.sh. Run from the repository root.
#
# A broken publish used to be silent: the page loaded and simply did nothing.
# Every local asset a published page references must exist in the artifact,
# and no page may still point at unbuilt sources. Failing here keeps the last
# good deployment live instead of replacing it with something that cannot
# start.
#
# Checked: every page at the root (the landing page, redirects) and each app's
# index.html.

set -euo pipefail
shopt -s nullglob

fail=0
for page in _site/*.html _site/*/index.html; do
  d="$(dirname "$page")/"
  rel="${page#_site/}"

  if grep -qE '(src|href)="[^"]*/src/' "$page"; then
    echo "::error::$rel still points at unbuilt sources"
    fail=1
  fi

  while IFS= read -r ref; do
    case "$ref" in
      ""|http*|//*|data:*|\#*|mailto:*) continue ;;
      /*) target="_site${ref}" ;;
      *)  target="${d}${ref}" ;;
    esac
    target="${target%%\?*}"; target="${target%%\#*}"
    if [ ! -e "$target" ]; then
      echo "::error::$rel references $ref but $target is not in the artifact"
      fail=1
    fi
  done < <(grep -oE '(src|href)="[^"]+"' "$page" | sed -E 's/^[^"]*"//; s/"$//')
done

[ "$fail" -eq 0 ] || exit 1
echo "verified: every referenced asset is present"
