#!/bin/sh
# Point every Chrome user (HyperFrames CLI, the site cloner, the seam gate) at the image's browser.
if [ -z "$CHROME_PATH" ] && [ -f "$HOME/.chrome-path" ]; then
  CHROME_PATH="$(cat "$HOME/.chrome-path")"
  export CHROME_PATH
fi
export HYPERFRAMES_BROWSER_PATH="${HYPERFRAMES_BROWSER_PATH:-$CHROME_PATH}"
exec "$@"
