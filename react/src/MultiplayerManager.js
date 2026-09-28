import { Peer } from "peerjs";

/**
 * Robust Naval Multiplayer Network Manager
 * 1. In-Memory Server Relay (zero NAT issues, instant sync across local network / server)
 * 2. WebRTC PeerJS with Google STUN servers & automatic Host/Guest negotiation
 * 3. BroadcastChannel (for same-machine multi-tab duels)
 */
export class MultiplayerManager {
  constructor({
    playerName,
    roomCode,
    isHost,
    onRoleAssigned,
    onPeerJoined,
    onRemoteState,
    onRemoteFire,
    onRemoteHit,
    onRematch,
    onStatusChange,
  }) {
    this.playerName = playerName || "Captain";
    this.roomCode = (roomCode || "SEA1").toUpperCase().trim();
    this.myRole = isHost ? "p1" : "p2";
    this.isHost = isHost ?? true;

    this.onRoleAssigned = onRoleAssigned;
    this.onPeerJoined = onPeerJoined;
    this.onRemoteState = onRemoteState;
    this.onRemoteFire = onRemoteFire;
    this.onRemoteHit = onRemoteHit;
    this.onRematch = onRematch;
    this.onStatusChange = onStatusChange;

    this.peer = null;
    this.conn = null;
    this.broadcast = null;
    this.isConnected = false;
    this.remotePlayerName = "Waiting for Player 2...";

    // State buffer for in-memory sync
    this.useServerRelay = false;
    this.serverSyncTimer = null;
    this.pendingBulletsOut = [];
    this.pendingHitsOut = 0;
    this.latestLocalState = null;
    this.isDestroyed = false;

    // Start network layers
    this.initServerRelay();
    this.initBroadcast();
    this.initPeerJS();
  }

