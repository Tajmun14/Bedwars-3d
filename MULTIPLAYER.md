# BedWars 3D — multiplayer prototype

This branch adds a Socket.IO room server and a multiplayer menu to the existing game.

## What currently works
- Create a room and receive a 5-character code.
- Join by code; a room allows up to 10 players.
- Display remote player avatars and synchronize their positions/rotation.
- Leave/disconnect cleanup and a simple health endpoint at \`/health\`.

## Important limitation
This is an initial multiplayer prototype, not a complete networked BedWars match yet. Building/breaking blocks, combat, beds, resources, shop purchases, and match outcomes are still local to each browser. Do not treat the client as authoritative for competitive play.

## Run locally
1. Install Node.js 18 or newer.
2. In this folder run \`npm install\`.
3. Run \`npm start\`.
4. Open the game page and choose **MULTIPLAYER**.
5. For local testing, use \`http://localhost:3000\` as server address. Open another browser/device on the same network and use the computer's local network address instead of localhost.

## Public deployment
Deploy this Node.js project to a host that supports long-lived WebSocket connections. Set the start command to \`npm start\`. Copy the public HTTPS service URL into the game's Multiplayer menu. GitHub Pages serves the static game but does not run this Socket.IO server.
