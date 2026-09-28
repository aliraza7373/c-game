import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

/**
 * In-Memory Naval Multiplayer Relay Plugin
 * Stores active room state, player positions, HP, and bullet events in memory
 * for zero-friction cross-laptop multiplayer on local network or server.
 */
function navalMultiplayerPlugin() {
  const rooms = new Map();

  // Periodic cleanup of idle rooms older than 15 minutes
  setInterval(() => {
    const now = Date.now();
    for (const [id, room] of rooms.entries()) {
      if (now - room.updatedAt > 15 * 60 * 1000) {
        rooms.delete(id);
      }
    }
  }, 60000);

  return {
    name: 'naval-multiplayer-relay',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = req.url ? req.url.split('?')[0] : '';
        if (url.startsWith('/api/naval/')) {
          res.setHeader('Content-Type', 'application/json');
          res.setHeader('Access-Control-Allow-Origin', '*');
          res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
          res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

          if (req.method === 'OPTIONS') {
            res.statusCode = 204;
            return res.end();
          }

          if (req.method === 'GET' && url === '/api/naval/status') {
            res.statusCode = 200;
            return res.end(JSON.stringify({ activeRooms: rooms.size, timestamp: Date.now() }));
          }

          if (req.method === 'POST') {
            let body = '';
            req.on('data', (chunk) => { body += chunk; });
            req.on('end', () => {
              let data = {};
              try { data = JSON.parse(body || '{}'); } catch (e) {}
              const roomId = (data.roomId || 'SEA1').toUpperCase().trim();
              const now = Date.now();

              if (!rooms.has(roomId)) {
                rooms.set(roomId, {
                  id: roomId,
                  createdAt: now,
                  updatedAt: now,
                  p1: null,
                  p2: null,
                  bulletsForP1: [],
                  bulletsForP2: [],
                  hitsForP1: 0,
                  hitsForP2: 0,
                  rematchRequest: false,
                });
              }
              const room = rooms.get(roomId);
              room.updatedAt = now;

              if (url === '/api/naval/join') {
                const name = data.playerName || 'Captain';
                const p1Alive = room.p1 && (now - room.p1.lastSeen < 12000);
                const p2Alive = room.p2 && (now - room.p2.lastSeen < 12000);

                let assignedRole = 'p1';
                if (p1Alive && room.p1.name === name) {
                  assignedRole = 'p1';
                  room.p1.lastSeen = now;
                } else if (p2Alive && room.p2.name === name) {
                  assignedRole = 'p2';
                  room.p2.lastSeen = now;
                } else if (p1Alive && !p2Alive) {
                  assignedRole = 'p2';
                  room.p2 = { name, lastSeen: now, hp: 100, x: 0, z: 160, heading: Math.PI, speed: 0, roll: 0, pitch: 0 };
                } else if (!p1Alive) {
                  assignedRole = 'p1';
                  room.p1 = { name, lastSeen: now, hp: 100, x: 0, z: 0, heading: 0, speed: 0, roll: 0, pitch: 0 };
                  if (!p2Alive) room.p2 = null;
                } else {
                  assignedRole = 'p2';
                  room.p2 = { name, lastSeen: now, hp: 100, x: 0, z: 160, heading: Math.PI, speed: 0, roll: 0, pitch: 0 };
                }

                const opponentRole = assignedRole === 'p1' ? 'p2' : 'p1';
                const opp = room[opponentRole];
                const opponentActive = opp && (now - opp.lastSeen < 12000);

                return res.end(JSON.stringify({
                  success: true,
                  roomId,
                  role: assignedRole,
                  myPlayer: room[assignedRole],
                  opponentName: opponentActive ? opp.name : null,
                  isConnected: !!opponentActive,
                }));
              }

              if (url === '/api/naval/sync') {
                const role = data.role;
                if (role) {
                  if (!room[role]) {
                    room[role] = { name: data.playerName || 'Captain', lastSeen: now };
                  }
                  const player = room[role];
                  player.lastSeen = now;
                  if (data.playerName) player.name = data.playerName;
                  if (data.state) Object.assign(player, data.state);
                }

                const opponentRole = role === 'p1' ? 'p2' : 'p1';
                const opp = room[opponentRole];
                const oppAlive = opp && (now - opp.lastSeen < 12000);

                // Enqueue bullets for opponent
                if (data.newBullets && Array.isArray(data.newBullets) && data.newBullets.length > 0) {
                  const targetQueue = role === 'p1' ? room.bulletsForP2 : room.bulletsForP1;
                  targetQueue.push(...data.newBullets);
                }

                // Enqueue hits
                if (data.hits && data.hits > 0) {
                  if (role === 'p1') room.hitsForP2 += data.hits;
                  else room.hitsForP1 += data.hits;
                }

                // Consume incoming bullets meant for this player
                const myBulletQueue = role === 'p1' ? room.bulletsForP1 : room.bulletsForP2;
                const incomingBullets = [...myBulletQueue];
                myBulletQueue.length = 0;

                const myHitCounter = role === 'p1' ? room.hitsForP1 : room.hitsForP2;
                const incomingHits = myHitCounter;
                if (role === 'p1') room.hitsForP1 = 0;
                else room.hitsForP2 = 0;

                const rematch = room.rematchRequest;

                return res.end(JSON.stringify({
                  success: true,
                  opponentActive: !!oppAlive,
                  opponentName: oppAlive ? opp.name : null,
                  opponentState: oppAlive ? opp : null,
                  incomingBullets,
                  incomingHits,
                  rematch,
                }));
              }

              if (url === '/api/naval/rematch') {
                room.bulletsForP1.length = 0;
                room.bulletsForP2.length = 0;
                room.hitsForP1 = 0;
                room.hitsForP2 = 0;
                room.rematchRequest = true;
                if (room.p1) room.p1.hp = 100;
                if (room.p2) room.p2.hp = 100;
                setTimeout(() => { room.rematchRequest = false; }, 2000);
                return res.end(JSON.stringify({ success: true }));
              }

              res.statusCode = 404;
              return res.end(JSON.stringify({ error: 'Endpoint not found' }));
            });
            return;
          }
        }
        next();
      });
    },
  };
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), navalMultiplayerPlugin()],
  server: {
    host: true, // Listen on all network interfaces (0.0.0.0) so other laptops on Wi-Fi can connect!
  },
})
