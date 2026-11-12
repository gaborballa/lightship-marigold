#!/bin/bash
# Double-click to play: starts a local server and opens the game.
cd "$(dirname "$0")"
(sleep 1; open "http://localhost:8123/index.html") &
python3 -m http.server 8123
