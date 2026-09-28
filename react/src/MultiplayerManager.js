import { Peer } from "peerjs";

/**
 * Robust Naval Multiplayer Network Manager
 * Combines BroadcastChannel (instant zero-lag cross-tab/window sync)
 * with PeerJS WebRTC (cross-device/cross-network room code matching).
 */
export class MultiplayerManager {
  constructor({ playerName, roomCode, isHost, onPeerJoined, onRemoteState, onRemoteFire, onRemoteHit, onRematch, onStatusChange }) {
    this.playerName = playerName || "Captain";
    this.roomCode = (roomCode || "SEA1").toUpperCase().trim();
    this.isHost = isHost ?? true;
    this.myRole = isHost ? "p1" : "p2";

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
    this.remotePlayerName = isHost ? "Waiting for Player 2..." : "Connecting to Host...";

    this.initBroadcast();
    this.initPeerJS();
  }

  /* ── 1. Local Cross-Tab Sync via BroadcastChannel ── */
  initBroadcast() {
    try {
      this.broadcast = new BroadcastChannel(`tide_room_${this.roomCode}`);
      this.broadcast.onmessage = (event) => {
        this.handleMessage(event.data);
      };

      // Announce arrival
      setTimeout(() => {
        this.send({
          type: "announce",
          role: this.myRole,
          name: this.playerName,
        });
      }, 300);
    } catch (e) {
      console.warn("BroadcastChannel not available:", e);
    }
  }

  /* ── 2. Cross-Device WebRTC via PeerJS ── */
  initPeerJS() {
    try {
      // Create unique peer ID or connect to room host
      const hostPeerId = `tide-voyager-${this.roomCode.toLowerCase()}-host`;

      if (this.isHost) {
        this.peer = new Peer(hostPeerId);
        this.peer.on("open", () => {
          this.updateStatus("hosting", `Hosting room: ${this.roomCode}. Waiting for opponent...`);
        });

        this.peer.on("connection", (c) => {
          this.conn = c;
          this.setupPeerConn();
        });

        this.peer.on("error", (err) => {
          // If ID is taken, another host exists in this room; fallback to client or cross-tab
          console.log("PeerJS notice (room may already exist or cross-tab):", err.type);
          this.updateStatus("ready", `Local/Cross-Tab Active on Room: ${this.roomCode}`);
        });
      } else {
        const clientPeerId = `tide-voyager-${this.roomCode.toLowerCase()}-guest-${Math.floor(Math.random() * 10000)}`;
        this.peer = new Peer(clientPeerId);

        this.peer.on("open", () => {
          this.updateStatus("connecting", `Connecting to Host on Room ${this.roomCode}...`);
          const conn = this.peer.connect(hostPeerId, { reliable: false });
          this.conn = conn;
          this.setupPeerConn();
        });

        this.peer.on("error", () => {
          this.updateStatus("ready", `Local/Cross-Tab Active on Room: ${this.roomCode}`);
        });
      }
    } catch (e) {
      console.warn("PeerJS init error:", e);
    }
  }

  setupPeerConn() {
    if (!this.conn) return;

    this.conn.on("open", () => {
      this.isConnected = true;
      this.updateStatus("connected", `Connected with peer on room ${this.roomCode}!`);

      // Exchange names
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
      this.isConnected = false;
      this.updateStatus("disconnected", "Opponent disconnected.");
    });
  }

  updateStatus(state, message) {
    if (this.onStatusChange) {
      this.onStatusChange({ state, message, remoteName: this.remotePlayerName });
    }
  }

  /* ── 3. Central Message Dispatcher ── */
  handleMessage(msg) {
    if (!msg || typeof msg !== "object") return;
    if (msg.role === this.myRole) return; // Ignore own echoes

    switch (msg.type) {
      case "announce":
      case "handshake":
        this.remotePlayerName = msg.name || "Player 2";
        this.isConnected = true;
        this.updateStatus("connected", `Battling: ${this.remotePlayerName}`);
        if (this.onPeerJoined) this.onPeerJoined(msg);
        // Reply with own handshake if announced
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

    // Send via WebRTC if open
    if (this.conn && this.conn.open) {
      try { this.conn.send(data); } catch (e) {}
    }

    // Always broadcast across tabs/windows
    if (this.broadcast) {
      try { this.broadcast.postMessage(data); } catch (e) {}
    }
  }

  sendState({ x, y, z, heading, speed, roll, pitch, hp, boost }) {
    this.send({
      type: "state",
      x, y, z,
      heading, speed,
      roll, pitch,
      hp, boost,
    });
  }

  sendFire({ x, y, z, vx, vy, vz }) {
    this.send({
      type: "fire",
      x, y, z,
      vx, vy, vz,
    });
  }

  sendHit(damage) {
    this.send({
      type: "hit",
      damage,
    });
  }

  sendRematch() {
    this.send({
      type: "rematch",
    });
  }

  destroy() {
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