  /* ── 1. In-Memory Server Relay (Highest Reliability) ── */
  async initServerRelay() {
    try {
      const res = await fetch("/api/naval/join", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          roomId: this.roomCode,
          playerName: this.playerName,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          this.useServerRelay = true;
          this.myRole = data.role;
          this.isHost = data.role === "p1";

          if (this.onRoleAssigned) {
            this.onRoleAssigned({ role: this.myRole, isHost: this.isHost });
          }

          if (data.opponentName) {
            this.remotePlayerName = data.opponentName;
            this.isConnected = true;
            this.updateStatus("connected", `Battling: ${this.remotePlayerName}`);
            if (this.onPeerJoined) this.onPeerJoined({ name: this.remotePlayerName, role: this.myRole === "p1" ? "p2" : "p1" });
          } else {
            this.updateStatus("waiting", `In-Memory Room ${this.roomCode} Active. Waiting for opponent...`);
          }

          this.startServerSyncLoop();
        }
      }
    } catch (e) {
      // Server relay unavailable (e.g. running on static serverless CDN)
      this.useServerRelay = false;
    }
  }

  startServerSyncLoop() {
    if (this.isDestroyed) return;

    const syncTick = async () => {
      if (this.isDestroyed) return;

      try {
        const payload = {
          roomId: this.roomCode,
          role: this.myRole,
          playerName: this.playerName,
          state: this.latestLocalState,
          newBullets: this.pendingBulletsOut.splice(0, this.pendingBulletsOut.length),
          hits: this.pendingHitsOut,
        };
        this.pendingHitsOut = 0;

        const res = await fetch("/api/naval/sync", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });

        if (res.ok) {
          const data = await res.json();
          if (data.opponentActive && data.opponentName) {
            if (!this.isConnected || this.remotePlayerName !== data.opponentName) {
              this.isConnected = true;
              this.remotePlayerName = data.opponentName;
              this.updateStatus("connected", `Battling: ${this.remotePlayerName}`);
              if (this.onPeerJoined) {
                this.onPeerJoined({ name: this.remotePlayerName, role: this.myRole === "p1" ? "p2" : "p1" });
              }
            }

            if (data.opponentState && this.onRemoteState) {
              this.onRemoteState(data.opponentState);
            }

            if (data.incomingBullets && data.incomingBullets.length > 0 && this.onRemoteFire) {
              data.incomingBullets.forEach((b) => this.onRemoteFire(b));
            }

            if (data.incomingHits > 0 && this.onRemoteHit) {
              this.onRemoteHit({ damage: data.incomingHits * 5 });
            }

            if (data.rematch && this.onRematch) {
              this.onRematch();
            }
          } else if (this.isConnected && !data.opponentActive) {
            this.isConnected = false;
            this.updateStatus("waiting", "Opponent disconnected. Waiting for challenger...");
          }
        }
      } catch (e) {}

      if (!this.isDestroyed) {
        this.serverSyncTimer = setTimeout(syncTick, 35); // ~28Hz tick rate
      }
    };

    syncTick();
  }

  /* ── 2. Local Cross-Tab Sync via BroadcastChannel ── */
  initBroadcast() {
    try {
      this.broadcast = new BroadcastChannel(`tide_room_${this.roomCode}`);
      this.broadcast.onmessage = (event) => {
        this.handleMessage(event.data);
      };

      setTimeout(() => {
        this.send({
          type: "announce",
          role: this.myRole,
          name: this.playerName,
        });
      }, 200);
    } catch (e) {}
  }

  /* ── 3. Cross-Device WebRTC via PeerJS ── */
  initPeerJS() {
    try {
      const roomSlug = this.roomCode.toLowerCase().replace(/[^a-z0-9]/g, "");
      const hostPeerId = `tide-room-${roomSlug}-host`;
      const peerOptions = {
        config: {
          iceServers: [
            { urls: "stun:stun.l.google.com:19302" },
            { urls: "stun:stun1.l.google.com:19302" },
            { urls: "stun:stun2.l.google.com:19302" },
          ],
        },
      };

      if (this.isHost) {
        this.peer = new Peer(hostPeerId, peerOptions);

        this.peer.on("open", () => {
          if (!this.useServerRelay) {
            this.updateStatus("hosting", `Room: ${this.roomCode}. Waiting for Player 2...`);
          }
        });

        this.peer.on("connection", (c) => {
          this.conn = c;
          this.setupPeerConn();
        });

        this.peer.on("error", (err) => {
          // If host ID is taken, this means another player is already hosting!
          // Automatically switch this laptop to guest and connect!
          if (err.type === "unavailable-id") {
            this.isHost = false;
            this.myRole = "p2";
            if (this.onRoleAssigned) this.onRoleAssigned({ role: "p2", isHost: false });
            if (this.peer) {
              try { this.peer.destroy(); } catch (e) {}
            }
            this.initPeerAsGuest(hostPeerId, peerOptions);
          }
        });
      } else {
        this.initPeerAsGuest(hostPeerId, peerOptions);
      }
    } catch (e) {
      console.warn("PeerJS init error:", e);
    }
  }

  initPeerAsGuest(hostPeerId, peerOptions) {
    const guestId = `tide-room-${this.roomCode.toLowerCase()}-guest-${Math.floor(Math.random() * 100000)}`;
    this.peer = new Peer(guestId, peerOptions);

    this.peer.on("open", () => {
      if (!this.useServerRelay) {
        this.updateStatus("connecting", `Connecting to Host on Room ${this.roomCode}...`);
      }
      const conn = this.peer.connect(hostPeerId, { reliable: false });
      this.conn = conn;
      this.setupPeerConn();
    });

    this.peer.on("error", (err) => {
      console.log("PeerJS Guest notice:", err.type);
    });
  }

  setupPeerConn() {
    if (!this.conn) return;

    this.conn.on("open", () => {
      this.isConnected = true;
      this.updateStatus("connected", `P2P Connected on room ${this.roomCode}!`);

      this.send({
        type: "handshake",
        role: this.myRole,
        name: this.playerName,
      });
    });

    this.conn.on("data", (data) => {
      this.handleMessage(data);
    });

    this.conn.on("close", () => {
      if (!this.useServerRelay) {
        this.isConnected = false;
        this.updateStatus("disconnected", "Opponent disconnected.");
      }
    });
  }

  updateStatus(state, message) {
    if (this.onStatusChange) {
      this.onStatusChange({ state, message, remoteName: this.remotePlayerName, role: this.myRole });
    }
  }

  /* ── 4. Central Message Dispatcher ── */
  handleMessage(msg) {
    if (!msg || typeof msg !== "object") return;
    if (msg.role === this.myRole) return; // Prevent echo loops

    switch (msg.type) {
      case "announce":
      case "handshake":
        this.remotePlayerName = msg.name || "Player 2";
        this.isConnected = true;
        this.updateStatus("connected", `Battling: ${this.remotePlayerName}`);
        if (this.onPeerJoined) this.onPeerJoined(msg);
        if (msg.type === "announce") {
          this.send({
            type: "handshake_ack",
            role: this.myRole,
            name: this.playerName,
          });
        }
        break;

      case "handshake_ack":
        this.remotePlayerName = msg.name || "Player 2";
        this.isConnected = true;
        this.updateStatus("connected", `Battling: ${this.remotePlayerName}`);
        if (this.onPeerJoined) this.onPeerJoined(msg);
        break;

      case "state":
        if (this.onRemoteState) this.onRemoteState(msg);
        break;

      case "fire":
        if (this.onRemoteFire) this.onRemoteFire(msg);
        break;

      case "hit":
        if (this.onRemoteHit) this.onRemoteHit(msg);
        break;

      case "rematch":
        if (this.onRematch) this.onRematch(msg);
        break;

      default:
        break;
    }
  }

  send(data) {
    data.role = this.myRole;

    if (this.conn && this.conn.open) {
      try { this.conn.send(data); } catch (e) {}
    }

    if (this.broadcast) {
      try { this.broadcast.postMessage(data); } catch (e) {}
    }
  }

  sendState(state) {
    this.latestLocalState = state;
    this.send({
      type: "state",
      ...state,
    });
  }

  sendFire(bulletData) {
    this.pendingBulletsOut.push(bulletData);
    this.send({
      type: "fire",
      ...bulletData,
    });
  }

  sendHit(damage) {
    this.pendingHitsOut += 1;
    this.send({
      type: "hit",
      damage,
    });
  }

  sendRematch() {
    this.send({
      type: "rematch",
    });
    if (this.useServerRelay) {
      fetch("/api/naval/rematch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roomId: this.roomCode }),
      }).catch(() => {});
    }
  }

  updatePlayerName(newName) {
    if (!newName || !newName.trim()) return;
    this.playerName = newName.trim();
    if (this.useServerRelay) {
      fetch("/api/naval/join", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          roomId: this.roomCode,
          playerName: this.playerName,
          role: this.myRole,
        }),
      }).catch(() => {});
    }
    this.send({
      type: "handshake",
      role: this.myRole,
      name: this.playerName,
    });
  }

  destroy() {
    this.isDestroyed = true;
    if (this.serverSyncTimer) {
      clearTimeout(this.serverSyncTimer);
      this.serverSyncTimer = null;
    }
    if (this.conn) {
      try { this.conn.close(); } catch (e) {}
      this.conn = null;
    }
    if (this.peer) {
      try { this.peer.destroy(); } catch (e) {}
      this.peer = null;
    }
    if (this.broadcast) {
      try { this.broadcast.close(); } catch (e) {}
      this.broadcast = null;
    }
  }
}
