import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import * as THREE from "three";
import { Water } from "three/addons/objects/Water.js";
import { Sky } from "three/addons/objects/Sky.js";
import { MultiplayerManager } from "./MultiplayerManager";
import { getPersistedCaptainName, persistCaptainName, generateRandomCaptainName } from "./CaptainIdentity";

/* ═══════════════════════════════════════════════════════
   PROCEDURAL NAVAL AUDIO ENGINE (Web Audio API)
   ═══════════════════════════════════════════════════════ */
class BoatSoundSystem {
  constructor() {
    this.ctx = null;
    this.initialized = false;
    this.muted = true;
    this.engineGain = null;
    this.osc1 = null;
    this.osc2 = null;
    this.waterGain = null;
    this.waterFilter = null;
  }

  init() {
    if (this.initialized) return;
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AudioContext();

      const master = this.ctx.createGain();
      master.gain.value = 0.45;
      master.connect(this.ctx.destination);
      this.master = master;

      const engineGain = this.ctx.createGain();
      engineGain.gain.value = 0.001;
      engineGain.connect(master);
      this.engineGain = engineGain;

      const osc1 = this.ctx.createOscillator();
      osc1.type = "sawtooth";
      osc1.frequency.value = 35;
      osc1.connect(engineGain);
      osc1.start();
      this.osc1 = osc1;

      const osc2 = this.ctx.createOscillator();
      osc2.type = "triangle";
      osc2.frequency.value = 70;
      osc2.connect(engineGain);
      osc2.start();
      this.osc2 = osc2;

      // Water Rush
      const bufferSize = this.ctx.sampleRate * 2;
      const noiseBuffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
      const output = noiseBuffer.getChannelData(0);
      let b0 = 0, b1 = 0, b2 = 0;
      for (let i = 0; i < bufferSize; i++) {
        const white = Math.random() * 2 - 1;
        b0 = 0.99886 * b0 + white * 0.0555179;
        b1 = 0.99332 * b1 + white * 0.0750759;
        b2 = 0.96900 * b2 + white * 0.1538520;
        output[i] = (b0 + b1 + b2) * 0.15;
      }
      const noiseSource = this.ctx.createBufferSource();
      noiseSource.buffer = noiseBuffer;
      noiseSource.loop = true;

      const waterFilter = this.ctx.createBiquadFilter();
      waterFilter.type = "lowpass";
      waterFilter.frequency.value = 400;

      const waterGain = this.ctx.createGain();
      waterGain.gain.value = 0.01;

      noiseSource.connect(waterFilter);
      waterFilter.connect(waterGain);
      waterGain.connect(master);
      noiseSource.start();

      this.waterGain = waterGain;
      this.waterFilter = waterFilter;
      this.initialized = true;
    } catch (e) {
      console.warn("AudioContext error", e);
    }
  }

  toggleMute() {
    if (!this.initialized) this.init();
    if (this.ctx && this.ctx.state === "suspended") this.ctx.resume();
    this.muted = !this.muted;
    return this.muted;
  }

  update(speedNorm, isBoosting) {
    if (!this.initialized || !this.ctx || this.muted) {
      if (this.engineGain) this.engineGain.gain.value = 0;
      if (this.waterGain) this.waterGain.gain.value = 0;
      return;
    }

    const t = this.ctx.currentTime;
    const baseFreq = 38 + speedNorm * 65 + (isBoosting ? 25 : 0);
    this.osc1.frequency.setTargetAtTime(baseFreq, t, 0.08);
    this.osc2.frequency.setTargetAtTime(baseFreq * 2.1, t, 0.08);

    const engVol = 0.08 + speedNorm * 0.22 + (isBoosting ? 0.1 : 0);
    this.engineGain.gain.setTargetAtTime(engVol, t, 0.05);

    const waterVol = speedNorm * 0.28 + (isBoosting ? 0.12 : 0);
    this.waterGain.gain.setTargetAtTime(waterVol, t, 0.06);
    this.waterFilter.frequency.setTargetAtTime(300 + speedNorm * 2200, t, 0.08);
  }

  playGunshot(isEnemy = false) {
    if (!this.initialized) this.init();
    if (!this.ctx || this.muted) return;
    try {
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = isEnemy ? "sawtooth" : "square";
      osc.frequency.setValueAtTime(isEnemy ? 220 : 280, now);
      osc.frequency.exponentialRampToValueAtTime(35, now + 0.08);

      gain.gain.setValueAtTime(isEnemy ? 0.2 : 0.25, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.085);

      osc.connect(gain);
      gain.connect(this.master);
      osc.start(now);
      osc.stop(now + 0.09);

      const noise = this.ctx.createBufferSource();
      const buf = this.ctx.createBuffer(1, this.ctx.sampleRate * 0.04, this.ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < data.length; i++) {
        data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (this.ctx.sampleRate * 0.012));
      }
      noise.buffer = buf;
      const noiseGain = this.ctx.createGain();
      noiseGain.gain.setValueAtTime(0.16, now);
      noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.045);
      noise.connect(noiseGain);
      noiseGain.connect(this.master);
      noise.start(now);
    } catch (e) {}
  }

  playHit() {
    if (!this.initialized) this.init();
    if (!this.ctx || this.muted) return;
    try {
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = "sawtooth";
      osc.frequency.setValueAtTime(600, now);
      osc.frequency.exponentialRampToValueAtTime(120, now + 0.12);
      gain.gain.setValueAtTime(0.25, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
      osc.connect(gain);
      gain.connect(this.master);
      osc.start(now);
      osc.stop(now + 0.13);
    } catch (e) {}
  }

  playExplosion() {
    if (!this.initialized) this.init();
    if (!this.ctx || this.muted) return;
    try {
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = "sawtooth";
      osc.frequency.setValueAtTime(110, now);
      osc.frequency.exponentialRampToValueAtTime(18, now + 1.4);
      gain.gain.setValueAtTime(0.45, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 1.4);
      osc.connect(gain);
      gain.connect(this.master);
      osc.start(now);
      osc.stop(now + 1.45);
    } catch (e) {}
  }

  playHorn() {
    if (!this.initialized) this.init();
    if (!this.ctx || this.muted) return;
    try {
      const now = this.ctx.currentTime;
      [140, 175].forEach((freq) => {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = "sawtooth";
        osc.frequency.setValueAtTime(freq, now);
        osc.frequency.exponentialRampToValueAtTime(freq * 0.95, now + 1.2);
        gain.gain.setValueAtTime(0, now);
        gain.gain.linearRampToValueAtTime(0.2, now + 0.1);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 1.2);
        osc.connect(gain);
        gain.connect(this.master);
        osc.start(now);
        osc.stop(now + 1.25);
      });
    } catch (e) {}
  }

  destroy() {
    if (this.ctx) {
      try { this.ctx.close(); } catch (e) {}
      this.ctx = null;
    }
  }
}

/* ═══════════════════════════════════════════════════════
   3D OVERHEAD NAMEPLATE SPRITE BUILDER
   ═══════════════════════════════════════════════════════ */
function createNameplateSprite(name, isRed = false) {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 64;
  const ctx = canvas.getContext("2d");

  function draw(hp = 100) {
    ctx.clearRect(0, 0, 256, 64);
    // Background pill
    ctx.fillStyle = "rgba(2, 20, 36, 0.85)";
    ctx.strokeStyle = isRed ? "rgba(255, 68, 68, 0.7)" : "rgba(0, 245, 212, 0.7)";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.roundRect(8, 6, 240, 52, 26);
    ctx.fill();
    ctx.stroke();

    // Name text
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 18px 'DM Sans', sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(name.toUpperCase(), 128, 28);

    // Mini HP track & fill
    ctx.fillStyle = "rgba(0, 0, 0, 0.6)";
    ctx.fillRect(36, 36, 184, 8);
    ctx.fillStyle = isRed ? "#ff3344" : "#00f5d4";
    ctx.fillRect(36, 36, Math.max(0, (hp / 100) * 184), 8);
  }
  draw(100);

  const texture = new THREE.CanvasTexture(canvas);
  const spriteMat = new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false });
  const sprite = new THREE.Sprite(spriteMat);
  sprite.scale.set(11, 2.75, 1);
  sprite.position.y = 5.8;
  sprite.name = "nameplate";
  sprite.userData = {
    updateNameAndHp: (newName, hp) => {
      name = newName;
      draw(hp);
      texture.needsUpdate = true;
    },
  };
  return sprite;
}

/* ═══════════════════════════════════════════════════════
   3D BOAT BUILDER (Identical Capability for All Players)
   ═══════════════════════════════════════════════════════ */
function createDetailedBoat(boatType = "player", displayName = "Captain") {
  const isRed = boatType === "enemy" || boatType === "p2";
  const boat = new THREE.Group();
  boat.name = isRed ? "boat2" : "boat1";

  const hullColor = isRed ? 0x181a20 : 0xfcfcfd;
  const accentColor = isRed ? 0xd90429 : 0x0fa3b1;
  const cabinColor = isRed ? 0x14161a : 0xf0f2f5;
  const roofColor = isRed ? 0xd90429 : 0x0d2847;
  const glowColor = isRed ? 0xff2233 : 0x00f5d4;

  const hullMat = new THREE.MeshStandardMaterial({ color: hullColor, metalness: 0.2, roughness: 0.3 });
  const accentMat = new THREE.MeshStandardMaterial({ color: accentColor, metalness: 0.45, roughness: 0.3 });
  const deckMat = new THREE.MeshStandardMaterial({ color: isRed ? 0x22242a : 0xc48b4f, roughness: 0.75 });
  const darkGlass = new THREE.MeshPhysicalMaterial({ color: 0x051b2c, transparent: true, opacity: 0.8, roughness: 0.05, metalness: 0.9 });
  const gunMetal = new THREE.MeshStandardMaterial({ color: 0x2b2d32, metalness: 0.85, roughness: 0.2 });
  const chromeMat = new THREE.MeshStandardMaterial({ color: 0xd8dde4, metalness: 0.95, roughness: 0.1 });
  const muzzleFlashMat = new THREE.MeshBasicMaterial({ color: isRed ? 0xff4422 : 0x00f5d4, transparent: true, opacity: 0 });

  // 1. Lower Hull
  const hullGeo = new THREE.BoxGeometry(3.6, 1.5, 11, 4, 3, 10);
  const hp = hullGeo.attributes.position;
  for (let i = 0; i < hp.count; i++) {
    let x = hp.getX(i), y = hp.getY(i), z = hp.getZ(i);
    if (y < 0) {
      const vTaper = (0.75 - y) / 1.5;
      x *= Math.max(0.12, 1.0 - vTaper * 0.45);
    }
    if (z > 1.2) {
      const bT = (z - 1.2) / 4.3;
      x *= Math.max(0.04, 1.0 - Math.pow(bT, 1.4) * 0.94);
      if (y > 0) y *= Math.max(0.7, 1.0 - bT * 0.28);
    }
    if (z < -4) {
      const sT = (-4 - z) / 1.5;
      x *= Math.max(0.85, 1.0 - sT * 0.1);
    }
    hp.setXYZ(i, x, y, z);
  }
  hullGeo.computeVertexNormals();
  const hullMesh = new THREE.Mesh(hullGeo, hullMat);
  boat.add(hullMesh);

  // 2. Stripe
  const stripeGeo = new THREE.BoxGeometry(3.66, 0.26, 11.04, 4, 1, 10);
  const stp = stripeGeo.attributes.position;
  for (let i = 0; i < stp.count; i++) {
    let x = stp.getX(i), z = stp.getZ(i);
    if (z > 1.2) {
      const bT = (z - 1.2) / 4.3;
      x *= Math.max(0.04, 1.0 - Math.pow(bT, 1.4) * 0.94);
    }
    stp.setXYZ(i, x, stp.getY(i), z);
  }
  stripeGeo.computeVertexNormals();
  const stripeMesh = new THREE.Mesh(stripeGeo, accentMat);
  stripeMesh.position.y = 0.15;
  boat.add(stripeMesh);

  // 3. Deck
  const deck = new THREE.Mesh(new THREE.BoxGeometry(3.1, 0.1, 8.5), deckMat);
  deck.position.set(0, 0.76, -0.6);
  boat.add(deck);

  // 4. Cabin & Windshield
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(2.6, 1.7, 3.4), new THREE.MeshStandardMaterial({ color: cabinColor }));
  cabin.position.set(0, 1.62, -0.7);
  boat.add(cabin);

  const roof = new THREE.Mesh(new THREE.BoxGeometry(2.8, 0.14, 3.6), new THREE.MeshStandardMaterial({ color: roofColor }));
  roof.position.set(0, 2.5, -0.7);
  boat.add(roof);

  const windshield = new THREE.Mesh(new THREE.BoxGeometry(2.45, 1.15, 0.08), darkGlass);
  windshield.position.set(0, 1.75, 1.02);
  windshield.rotation.x = 0.32;
  boat.add(windshield);

  // 5. Radar Arch & Flag
  const leftPillar = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 2.2, 8), chromeMat);
  leftPillar.position.set(-1.35, 1.9, -1.8);
  leftPillar.rotation.z = -0.12;
  boat.add(leftPillar);

  const rightPillar = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 2.2, 8), chromeMat);
  rightPillar.position.set(1.35, 1.9, -1.8);
  rightPillar.rotation.z = 0.12;
  boat.add(rightPillar);

  const archTop = new THREE.Mesh(new THREE.BoxGeometry(2.7, 0.12, 0.28), chromeMat);
  archTop.position.set(0, 2.95, -1.8);
  boat.add(archTop);

  const flag = new THREE.Mesh(
    new THREE.PlaneGeometry(0.8, 0.48),
    new THREE.MeshStandardMaterial({ color: accentColor, side: THREE.DoubleSide })
  );
  flag.position.set(1.5, 4.4, -1.8);
  flag.name = "wavingFlag";
  boat.add(flag);

  // 6. MOUNTED FOREDECK TWIN MACHINE GUN TURRETS
  [-0.85, 0.85].forEach((gx, idx) => {
    const gunGroup = new THREE.Group();
    gunGroup.name = idx === 0 ? "gunTurretL" : "gunTurretR";
    gunGroup.position.set(gx, 0.95, 2.2);

    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.36, 0.25, 12), gunMetal);
    gunGroup.add(base);

    const receiver = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.3, 0.9), gunMetal);
    receiver.position.set(0, 0.22, 0.2);
    gunGroup.add(receiver);

    [-0.1, 0.1].forEach((bx) => {
      const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.045, 1.3, 8), chromeMat);
      barrel.rotation.x = Math.PI / 2;
      barrel.position.set(bx, 0.22, 0.9);
      gunGroup.add(barrel);
    });

    const flashMesh = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.7, 8), muzzleFlashMat);
    flashMesh.rotation.x = Math.PI / 2;
    flashMesh.position.set(0, 0.22, 1.7);
    flashMesh.name = "muzzleFlash";
    gunGroup.add(flashMesh);

    boat.add(gunGroup);
  });

  // 7. Twin Outboard Motors
  [-0.9, 0.9].forEach((mx) => {
    const motorGroup = new THREE.Group();
    const cowling = new THREE.Mesh(new THREE.BoxGeometry(0.55, 1.1, 0.85), new THREE.MeshStandardMaterial({ color: roofColor }));
    cowling.position.set(0, 0.35, -0.3);
    motorGroup.add(cowling);

    const propGroup = new THREE.Group();
    propGroup.name = "propeller";
    for (let b = 0; b < 3; b++) {
      const blade = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.38, 0.03), chromeMat);
      blade.rotation.z = (b * Math.PI * 2) / 3;
      blade.position.y = 0.16;
      propGroup.add(blade);
    }
    propGroup.position.set(0, -0.85, -0.75);
    motorGroup.add(propGroup);

    motorGroup.position.set(mx, 0.35, -5.2);
    boat.add(motorGroup);
  });

  // 8. Underwater LED Glow
  const underGlow = new THREE.Mesh(
    new THREE.BoxGeometry(3.0, 0.06, 0.08),
    new THREE.MeshBasicMaterial({ color: glowColor })
  );
  underGlow.position.set(0, 0.05, -5.7);
  boat.add(underGlow);

  // 9. Floating 3D Overhead Nameplate
  const nameplate = createNameplateSprite(displayName, isRed);
  boat.add(nameplate);

  return boat;
}

/* ═══════════════════════════════════════════════════════
   MAIN MULTIPLAYER BOAT GAME COMPONENT
   ═══════════════════════════════════════════════════════ */
export default function BoatGame() {
  const mountRef = useRef(null);
  const speedRef = useRef(null);
  const knotsRef = useRef(null);
  const compassRef = useRef(null);
  const bossHpRef = useRef(null);
  const bossDistRef = useRef(null);
  const playerHpRef = useRef(null);
  const playerHpValRef = useRef(null);
  const hitmarkerRef = useRef(null);
  const damageVignetteRef = useRef(null);
  const lockAlertRef = useRef(null);
  const navigate = useNavigate();

  // ── Player Identity & Game Mode State ──
  const [playerName, setPlayerName] = useState(() => getPersistedCaptainName());
  const [gameMode, setGameMode] = useState("online_2p"); // "online_2p" | "local_2p" | "vs_ai"
  const [opponentName, setOpponentName] = useState(() => (gameMode === "vs_ai" ? "Corsair AI" : "Waiting for Opponent..."));
  const [roomCode, setRoomCode] = useState(() => {
    try {
      const p = new URLSearchParams(window.location.search);
      return (p.get("room") || "SEA1").toUpperCase().trim();
    } catch (e) {
      return "SEA1";
    }
  });
  const [myRole, setMyRole] = useState("p1"); // "p1" | "p2"
  const [isHost, setIsHost] = useState(true);
  const [isLobbyOpen, setIsLobbyOpen] = useState(false);
  const [isJoinModalOpen, setIsJoinModalOpen] = useState(() => {
    try {
      return Boolean(new URLSearchParams(window.location.search).get("room"));
    } catch (e) {
      return false;
    }
  });
  const [peerNotification, setPeerNotification] = useState(null);
  const [netStatusText, setNetStatusText] = useState("Connecting in-memory room...");
  const [inviteCopied, setInviteCopied] = useState(false);

  // Live public tunnel URL reference (fallback if playing from localhost)
  const publicShareUrlRef = useRef("https://cork-floyd-anymore-remained.trycloudflare.com");

  useEffect(() => {
    fetch("/api/naval/config")
      .then((r) => r.json())
      .then((cfg) => {
        if (cfg && cfg.publicUrl) {
          publicShareUrlRef.current = cfg.publicUrl;
        }
      })
      .catch(() => {});
  }, []);

  // Match and Audio States
  const [isMuted, setIsMuted] = useState(true);
  const [cameraMode, setCameraMode] = useState("chase");
  const [timeOfDay, setTimeOfDay] = useState("sunset");
  const [matchResult, setMatchResult] = useState(null); // 'victory' | 'defeat' | null
  const [matchStats, setMatchStats] = useState({ shotsFired: 0, hitsLanded: 0, timeSec: 0 });

  // Refs for 60fps loop access
  const playerNameRef = useRef(playerName);
  playerNameRef.current = playerName;
  const opponentNameRef = useRef(opponentName);
  opponentNameRef.current = opponentName;
  const myRoleRef = useRef("p1");
  myRoleRef.current = myRole;
  const soundSysRef = useRef(null);
  const netManagerRef = useRef(null);
  const cameraModeRef = useRef("chase");
  cameraModeRef.current = cameraMode;
  const timeOfDayRef = useRef("sunset");
  timeOfDayRef.current = timeOfDay;
  const gameModeRef = useRef(gameMode);
  gameModeRef.current = gameMode;
  const matchResultRef = useRef(null);
  matchResultRef.current = matchResult;
  const isHostRef = useRef(isHost);
  isHostRef.current = isHost;

  // Remote Player networked state container
  const remoteP2Ref = useRef({
    x: 0, y: 0.45, z: 160,
    heading: Math.PI, speed: 0,
    roll: 0, pitch: 0,
    hp: 100, lastUpdate: 0,
  });

  // Remote queue for incoming fired bullets
  const remoteBulletsQueue = useRef([]);

  // Virtual Controls
  const inputRef = useRef({
    forward: false,
    backward: false,
    left: false,
    right: false,
    boost: false,
    fire: false,
  });

  // Handle name change from lobby
  const handleSaveCaptain = (e) => {
    if (e) e.preventDefault();
    persistCaptainName(playerName);
    playerNameRef.current = playerName;
    setIsLobbyOpen(false);
    if (window.__updatePlayerName) window.__updatePlayerName(playerName);
  };

  const handleEnterBattle = (e) => {
    if (e) e.preventDefault();
    persistCaptainName(playerName);
    playerNameRef.current = playerName;
    setIsJoinModalOpen(false);
    if (window.__updatePlayerName) window.__updatePlayerName(playerName);
    if (soundSysRef.current && !soundSysRef.current.initialized) {
      soundSysRef.current.init();
    }
  };

  const handleRandomizeName = () => {
    const fresh = generateRandomCaptainName();
    setPlayerName(fresh);
    persistCaptainName(fresh);
    playerNameRef.current = fresh;
    if (window.__updatePlayerName) window.__updatePlayerName(fresh);
  };

  const handleCopyInviteLink = () => {
    let baseOrigin = window.location.origin;
    if (baseOrigin.includes("localhost") && publicShareUrlRef.current) {
      baseOrigin = publicShareUrlRef.current;
    }
    const inviteUrl = `${baseOrigin}${window.location.pathname}?room=${roomCode}`;
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(inviteUrl).then(() => {
        setInviteCopied(true);
        setTimeout(() => setInviteCopied(false), 2400);
      }).catch(() => {
        prompt("Copy this public invite link to share with your friend:", inviteUrl);
      });
    } else {
      prompt("Copy this public invite link to share with your friend:", inviteUrl);
    }
  };

  const handleRestartMatch = () => {
    setMatchResult(null);
    setMatchStats({ shotsFired: 0, hitsLanded: 0, timeSec: 0 });
    if (netManagerRef.current) netManagerRef.current.sendRematch();
    if (window.__resetNavalBattle) window.__resetNavalBattle();
  };

  const handleToggleSound = () => {
    if (soundSysRef.current) {
      const muted = soundSysRef.current.toggleMute();
      setIsMuted(muted);
    }
  };

  const handleHorn = () => {
    if (soundSysRef.current) soundSysRef.current.playHorn();
  };

  const cycleCamera = () => {
    setCameraMode((prev) => (prev === "chase" ? "cockpit" : prev === "cockpit" ? "drone" : "chase"));
  };

  const cycleTimeOfDay = () => {
    setTimeOfDay((prev) => (prev === "sunset" ? "day" : prev === "day" ? "night" : "sunset"));
  };

  /* ═══════════════════════════════════════════════════
     THREE.JS & COMBAT SIMULATION EFFECT
     ═══════════════════════════════════════════════════ */
  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const audioSys = new BoatSoundSystem();
    soundSysRef.current = audioSys;

    /* ────── 1. RENDERER ────── */
    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(mount.clientWidth, mount.clientHeight);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 0.55;
    mount.appendChild(renderer.domElement);

    /* ────── 2. SCENE & CAMERA ────── */
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(58, mount.clientWidth / mount.clientHeight, 1, 25000);
    camera.position.set(0, 18, -38);

    /* ────── 3. SKY & SUN ────── */
    const sun = new THREE.Vector3();
    const pmremGenerator = new THREE.PMREMGenerator(renderer);
    pmremGenerator.compileEquirectangularShader();

    const sky = new Sky();
    sky.scale.setScalar(12000);
    scene.add(sky);

    function applyAtmosphere(mode) {
      const su = sky.material.uniforms;
      let phi, theta, exposure, fogColor, fogDensity;

      if (mode === "sunset") {
        phi = THREE.MathUtils.degToRad(87);
        theta = THREE.MathUtils.degToRad(195);
        su["turbidity"].value = 8;
        su["rayleigh"].value = 3.5;
        su["mieCoefficient"].value = 0.006;
        su["mieDirectionalG"].value = 0.85;
        exposure = 0.55;
        fogColor = 0x0a2642;
        fogDensity = 0.00015;
      } else if (mode === "day") {
        phi = THREE.MathUtils.degToRad(50);
        theta = THREE.MathUtils.degToRad(150);
        su["turbidity"].value = 3;
        su["rayleigh"].value = 1.2;
        su["mieCoefficient"].value = 0.003;
        su["mieDirectionalG"].value = 0.8;
        exposure = 0.75;
        fogColor = 0x1f5f8b;
        fogDensity = 0.00012;
      } else {
        phi = THREE.MathUtils.degToRad(98);
        theta = THREE.MathUtils.degToRad(200);
        su["turbidity"].value = 10;
        su["rayleigh"].value = 0.2;
        su["mieCoefficient"].value = 0.001;
        su["mieDirectionalG"].value = 0.9;
        exposure = 0.28;
        fogColor = 0x030a16;
        fogDensity = 0.00022;
      }

      sun.setFromSphericalCoords(1, phi, theta);
      su["sunPosition"].value.copy(sun);
      renderer.toneMappingExposure = exposure;
      scene.fog = new THREE.FogExp2(fogColor, fogDensity);

      const envRT = pmremGenerator.fromScene(sky);
      scene.environment = envRT.texture;
    }
    applyAtmosphere("sunset");

    /* ────── 4. 3D WATER ────── */
    const waterGeo = new THREE.PlaneGeometry(12000, 12000);
    const water = new Water(waterGeo, {
      textureWidth: 512,
      textureHeight: 512,
      waterNormals: new THREE.TextureLoader().load(
        "https://raw.githubusercontent.com/mrdoob/three.js/dev/examples/textures/waternormals.jpg",
        (tex) => { tex.wrapS = tex.wrapT = THREE.RepeatWrapping; }
      ),
      sunDirection: sun.clone().normalize(),
      sunColor: 0xfffae8,
      waterColor: 0x001d3d,
      distortionScale: 5.5,
      fog: true,
    });
    water.rotation.x = -Math.PI / 2;
    scene.add(water);

    /* ────── 5. LIGHTING ────── */
    const ambientLight = new THREE.AmbientLight(0x5588aa, 1.4);
    scene.add(ambientLight);
    const dirLight = new THREE.DirectionalLight(0xfffaea, 2.8);
    dirLight.position.copy(sun).multiplyScalar(200);
    scene.add(dirLight);

    /* ────── 6. TWO BOATS: BOAT 1 & BOAT 2 (IDENTICAL COMBAT CAPABILITY) ────── */
    const playerBoat = createDetailedBoat("player", playerName);
    playerBoat.position.set(0, 0.45, 0);
    scene.add(playerBoat);

    const opponentBoat = createDetailedBoat("enemy", opponentName);
    opponentBoat.position.set(20, 0.45, 160);
    opponentBoat.rotation.y = Math.PI;
    scene.add(opponentBoat);

    // Update player nameplate hook
    window.__updatePlayerName = (name) => {
      const np = playerBoat.getObjectByName("nameplate");
      if (np && np.userData.updateNameAndHp) np.userData.updateNameAndHp(name, 100);
    };

    /* ────── 7. WAKE TRAILS FOR BOTH BOATS ────── */
    function createWakeSystem() {
      const TRAIL_MAX = 180;
      const history = [];
      const vertCount = TRAIL_MAX * 2;
      const pos = new Float32Array(vertCount * 3);
      const alpha = new Float32Array(vertCount);
      const uvs = new Float32Array(vertCount * 2);

      const geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
      geo.setAttribute("alpha", new THREE.BufferAttribute(alpha, 1));
      geo.setAttribute("uv", new THREE.BufferAttribute(uvs, 2));

      const indices = [];
      for (let i = 0; i < TRAIL_MAX - 1; i++) {
        const a = i * 2, b = i * 2 + 1, c = (i + 1) * 2, d = (i + 1) * 2 + 1;
        indices.push(a, c, b, b, c, d);
      }
      geo.setIndex(indices);

      const mat = new THREE.ShaderMaterial({
        vertexShader: `
          attribute float alpha;
          varying float vAlpha;
          varying vec2 vUv;
          void main() {
            vAlpha = alpha;
            vUv = uv;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }
        `,
        fragmentShader: `
          varying float vAlpha;
          varying vec2 vUv;
          void main() {
            float edge = 1.0 - abs(vUv.x - 0.5) * 2.0;
            float foam = pow(edge, 1.3) * vAlpha;
            gl_FragColor = vec4(0.92, 1.0, 0.98, foam * 0.65);
          }
        `,
        transparent: true,
        side: THREE.DoubleSide,
        depthWrite: false,
      });

      const mesh = new THREE.Mesh(geo, mat);
      mesh.frustumCulled = false;
      scene.add(mesh);

      return {
        update: (bx, bz, heading, spd) => {
          if (Math.abs(spd) > 0.4) {
            const sinH = Math.sin(heading);
            const cosH = Math.cos(heading);
            history.unshift({
              x: bx - sinH * 5.2,
              z: bz - cosH * 5.2,
              px: cosH,
              pz: -sinH,
              speed: Math.abs(spd),
            });
            if (history.length > TRAIL_MAX) history.pop();
          }

          const pa = geo.attributes.position;
          const aa = geo.attributes.alpha;
          const ua = geo.attributes.uv;

          for (let i = 0; i < TRAIL_MAX; i++) {
            if (i < history.length) {
              const pt = history[i];
              const t = i / TRAIL_MAX;
              const wakeWidth = 1.8 + Math.pow(t, 0.75) * 11.0;
              const fade = Math.pow(1.0 - t, 1.8) * Math.min(1.0, pt.speed / 10);

              pa.setXYZ(i * 2, pt.x - pt.px * wakeWidth, 0.22, pt.z - pt.pz * wakeWidth);
              aa.setX(i * 2, fade);
              ua.setXY(i * 2, 0.0, t);

              pa.setXYZ(i * 2 + 1, pt.x + pt.px * wakeWidth, 0.22, pt.z + pt.pz * wakeWidth);
              aa.setX(i * 2 + 1, fade);
              ua.setXY(i * 2 + 1, 1.0, t);
            } else {
              aa.setX(i * 2, 0);
              aa.setX(i * 2 + 1, 0);
            }
          }
          pa.needsUpdate = true;
          aa.needsUpdate = true;
          ua.needsUpdate = true;
        },
        destroy: () => {
          geo.dispose();
          mat.dispose();
        },
      };
    }

    const playerWake = createWakeSystem();
    const opponentWake = createWakeSystem();

    /* ────── 8. FOAM PARTICLES & SPRAY ────── */
    const FOAM_MAX = 500;
    const foamList = [];
    const foamPos = new Float32Array(FOAM_MAX * 3);
    const foamSize = new Float32Array(FOAM_MAX);
    const foamAlpha = new Float32Array(FOAM_MAX);

    const foamGeo = new THREE.BufferGeometry();
    foamGeo.setAttribute("position", new THREE.BufferAttribute(foamPos, 3));
    foamGeo.setAttribute("size", new THREE.BufferAttribute(foamSize, 1));
    foamGeo.setAttribute("alpha", new THREE.BufferAttribute(foamAlpha, 1));

    const foamMat = new THREE.ShaderMaterial({
      vertexShader: `
        attribute float size;
        attribute float alpha;
        varying float vAlpha;
        void main() {
          vAlpha = alpha;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = size * (260.0 / -mv.z);
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: `
        varying float vAlpha;
        void main() {
          float dist = length(gl_PointCoord - 0.5);
          if (dist > 0.5) discard;
          float a = smoothstep(0.5, 0.15, dist) * vAlpha;
          gl_FragColor = vec4(0.96, 1.0, 0.98, a);
        }
      `,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const foamMesh = new THREE.Points(foamGeo, foamMat);
    foamMesh.frustumCulled = false;
    scene.add(foamMesh);

    function spawnFoamSplash(x, y, z, count = 10, speedScale = 1) {
      for (let i = 0; i < count; i++) {
        if (foamList.length >= FOAM_MAX) break;
        foamList.push({
          x, y, z,
          vx: (Math.random() - 0.5) * 8 * speedScale,
          vy: Math.random() * 5 * speedScale,
          vz: (Math.random() - 0.5) * 8 * speedScale,
          size: 2.0 + Math.random() * 3.5,
          life: 1.0,
          decay: 0.8 + Math.random() * 0.8,
        });
      }
    }

    function spawnSparks(x, y, z, count = 14) {
      for (let i = 0; i < count; i++) {
        if (foamList.length >= FOAM_MAX) break;
        foamList.push({
          x, y, z,
          vx: (Math.random() - 0.5) * 14,
          vy: 2 + Math.random() * 8,
          vz: (Math.random() - 0.5) * 14,
          size: 3.0 + Math.random() * 4.0,
          life: 1.0,
          decay: 1.8 + Math.random() * 1.5,
        });
      }
    }

    /* ═══════════════════════════════════════════════════
       9. MACHINE GUN & BALLISTICS
       ═══════════════════════════════════════════════════ */
    const MAX_BULLETS = 120;
    const bullets = [];

    const tracerGeo = new THREE.CylinderGeometry(0.08, 0.08, 2.2, 6);
    tracerGeo.rotateX(Math.PI / 2);

    const p1BulletMat = new THREE.MeshBasicMaterial({ color: 0x00f5d4 });
    const p2BulletMat = new THREE.MeshBasicMaterial({ color: 0xff3322 });

    const p1BulletsMesh = new THREE.InstancedMesh(tracerGeo, p1BulletMat, MAX_BULLETS);
    const p2BulletsMesh = new THREE.InstancedMesh(tracerGeo, p2BulletMat, MAX_BULLETS);
    p1BulletsMesh.frustumCulled = false;
    p2BulletsMesh.frustumCulled = false;
    scene.add(p1BulletsMesh);
    scene.add(p2BulletsMesh);

    const dummyMatrix = new THREE.Matrix4();
    const hideMatrix = new THREE.Matrix4().makeScale(0, 0, 0);

    function fireMachineGun(boatObj, isRed, targetPoint = null) {
      if (matchResultRef.current) return;

      const fwd = new THREE.Vector3(0, 0, 1).applyEuler(boatObj.rotation);
      const right = new THREE.Vector3(1, 0, 0).applyEuler(boatObj.rotation);
      const bSpeed = 265;

      [-0.85, 0.85].forEach((offset) => {
        if (bullets.length >= MAX_BULLETS) return;

        const barrelOrigin = boatObj.position.clone()
          .add(right.clone().multiplyScalar(offset))
          .add(fwd.clone().multiplyScalar(3.2))
          .add(new THREE.Vector3(0, 1.1, 0));

        let dir;
        if (targetPoint && isRed && gameModeRef.current === "vs_ai") {
          dir = targetPoint.clone().sub(barrelOrigin).normalize();
          dir.x += (Math.random() - 0.5) * 0.012;
          dir.y += (Math.random() - 0.5) * 0.008;
          dir.z += (Math.random() - 0.5) * 0.012;
          dir.normalize();
        } else {
          const spreadX = (Math.random() - 0.5) * 0.02;
          const spreadY = (Math.random() - 0.5) * 0.012;
          const spreadZ = (Math.random() - 0.5) * 0.02;
          dir = fwd.clone().add(new THREE.Vector3(spreadX, spreadY, spreadZ)).normalize();
        }

        const localOwner = myRoleRef.current;
        const bOwner = isRed ? (localOwner === "p1" ? "p2" : "p1") : localOwner;

        const bData = {
          x: barrelOrigin.x,
          y: barrelOrigin.y,
          z: barrelOrigin.z,
          vx: dir.x * bSpeed,
          vy: dir.y * bSpeed,
          vz: dir.z * bSpeed,
          life: 1.6,
          owner: bOwner,
        };
        bullets.push(bData);

        // Broadcast fired bullet to online opponent whenever local player fires
        if (netManagerRef.current && gameModeRef.current === "online_2p" && !isRed) {
          netManagerRef.current.sendFire(bData);
        }
      });

      boatObj.traverse((child) => {
        if (child.name === "muzzleFlash") child.material.opacity = 1.0;
      });

      if (soundSysRef.current) soundSysRef.current.playGunshot(isRed);
    }

    /* ═══════════════════════════════════════════════════
       10. MULTIPLAYER NETWORKING INITIALIZATION
       ═══════════════════════════════════════════════════ */
    const netManager = new MultiplayerManager({
      playerName: playerNameRef.current,
      roomCode,
      isHost,
      onRoleAssigned: ({ role, isHost: assignedHost }) => {
        setMyRole(role);
        setIsHost(assignedHost);
        myRoleRef.current = role;
        isHostRef.current = assignedHost;
        if (window.__handleRoleAssigned) window.__handleRoleAssigned(role);
      },
      onPeerJoined: (peerInfo) => {
        const opp = peerInfo.name || "Player 2";
        setOpponentName(opp);
        opponentNameRef.current = opp;
        setPeerNotification(`⚓ ${opp.toUpperCase()} ENTERED THE ARENA!`);
        setTimeout(() => setPeerNotification(null), 4200);
        const np = opponentBoat.getObjectByName("nameplate");
        if (np && np.userData.updateNameAndHp) np.userData.updateNameAndHp(opp, 100);
      },
      onRemoteState: (state) => {
        remoteP2Ref.current = {
          x: state.x, y: state.y, z: state.z,
          heading: state.heading, speed: state.speed,
          roll: state.roll, pitch: state.pitch,
          hp: state.hp, lastUpdate: Date.now(),
        };
      },
      onRemoteFire: (bData) => {
        if (bullets.length < MAX_BULLETS) {
          const oppRole = myRoleRef.current === "p1" ? "p2" : "p1";
          bullets.push({ ...bData, life: 1.6, owner: oppRole });
          opponentBoat.traverse((child) => {
            if (child.name === "muzzleFlash") child.material.opacity = 1.0;
          });
          if (soundSysRef.current) soundSysRef.current.playGunshot(true);
        }
      },
      onRemoteHit: (hitData) => {
        const dmg = (hitData && hitData.damage) || 3.5;
        if (window.__applyDamageToPlayer) {
          window.__applyDamageToPlayer(dmg);
        }
      },
      onRematch: () => {
        if (window.__resetNavalBattle) window.__resetNavalBattle();
      },
      onStatusChange: ({ state, message, remoteName, role }) => {
        setNetStatusText(message);
        if (role) {
          setMyRole(role);
          myRoleRef.current = role;
        }
        if (remoteName && remoteName !== "Waiting for Player 2...") {
          setOpponentName(remoteName);
          opponentNameRef.current = remoteName;
        }
      },
    });
    netManagerRef.current = netManager;

    /* ═══════════════════════════════════════════════════
       11. INPUT & EVENT LISTENERS
       ═══════════════════════════════════════════════════ */
    const keys = {};
    let mouseFiring = false;

    const onKeyDown = (e) => {
      if (soundSysRef.current && !soundSysRef.current.initialized) audioSys.init();
      keys[e.code] = true;
      if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space"].includes(e.code)) e.preventDefault();
      if (e.code === "KeyC") cycleCamera();
      if (e.code === "KeyT") cycleTimeOfDay();
      if (e.code === "KeyH") handleHorn();
      if (e.code === "KeyM") handleToggleSound();
      if (e.code === "KeyF" || e.code === "KeyE" || e.code === "KeyJ") inputRef.current.fire = true;
    };
    const onKeyUp = (e) => {
      keys[e.code] = false;
      if (e.code === "KeyF" || e.code === "KeyE" || e.code === "KeyJ") inputRef.current.fire = false;
    };
    const onMouseDown = (e) => {
      if (e.button === 0 && e.target.tagName !== "BUTTON" && e.target.tagName !== "A" && e.target.tagName !== "INPUT") {
        mouseFiring = true;
      }
    };
    const onMouseUp = () => { mouseFiring = false; };

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("mousedown", onMouseDown);
    window.addEventListener("mouseup", onMouseUp);

    /* ═══════════════════════════════════════════════════
       12. GAME SIMULATION VARIABLES & LOOP
       ═══════════════════════════════════════════════════ */
    let playerSpeed = 0, playerHeading = 0;
    let playerX = 0, playerZ = 0;
    let playerPitch = 0, playerRoll = 0;
    let playerHealth = 100;
    let boostFuel = 100;
    let playerFireCooldown = 0;
    let playerShotsFired = 0, playerHitsLanded = 0;
    let playerHitCooldown = 0, timeSincePlayerHit = 0;
    let lastRamTime = 0;

    // Opponent Boat variables
    let p2Speed = 0, p2Heading = Math.PI;
    let p2X = 0, p2Z = 160;
    let p2Pitch = 0, p2Roll = 0;
    let p2Health = 100;
    let p2BoostFuel = 100;
    let p2FireCooldown = 0;
    let p2BurstCount = 0, p2BurstPause = 0;

    let matchClock = 0;
    let netSyncTimer = 0;

    window.__applyDamageToPlayer = (dmg) => {
      if (playerHealth <= 0 || matchResultRef.current) return;
      playerHealth = Math.max(0, playerHealth - dmg);
      timeSincePlayerHit = 0;
      spawnSparks(playerX, 2, playerZ, 12);
      if (soundSysRef.current) soundSysRef.current.playHit();
      if (damageVignetteRef.current && playerHitCooldown <= 0) {
        playerHitCooldown = 0.2;
        damageVignetteRef.current.classList.add("active");
        setTimeout(() => { if (damageVignetteRef.current) damageVignetteRef.current.classList.remove("active"); }, 120);
      }
      if (playerHealth <= 0 && !matchResultRef.current) {
        matchResultRef.current = "defeat";
        setMatchResult("defeat");
        setMatchStats({ shotsFired: playerShotsFired, hitsLanded: playerHitsLanded, timeSec: Math.round(matchClock) });
        if (soundSysRef.current) soundSysRef.current.playExplosion();
        spawnSparks(playerX, 2, playerZ, 60);
      }
    };

    let hasRepositionedForRole = false;
    window.__handleRoleAssigned = (assignedRole) => {
      if (assignedRole === "p2" && !hasRepositionedForRole) {
        hasRepositionedForRole = true;
        playerX = 0; playerZ = 160; playerHeading = Math.PI;
        playerBoat.position.set(0, 0.45, 160);
        playerBoat.rotation.set(0, Math.PI, 0);

        p2X = 0; p2Z = 0; p2Heading = 0;
        opponentBoat.position.set(0, 0.45, 0);
        opponentBoat.rotation.set(0, 0, 0);
      }
    };

    window.__updatePlayerName = (name) => {
      if (netManagerRef.current) {
        netManagerRef.current.updatePlayerName(name);
      }
      const np1 = playerBoat.getObjectByName("nameplate");
      if (np1 && np1.userData.updateNameAndHp) {
        np1.userData.updateNameAndHp(name, playerHealth);
      }
    };

    window.__resetNavalBattle = () => {
      playerSpeed = 0;
      playerPitch = 0; playerRoll = 0;
      playerHealth = 100;
      playerShotsFired = 0; playerHitsLanded = 0;
      playerHitCooldown = 0; timeSincePlayerHit = 0;
      lastRamTime = 0;

      p2Speed = 0;
      p2Pitch = 0; p2Roll = 0;
      p2Health = 100;
      p2BurstCount = 0; p2BurstPause = 0;

      matchClock = 0;
      bullets.length = 0;

      if (myRoleRef.current === "p2") {
        playerX = 0; playerZ = 160; playerHeading = Math.PI;
        p2X = 0; p2Z = 0; p2Heading = 0;
      } else {
        playerX = 0; playerZ = 0; playerHeading = 0;
        p2X = 0; p2Z = 160; p2Heading = Math.PI;
      }

      playerBoat.position.set(playerX, 0.45, playerZ);
      playerBoat.rotation.set(0, playerHeading, 0);
      opponentBoat.position.set(p2X, 0.45, p2Z);
      opponentBoat.rotation.set(0, p2Heading, 0);

      const np1 = playerBoat.getObjectByName("nameplate");
      if (np1 && np1.userData.updateNameAndHp) np1.userData.updateNameAndHp(playerNameRef.current, 100);
      const np2 = opponentBoat.getObjectByName("nameplate");
      if (np2 && np2.userData.updateNameAndHp) np2.userData.updateNameAndHp(opponentNameRef.current, 100);
    };

    const TOP_CRUISE_SPEED = 42;
    const TOP_BOOST_SPEED = 62;
    const ACCEL = 26;
    const DRAG = 0.55;
    const TURN_RATE = 1.75;

    const clock = new THREE.Clock();
    let frameId;
    let lastAtmosphere = "sunset";

    function animate() {
      frameId = requestAnimationFrame(animate);
      const dt = Math.min(clock.getDelta(), 0.05);
      const time = clock.elapsedTime;
      if (!matchResultRef.current) matchClock += dt;
      timeSincePlayerHit += dt;
      playerHitCooldown -= dt;

      // Auto-repair for player
      if (timeSincePlayerHit > 3.0 && playerHealth > 0 && playerHealth < 100) {
        playerHealth = Math.min(100, playerHealth + 3.5 * dt);
      }

      if (timeOfDayRef.current !== lastAtmosphere) {
        lastAtmosphere = timeOfDayRef.current;
        applyAtmosphere(lastAtmosphere);
      }

      // ── LOCAL PLAYER 1 CONTROLS ──
      const input = inputRef.current;
      let thrust = 0, steer = 0, isBoosting = false;

      if (!matchResultRef.current && playerHealth > 0) {
        if (keys["KeyW"] || (gameModeRef.current !== "local_2p" && keys["ArrowUp"]) || input.forward) thrust += 1;
        if (keys["KeyS"] || (gameModeRef.current !== "local_2p" && keys["ArrowDown"]) || input.backward) thrust -= 1;
        if (keys["KeyA"] || (gameModeRef.current !== "local_2p" && keys["ArrowLeft"]) || input.left) steer += 1;
        if (keys["KeyD"] || (gameModeRef.current !== "local_2p" && keys["ArrowRight"]) || input.right) steer -= 1;

        if ((keys["Space"] || input.boost) && boostFuel > 5 && thrust > 0) {
          isBoosting = true;
          boostFuel = Math.max(0, boostFuel - 35 * dt);
        } else {
          boostFuel = Math.min(100, boostFuel + 18 * dt);
        }

        playerFireCooldown -= dt;
        if ((mouseFiring || input.fire) && playerFireCooldown <= 0) {
          playerFireCooldown = 0.11;
          fireMachineGun(playerBoat, false);
          playerShotsFired += 2;
        }
      }

      // Player 1 Physics
      const maxSpd = isBoosting ? TOP_BOOST_SPEED : TOP_CRUISE_SPEED;
      const curAccel = isBoosting ? ACCEL * 1.8 : ACCEL;
      if (thrust > 0) playerSpeed += curAccel * dt;
      else if (thrust < 0) playerSpeed -= 14 * dt;
      playerSpeed *= 1.0 - DRAG * dt;
      playerSpeed = THREE.MathUtils.clamp(playerSpeed, -12, maxSpd);

      const pSpeedNorm = Math.abs(playerSpeed) / TOP_CRUISE_SPEED;
      const rudderEffect = Math.max(0.2, Math.min(1.2, pSpeedNorm));
      playerHeading += steer * TURN_RATE * rudderEffect * dt * (playerSpeed >= 0 ? 1 : -0.6);

      const pFwdX = Math.sin(playerHeading);
      const pFwdZ = Math.cos(playerHeading);
      playerX += pFwdX * playerSpeed * dt;
      playerZ += pFwdZ * playerSpeed * dt;

      const targetPPitch = thrust * pSpeedNorm * 0.08 + Math.sin(time * 2.2) * 0.02;
      playerPitch += (targetPPitch - playerPitch) * 5 * dt;
      const targetPRoll = steer * pSpeedNorm * 0.28 + Math.cos(time * 1.8) * 0.025;
      playerRoll += (targetPRoll - playerRoll) * 6 * dt;

      const pBob = Math.sin(time * 2.0 + playerX * 0.015) * 0.35;
      playerBoat.position.set(playerX, 0.45 + pBob, playerZ);
      playerBoat.rotation.set(playerPitch, playerHeading, playerRoll);

      // ── OPPONENT (BOAT 2) SIMULATION BASED ON MODE ──
      const mode = gameModeRef.current;
      const distToOpponent = Math.hypot(playerX - p2X, playerZ - p2Z);

      if (mode === "online_2p") {
        // Online P2P Synchronization from Remote Player
        const rem = remoteP2Ref.current;
        p2X += (rem.x - p2X) * Math.min(1.0, 15 * dt);
        p2Z += (rem.z - p2Z) * Math.min(1.0, 15 * dt);
        p2Heading += (rem.heading - p2Heading) * Math.min(1.0, 15 * dt);
        p2Speed = rem.speed;
        p2Pitch = rem.pitch;
        p2Roll = rem.roll;
        p2Health = rem.hp;

        const remBob = Math.cos(time * 2.1 + p2X * 0.015) * 0.35;
        opponentBoat.position.set(p2X, 0.45 + remBob, p2Z);
        opponentBoat.rotation.set(p2Pitch, p2Heading, p2Roll);

        // Network State Broadcast (30 times/sec)
        netSyncTimer += dt;
        if (netSyncTimer > 0.033 && netManagerRef.current) {
          netSyncTimer = 0;
          netManagerRef.current.sendState({
            x: playerX, y: 0.45 + pBob, z: playerZ,
            heading: playerHeading, speed: playerSpeed,
            roll: playerRoll, pitch: playerPitch,
            hp: playerHealth, boost: isBoosting,
          });
        }
      } else if (mode === "local_2p") {
        // Same-Keyboard 2-Player Duel
        let p2Thrust = 0, p2Steer = 0, isP2Boosting = false;
        if (keys["ArrowUp"]) p2Thrust += 1;
        if (keys["ArrowDown"]) p2Thrust -= 1;
        if (keys["ArrowLeft"]) p2Steer += 1;
        if (keys["ArrowRight"]) p2Steer -= 1;

        if ((keys["ShiftRight"] || keys["Numpad0"]) && p2BoostFuel > 5 && p2Thrust > 0) {
          isP2Boosting = true;
          p2BoostFuel = Math.max(0, p2BoostFuel - 35 * dt);
        } else {
          p2BoostFuel = Math.min(100, p2BoostFuel + 18 * dt);
        }

        p2FireCooldown -= dt;
        if ((keys["Enter"] || keys["KeyL"] || keys["Numpad1"]) && p2FireCooldown <= 0) {
          p2FireCooldown = 0.11;
          fireMachineGun(opponentBoat, true);
        }

        const p2MaxSpd = isP2Boosting ? TOP_BOOST_SPEED : TOP_CRUISE_SPEED;
        if (p2Thrust > 0) p2Speed += (isP2Boosting ? ACCEL * 1.8 : ACCEL) * dt;
        else if (p2Thrust < 0) p2Speed -= 14 * dt;
        p2Speed *= 1.0 - DRAG * dt;
        p2Speed = THREE.MathUtils.clamp(p2Speed, -12, p2MaxSpd);

        const p2SpeedNorm = Math.abs(p2Speed) / TOP_CRUISE_SPEED;
        p2Heading += p2Steer * TURN_RATE * Math.max(0.2, p2SpeedNorm) * dt * (p2Speed >= 0 ? 1 : -0.6);

        p2X += Math.sin(p2Heading) * p2Speed * dt;
        p2Z += Math.cos(p2Heading) * p2Speed * dt;

        p2Pitch += (p2Thrust * p2SpeedNorm * 0.08 - p2Pitch) * 5 * dt;
        p2Roll += (p2Steer * p2SpeedNorm * 0.28 - p2Roll) * 6 * dt;

        const p2Bob = Math.cos(time * 2.1 + p2X * 0.015) * 0.35;
        opponentBoat.position.set(p2X, 0.45 + p2Bob, p2Z);
        opponentBoat.rotation.set(p2Pitch, p2Heading, p2Roll);
      } else {
        // Single Player vs Intelligent AI Opponent
        const pVx = pFwdX * playerSpeed, pVz = pFwdZ * playerSpeed;
        const timeToTarget = distToOpponent / 270;
        const predPlayerX = playerX + pVx * timeToTarget;
        const predPlayerZ = playerZ + pVz * timeToTarget;
        const aimTarget = new THREE.Vector3(predPlayerX, 1.15, predPlayerZ);

        const leadAngle = Math.atan2(predPlayerX - p2X, predPlayerZ - p2Z);
        let angleDiffLead = leadAngle - p2Heading;
        while (angleDiffLead > Math.PI) angleDiffLead -= Math.PI * 2;
        while (angleDiffLead < -Math.PI) angleDiffLead += Math.PI * 2;

        const directAngle = Math.atan2(playerX - p2X, playerZ - p2Z);
        let angleDiffDirect = directAngle - p2Heading;
        while (angleDiffDirect > Math.PI) angleDiffDirect -= Math.PI * 2;
        while (angleDiffDirect < -Math.PI) angleDiffDirect += Math.PI * 2;

        const playerToAi = Math.atan2(p2X - playerX, p2Z - playerZ);
        let gunThreat = playerToAi - playerHeading;
        while (gunThreat > Math.PI) gunThreat -= Math.PI * 2;
        while (gunThreat < -Math.PI) gunThreat += Math.PI * 2;
        const isPlayerAiming = Math.abs(gunThreat) < 0.26 && distToOpponent < 170;

        // Swivel AI turrets
        opponentBoat.traverse((child) => {
          if (child.name === "gunTurretL" || child.name === "gunTurretR") {
            child.rotation.y = THREE.MathUtils.clamp(-angleDiffLead, -0.65, 0.65);
          }
        });

        let aiThrust = 1.0, aiSteer = 0, isAiBoosting = false;
        if (p2Health > 0 && !matchResultRef.current) {
          if (isPlayerAiming && distToOpponent > 30) {
            aiSteer = angleDiffDirect > 0 ? 1.0 : -1.0;
            aiThrust = 1.0;
            isAiBoosting = true;
          } else if (distToOpponent > 130) {
            const navAngle = Math.atan2((playerX + pVx * 1.5) - p2X, (playerZ + pVz * 1.5) - p2Z);
            let navDiff = navAngle - p2Heading;
            while (navDiff > Math.PI) navDiff -= Math.PI * 2;
            while (navDiff < -Math.PI) navDiff += Math.PI * 2;
            aiSteer = THREE.MathUtils.clamp(navDiff * 2.6, -1, 1);
            if (distToOpponent > 190) isAiBoosting = true;
          } else if (distToOpponent > 42) {
            const sternX = playerX - pFwdX * 38;
            const sternZ = playerZ - pFwdZ * 38;
            const sternAngle = Math.atan2(sternX - p2X, sternZ - p2Z);
            let sDiff = sternAngle - p2Heading;
            while (sDiff > Math.PI) sDiff -= Math.PI * 2;
            while (sDiff < -Math.PI) sDiff += Math.PI * 2;
            aiSteer = THREE.MathUtils.clamp(sDiff * 2.4, -1, 1);
            aiThrust = Math.abs(playerSpeed) > 18 ? 1.0 : 0.82;
          } else {
            aiSteer = angleDiffDirect > 0 ? -1.0 : 1.0;
            aiThrust = 0.88;
          }

          const hasLock = Math.abs(angleDiffLead) < 0.52 && distToOpponent < 230;
          if (lockAlertRef.current) lockAlertRef.current.style.display = hasLock ? "flex" : "none";

          p2FireCooldown -= dt;
          p2BurstPause -= dt;
          if (hasLock && p2BurstPause <= 0 && p2FireCooldown <= 0) {
            p2FireCooldown = 0.095;
            fireMachineGun(opponentBoat, true, aimTarget);
            p2BurstCount++;
            if (p2BurstCount >= 7) {
              p2BurstCount = 0;
              p2BurstPause = 0.35 + Math.random() * 0.25;
            }
          }
        }

        const aiMax = isAiBoosting ? 56 : 42;
        p2Speed += aiThrust * (isAiBoosting ? ACCEL * 1.6 : ACCEL) * dt;
        p2Speed *= 1.0 - DRAG * dt;
        p2Speed = THREE.MathUtils.clamp(p2Speed, 0, aiMax);

        p2Heading += aiSteer * TURN_RATE * Math.max(0.2, p2Speed / TOP_CRUISE_SPEED) * dt;
        p2X += Math.sin(p2Heading) * p2Speed * dt;
        p2Z += Math.cos(p2Heading) * p2Speed * dt;

        p2Pitch += (p2Speed / TOP_CRUISE_SPEED * 0.07 - p2Pitch) * 5 * dt;
        p2Roll += (-aiSteer * (p2Speed / TOP_CRUISE_SPEED) * 0.25 - p2Roll) * 6 * dt;

        const aiBob = Math.cos(time * 2.1 + p2X * 0.015) * 0.35;
        opponentBoat.position.set(p2X, 0.45 + aiBob, p2Z);
        opponentBoat.rotation.set(p2Pitch, p2Heading, p2Roll);
      }

      // ── RAMMING COLLISION BETWEEN THE TWO BOATS ──
      const boatDist = Math.hypot(playerX - p2X, playerZ - p2Z);
      if (boatDist < 6.8 && p2Health > 0 && playerHealth > 0) {
        const overlap = (6.8 - boatDist) * 0.5;
        const nx = (playerX - p2X) / boatDist;
        const nz = (playerZ - p2Z) / boatDist;
        playerX += nx * overlap; playerZ += nz * overlap;
        p2X -= nx * overlap; p2Z -= nz * overlap;
        playerSpeed *= -0.4; p2Speed *= -0.4;

        if (time - lastRamTime > 1.2) {
          lastRamTime = time;
          playerHealth = Math.max(0, playerHealth - 4);
          p2Health = Math.max(0, p2Health - 4);
          timeSincePlayerHit = 0;
          spawnSparks((playerX + p2X) / 2, 1.2, (playerZ + p2Z) / 2, 25);
          if (soundSysRef.current) soundSysRef.current.playHit();
        }
      }

      // Muzzle flash decay
      [playerBoat, opponentBoat].forEach((b) => {
        b.traverse((child) => {
          if (child.name === "muzzleFlash" && child.material.opacity > 0) {
            child.material.opacity = Math.max(0, child.material.opacity - dt * 15);
          }
        });
      });

      // ── BULLET PHYSICS & COLLISION ──
      let p1Idx = 0, p2Idx = 0;
      for (let i = bullets.length - 1; i >= 0; i--) {
        const b = bullets[i];
        b.x += b.vx * dt; b.y += b.vy * dt; b.z += b.vz * dt;
        b.life -= dt;

        if (b.y <= 0.2 || b.life <= 0) {
          if (b.y <= 0.2) spawnFoamSplash(b.x, 0.2, b.z, 3, 0.6);
          bullets.splice(i, 1);
          continue;
        }

        const localRole = myRoleRef.current; // 'p1' or 'p2'
        const oppRole = localRole === "p1" ? "p2" : "p1";
        const PVP_BULLET_DAMAGE = 3.5;

        // Bullet fired by local player hitting opponent boat
        if (b.owner === localRole && p2Health > 0) {
          const dToOpponent = Math.hypot(b.x - p2X, b.z - p2Z);
          if (dToOpponent < 4.2 && b.y > -0.5 && b.y < 3.2) {
            p2Health = Math.max(0, p2Health - PVP_BULLET_DAMAGE);
            playerHitsLanded++;
            spawnSparks(b.x, b.y, b.z, 12);
            if (soundSysRef.current) soundSysRef.current.playHit();
            if (netManagerRef.current && gameModeRef.current === "online_2p") {
              netManagerRef.current.sendHit(PVP_BULLET_DAMAGE);
            }

            if (hitmarkerRef.current) {
              hitmarkerRef.current.classList.add("active");
              setTimeout(() => { if (hitmarkerRef.current) hitmarkerRef.current.classList.remove("active"); }, 120);
            }
            bullets.splice(i, 1);

            if (p2Health <= 0 && !matchResultRef.current) {
              matchResultRef.current = "victory";
              setMatchResult("victory");
              setMatchStats({ shotsFired: playerShotsFired, hitsLanded: playerHitsLanded, timeSec: Math.round(matchClock) });
              if (soundSysRef.current) soundSysRef.current.playExplosion();
              spawnSparks(p2X, 2, p2Z, 60);
              spawnFoamSplash(p2X, 0.5, p2Z, 40, 2);
            }
            continue;
          }
        }

        // Bullet fired by opponent hitting local player boat
        if (b.owner === oppRole && playerHealth > 0) {
          const dToP1 = Math.hypot(b.x - playerX, b.z - playerZ);
          if (dToP1 < 4.2 && b.y > -0.5 && b.y < 3.2) {
            const incomingDmg = gameModeRef.current === "vs_ai" ? 1.5 : PVP_BULLET_DAMAGE;
            playerHealth = Math.max(0, playerHealth - incomingDmg);
            timeSincePlayerHit = 0;
            spawnSparks(b.x, b.y, b.z, 10);
            if (soundSysRef.current) soundSysRef.current.playHit();

            if (damageVignetteRef.current && playerHitCooldown <= 0) {
              playerHitCooldown = 0.2;
              damageVignetteRef.current.classList.add("active");
              setTimeout(() => { if (damageVignetteRef.current) damageVignetteRef.current.classList.remove("active"); }, 120);
            }
            bullets.splice(i, 1);

            if (playerHealth <= 0 && !matchResultRef.current) {
              matchResultRef.current = "defeat";
              setMatchResult("defeat");
              setMatchStats({ shotsFired: playerShotsFired, hitsLanded: playerHitsLanded, timeSec: Math.round(matchClock) });
              if (soundSysRef.current) soundSysRef.current.playExplosion();
              spawnSparks(playerX, 2, playerZ, 60);
            }
            continue;
          }
        }

        dummyMatrix.makeRotationY(Math.atan2(b.vx, b.vz));
        dummyMatrix.setPosition(b.x, b.y, b.z);
        if (b.owner === "p1" && p1Idx < MAX_BULLETS) {
          p1BulletsMesh.setMatrixAt(p1Idx++, dummyMatrix);
        } else if (b.owner === "p2" && p2Idx < MAX_BULLETS) {
          p2BulletsMesh.setMatrixAt(p2Idx++, dummyMatrix);
        }
      }

      for (let j = p1Idx; j < MAX_BULLETS; j++) p1BulletsMesh.setMatrixAt(j, hideMatrix);
      for (let j = p2Idx; j < MAX_BULLETS; j++) p2BulletsMesh.setMatrixAt(j, hideMatrix);
      p1BulletsMesh.instanceMatrix.needsUpdate = true;
      p2BulletsMesh.instanceMatrix.needsUpdate = true;

      // Update Overhead 3D Nameplates
      const np1 = playerBoat.getObjectByName("nameplate");
      if (np1 && np1.userData.updateNameAndHp) np1.userData.updateNameAndHp(playerNameRef.current, playerHealth);
      const np2 = opponentBoat.getObjectByName("nameplate");
      if (np2 && np2.userData.updateNameAndHp) np2.userData.updateNameAndHp(opponentNameRef.current, p2Health);

      // Sinking effect on defeat
      if (p2Health <= 0) {
        opponentBoat.position.y -= dt * 0.7;
        opponentBoat.rotation.z += dt * 0.2;
      }
      if (playerHealth <= 0) {
        playerBoat.position.y -= dt * 0.7;
        playerBoat.rotation.z += dt * 0.2;
      }

      // Wakes and particles
      playerWake.update(playerX, playerZ, playerHeading, playerSpeed);
      if (p2Health > 0) opponentWake.update(p2X, p2Z, p2Heading, p2Speed);
      water.material.uniforms["time"].value += dt * 0.7;

      for (let i = foamList.length - 1; i >= 0; i--) {
        const p = foamList[i];
        p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
        p.vy -= 7.5 * dt;
        if (p.y < 0.15) { p.y = 0.15; p.vy *= -0.15; }
        p.life -= p.decay * dt;
        if (p.life <= 0) foamList.splice(i, 1);
      }
      const fpa = foamGeo.attributes.position, fsa = foamGeo.attributes.size, faa = foamGeo.attributes.alpha;
      for (let i = 0; i < FOAM_MAX; i++) {
        if (i < foamList.length) {
          const p = foamList[i];
          fpa.setXYZ(i, p.x, p.y, p.z);
          fsa.setX(i, p.size * (0.4 + p.life * 0.6));
          faa.setX(i, p.life * 0.75);
        } else { faa.setX(i, 0); fsa.setX(i, 0); }
      }
      fpa.needsUpdate = true; fsa.needsUpdate = true; faa.needsUpdate = true;

      // Audio
      if (soundSysRef.current) soundSysRef.current.update(pSpeedNorm, isBoosting);

      // Camera
      const cMode = cameraModeRef.current;
      if (cMode === "chase") {
        const camDistance = 34 + pSpeedNorm * 10;
        const camHeight = 16 + pSpeedNorm * 3;
        const desiredX = playerX - pFwdX * camDistance;
        const desiredZ = playerZ - pFwdZ * camDistance;
        const desiredY = 0.45 + pBob + camHeight;
        const lerpF = 5.0 * dt;
        camera.position.x += (desiredX - camera.position.x) * lerpF;
        camera.position.y += (desiredY - camera.position.y) * lerpF;
        camera.position.z += (desiredZ - camera.position.z) * lerpF;
        camera.lookAt(playerX + pFwdX * 16, 2.5, playerZ + pFwdZ * 16);
      } else if (cMode === "cockpit") {
        camera.position.set(playerX + pFwdX * 0.6, playerBoat.position.y + 2.1, playerZ + pFwdZ * 0.6);
        camera.lookAt(playerX + pFwdX * 45, playerBoat.position.y + 2.0, playerZ + pFwdZ * 45);
      } else {
        camera.position.set(playerX - pFwdX * 25, 62, playerZ - pFwdZ * 25);
        camera.lookAt(playerX, 0, playerZ);
      }

      // HUD Telemetry Updates
      const knots = Math.round(Math.abs(playerSpeed));
      if (speedRef.current) speedRef.current.textContent = knots;
      if (knotsRef.current) knotsRef.current.style.width = `${Math.min(100, (knots / TOP_BOOST_SPEED) * 100)}%`;
      if (compassRef.current) {
        let deg = Math.round(((-playerHeading * 180) / Math.PI) % 360);
        if (deg < 0) deg += 360;
        const dirs = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
        compassRef.current.textContent = `${deg}° ${dirs[Math.round(deg / 45) % 8]}`;
      }

      if (bossHpRef.current) bossHpRef.current.style.width = `${Math.max(0, p2Health)}%`;
      if (bossDistRef.current) bossDistRef.current.textContent = `${Math.round(distToOpponent)}M`;
      if (playerHpRef.current) playerHpRef.current.style.width = `${Math.max(0, playerHealth)}%`;
      if (playerHpValRef.current) playerHpValRef.current.textContent = `${Math.round(playerHealth)}%`;

      renderer.render(scene, camera);
    }
    animate();

    function onResize() {
      const w = mount.clientWidth, h = mount.clientHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    }
    window.addEventListener("resize", onResize);

    return () => {
      cancelAnimationFrame(frameId);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("mousedown", onMouseDown);
      window.removeEventListener("mouseup", onMouseUp);
      window.removeEventListener("resize", onResize);
      audioSys.destroy();
      netManager.destroy();
      playerWake.destroy();
      opponentWake.destroy();

      scene.traverse((node) => {
        if (node.geometry) node.geometry.dispose();
        if (node.material) {
          if (Array.isArray(node.material)) node.material.forEach((m) => m.dispose());
          else node.material.dispose();
        }
      });
      renderer.dispose();
      pmremGenerator.dispose();
      if (mount.contains(renderer.domElement)) mount.removeChild(renderer.domElement);
    };
  }, []);

  return (
    <div className="boat-game" ref={mountRef}>
      <div className="damage-vignette" ref={damageVignetteRef}></div>

      {/* ── TOP NAV BAR ── */}
      <header className="game-topbar">
        <div className="game-brand">
          <svg viewBox="0 0 42 42" aria-hidden="true" className="game-wave-icon">
            <path d="M5 24c4.8-7 9.6-7 14.4 0s9.6 7 17.6 0" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="3.5" />
            <path d="M5 16c4.8-7 9.6-7 14.4 0s9.6 7 17.6 0" fill="none" opacity=".55" stroke="currentColor" strokeLinecap="round" strokeWidth="3.5" />
          </svg>
          <span className="brand-text">TIDE VOYAGER</span>
          <span className="game-badge">MULTIPLAYER</span>
        </div>

        {/* Multiplayer Status & Name button */}
        <div className="game-stats">
          <button
            type="button"
            className="btn-captain-tag"
            onClick={() => setIsLobbyOpen(true)}
            title="Configure Captain Name & Multiplayer Room"
          >
            ⚓ {playerName} ▾
          </button>

          <div className="mp-status-badge">
            <span className={`mp-status-dot ${gameMode === "online_2p" && opponentName !== "Waiting for Opponent..." ? "" : "mp-status-dot--waiting"}`}></span>
            <span>
              {gameMode === "online_2p"
                ? (opponentName !== "Waiting for Opponent..."
                    ? `LIVE DUEL (${myRole.toUpperCase()})`
                    : `ROOM: ${roomCode} • WAITING FOR P2`)
                : gameMode === "local_2p"
                ? "LOCAL 2P"
                : "VS AI"}
            </span>
          </div>

          {gameMode === "online_2p" && (
            <button
              type="button"
              className={`btn-invite-link ${inviteCopied ? "copied" : ""}`}
              onClick={handleCopyInviteLink}
              title="Copy room invite link to share with Player 2"
            >
              {inviteCopied ? "✓ Link Copied!" : "📋 Copy Invite"}
            </button>
          )}

          <div className="stat-pill">
            <span className="stat-label">HEADING</span>
            <span className="stat-val" ref={compassRef}>000° N</span>
          </div>
        </div>

        <div className="game-top-actions">
          <button
            type="button"
            className={`hud-icon-btn ${!isMuted ? "active" : ""}`}
            onClick={handleToggleSound}
            title={isMuted ? "Enable Sound" : "Mute Sound"}
          >
            <span>{isMuted ? "Sound Off" : "Audio On"}</span>
          </button>
          <button type="button" className="hud-icon-btn" onClick={cycleTimeOfDay}>
            <span>{timeOfDay.toUpperCase()}</span>
          </button>
          <button type="button" className="hud-icon-btn" onClick={cycleCamera}>
            <span>{cameraMode.toUpperCase()}</span>
          </button>
          <button type="button" className="hud-icon-btn" onClick={handleHorn}>
            <span>HORN</span>
          </button>
          <button type="button" className="hud-link-btn" onClick={() => navigate("/home")}>
            Dashboard
          </button>
          <button type="button" className="hud-link-btn hud-link-btn--outline" onClick={() => navigate("/login")}>
            Sign Out
          </button>
        </div>
      </header>

      {/* ── OPPONENT JOIN NOTIFICATION TOAST ── */}
      {peerNotification && (
        <div className="peer-joined-toast">
          <span>{peerNotification}</span>
        </div>
      )}

      {/* ── OPPONENT HEALTH BAR (TOP CENTER) ── */}
      <div className="boss-health-bar">
        <div className="boss-header-row">
          <div className="boss-title-wrap">
            <span className="boss-icon">⚔</span>
            <span className="boss-name">{opponentName.toUpperCase()}</span>
          </div>
          <span className="boss-meta" ref={bossDistRef}>160M</span>
        </div>
        <div className="boss-track">
          <div className="boss-fill" ref={bossHpRef} style={{ width: "100%" }}></div>
        </div>
      </div>

      {/* ── THREAT WARNING ALERT ── */}
      <div className="enemy-lock-alert" ref={lockAlertRef} style={{ display: "none" }}>
        <span>⚠️</span>
        <span>IN ENEMY GUN SIGHTS — EVADE!</span>
      </div>

      {/* ── AIM RETICLE & HITMARKER ── */}
      <div className="aim-crosshair">
        <div className="crosshair-reticle">
          <div className="crosshair-circle"></div>
          <div className="crosshair-dot"></div>
          <div className="crosshair-tick-top"></div>
          <div className="crosshair-tick-bottom"></div>
          <div className="crosshair-tick-left"></div>
          <div className="crosshair-tick-right"></div>
          <div className="hitmarker" ref={hitmarkerRef}></div>
        </div>
      </div>

      {/* ── PLAYER HULL & TELEMETRY (BOTTOM-LEFT) ── */}
      <div className="telemetry-panel">
        <div className="player-hull-panel">
          <div className="hull-header">
            <span className="hull-label">🛡 {playerName.toUpperCase()}</span>
            <span className="hull-val" ref={playerHpValRef}>100%</span>
          </div>
          <div className="hull-track">
            <div className="hull-fill" ref={playerHpRef} style={{ width: "100%" }}></div>
          </div>
        </div>

        <div className="speed-cluster">
          <div className="speed-big">
            <span className="speed-number" ref={speedRef}>0</span>
            <span className="speed-unit">KNOTS</span>
          </div>
          <div className="speed-bar-wrap">
            <div className="speed-bar-fill" ref={knotsRef}></div>
          </div>
          <div className="speed-labels">
            <span>IDLE</span>
            <span>CRUISE</span>
            <span>BOOST</span>
          </div>
        </div>
      </div>

      {/* ── KEYBOARD CONTROLS GUIDE (BOTTOM-CENTER) ── */}
      <div className="controls-guide-hud">
        {gameMode === "local_2p" ? (
          <>
            <div className="key-pill"><kbd>WASD</kbd> P1 Move | <kbd>SPACE</kbd> P1 Fire</div>
            <div className="key-pill" style={{ color: "#ff6b6b" }}><kbd>ARROWS</kbd> P2 Move | <kbd>ENTER</kbd> P2 Fire</div>
          </>
        ) : (
          <>
            <div className="key-pill"><kbd>W</kbd>/<kbd>S</kbd> Throttle</div>
            <div className="key-pill"><kbd>A</kbd>/<kbd>D</kbd> Steer</div>
            <div className="key-pill key-pill--boost"><kbd>SPACE</kbd> Boost</div>
            <div className="key-pill" style={{ color: "#ff6b6b" }}><kbd>CLICK</kbd> / <kbd>F</kbd> Fire</div>
            <div className="key-pill"><kbd>C</kbd> Cam</div>
          </>
        )}
      </div>

      {/* ── BIG RED FIRE BUTTON ── */}
      <div className="touch-fire-wrap">
        <button
          type="button"
          className="touch-btn--fire"
          onPointerDown={() => { inputRef.current.fire = true; }}
          onPointerUp={() => { inputRef.current.fire = false; }}
          onPointerLeave={() => { inputRef.current.fire = false; }}
          aria-label="Fire Guns"
        >
          <span className="fire-icon">🔥</span>
          <span className="fire-text">FIRE</span>
        </button>
      </div>

      {/* ── D-PAD CONTROLS (BOTTOM-RIGHT) ── */}
      <div className="touch-controls">
        <div className="dpad-grid">
          <div></div>
          <button
            type="button"
            className="touch-btn"
            onPointerDown={() => { inputRef.current.forward = true; }}
            onPointerUp={() => { inputRef.current.forward = false; }}
            onPointerLeave={() => { inputRef.current.forward = false; }}
            aria-label="Throttle Forward"
          >
            ▲
          </button>
          <div></div>

          <button
            type="button"
            className="touch-btn"
            onPointerDown={() => { inputRef.current.left = true; }}
            onPointerUp={() => { inputRef.current.left = false; }}
            onPointerLeave={() => { inputRef.current.left = false; }}
            aria-label="Steer Left"
          >
            ◀
          </button>
          <button
            type="button"
            className="touch-btn touch-btn--boost"
            onPointerDown={() => { inputRef.current.boost = true; }}
            onPointerUp={() => { inputRef.current.boost = false; }}
            onPointerLeave={() => { inputRef.current.boost = false; }}
            aria-label="Turbo Boost"
          >
            BOOST
          </button>
          <button
            type="button"
            className="touch-btn"
            onPointerDown={() => { inputRef.current.right = true; }}
            onPointerUp={() => { inputRef.current.right = false; }}
            onPointerLeave={() => { inputRef.current.right = false; }}
            aria-label="Steer Right"
          >
            ▶
          </button>

          <div></div>
          <button
            type="button"
            className="touch-btn"
            onPointerDown={() => { inputRef.current.backward = true; }}
            onPointerUp={() => { inputRef.current.backward = false; }}
            onPointerLeave={() => { inputRef.current.backward = false; }}
            aria-label="Throttle Reverse"
          >
            ▼
          </button>
          <div></div>
        </div>
      </div>

      {/* ── MULTIPLAYER LOBBY & NAME MODAL ── */}
      {isLobbyOpen && (
        <div className="lobby-modal-backdrop">
          <div className="lobby-modal-card">
            <span className="lobby-badge">⚔ NAVAL LOBBY</span>
            <h2 className="lobby-title">Captain Registration</h2>
            <p className="lobby-subtitle">Enter your name and choose your multiplayer battle mode.</p>

            <form onSubmit={handleSaveCaptain} className="lobby-input-section">
              <div className="lobby-field">
                <label className="lobby-label" htmlFor="captain-name">YOUR CAPTAIN NAME</label>
                <div className="room-input-wrap">
                  <input
                    id="captain-name"
                    type="text"
                    className="lobby-input"
                    placeholder="e.g. Captain Drake"
                    value={playerName}
                    onChange={(e) => setPlayerName(e.target.value)}
                    maxLength={28}
                    required
                  />
                  <button
                    type="button"
                    className="btn-randomize"
                    onClick={handleRandomizeName}
                    title="Generate Random Captain Name"
                  >
                    🎲 Random
                  </button>
                </div>
              </div>

              <div className="lobby-field">
                <label className="lobby-label">SELECT BATTLE MODE</label>
                <div className="mode-pill-grid">
                  <button
                    type="button"
                    className={`mode-pill ${gameMode === "online_2p" ? "active" : ""}`}
                    onClick={() => setGameMode("online_2p")}
                  >
                    <span className="mode-pill-icon">🌐</span>
                    <span className="mode-pill-title">ONLINE 2P</span>
                    <span className="mode-pill-desc">Cross-Laptop LAN</span>
                  </button>

                  <button
                    type="button"
                    className={`mode-pill ${gameMode === "local_2p" ? "active" : ""}`}
                    onClick={() => setGameMode("local_2p")}
                  >
                    <span className="mode-pill-icon">🎮</span>
                    <span className="mode-pill-title">LOCAL 2P</span>
                    <span className="mode-pill-desc">Same Keyboard</span>
                  </button>

                  <button
                    type="button"
                    className={`mode-pill ${gameMode === "vs_ai" ? "active" : ""}`}
                    onClick={() => { setGameMode("vs_ai"); setOpponentName("Corsair AI"); }}
                  >
                    <span className="mode-pill-icon">🤖</span>
                    <span className="mode-pill-title">SOLO VS AI</span>
                    <span className="mode-pill-desc">Practice Match</span>
                  </button>
                </div>
              </div>

              {gameMode === "online_2p" && (
                <>
                  <div className="lobby-field">
                    <label className="lobby-label" htmlFor="room-code">ROOM CODE (SAME ON BOTH LAPTOPS)</label>
                    <div className="room-input-wrap">
                      <input
                        id="room-code"
                        type="text"
                        className="lobby-input room-input"
                        placeholder="SEA1"
                        value={roomCode}
                        onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
                        maxLength={8}
                      />
                      <button
                        type="button"
                        className={`btn-invite-link ${inviteCopied ? "copied" : ""}`}
                        onClick={handleCopyInviteLink}
                      >
                        {inviteCopied ? "✓ Copied!" : "📋 Invite Link"}
                      </button>
                    </div>
                    <span className="lobby-label" style={{fontSize: "0.58rem", opacity: 0.55, marginTop: 2}}>
                      Role auto-assigned by server • Currently: {myRole.toUpperCase()}
                    </span>
                  </div>

                  <div className="lobby-field">
                    <label className="lobby-label">GLOBAL ONLINE ARENA LINK (SHARE WITH FRIEND)</label>
                    <div className="room-input-wrap">
                      <input
                        type="text"
                        className="lobby-input"
                        style={{ fontSize: "0.76rem", color: "#00f5d4", fontFamily: "'DM Mono', monospace" }}
                        readOnly
                        value={`${(publicShareUrlRef.current && window.location.origin.includes('localhost')) ? publicShareUrlRef.current : window.location.origin}/game?room=${roomCode}`}
                      />
                      <button
                        type="button"
                        className={`btn-invite-link ${inviteCopied ? "copied" : ""}`}
                        onClick={handleCopyInviteLink}
                      >
                        {inviteCopied ? "✓ Copied!" : "📋 Copy Link"}
                      </button>
                    </div>
                  </div>
                </>
              )}

              <div className="lobby-actions">
                <button
                  type="button"
                  className="combat-secondary-btn"
                  onClick={() => setIsLobbyOpen(false)}
                >
                  Close
                </button>
                <button
                  type="submit"
                  className="lobby-start-btn"
                >
                  Save & Enter Duel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── ENTER THE ARENA JOIN MODAL (WHEN JOINING VIA LINK) ── */}
      {isJoinModalOpen && (
        <div className="lobby-modal-backdrop">
          <div className="lobby-modal-card join-modal-card">
            <span className="lobby-badge">⚔ LIVE MULTIPLAYER DUEL</span>
            <h2 className="lobby-title">Enter The Naval Arena</h2>
            <p className="lobby-subtitle">
              Joining Room <strong className="room-highlight">{roomCode}</strong> • Face off against{" "}
              <strong>{opponentName !== "Waiting for Opponent..." ? opponentName : "Player 1"}</strong> in real time!
            </p>

            <form onSubmit={handleEnterBattle} className="lobby-input-section">
              <div className="lobby-field">
                <label className="lobby-label" htmlFor="join-captain-name">YOUR CAPTAIN NAME</label>
                <div className="room-input-wrap">
                  <input
                    id="join-captain-name"
                    type="text"
                    className="lobby-input"
                    placeholder="Enter your Captain callsign..."
                    value={playerName}
                    onChange={(e) => setPlayerName(e.target.value)}
                    maxLength={28}
                    required
                    autoFocus
                  />
                  <button
                    type="button"
                    className="btn-randomize"
                    onClick={handleRandomizeName}
                    title="Generate Random Captain Name"
                  >
                    🎲 Random
                  </button>
                </div>
              </div>

              <div className="lobby-actions" style={{ marginTop: "20px" }}>
                <button
                  type="submit"
                  className="lobby-start-btn"
                  style={{ width: "100%", padding: "14px 20px", fontSize: "1.05rem", fontWeight: "800" }}
                >
                  🚀 ENTER BATTLE STATIONS
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── VICTORY / DEFEAT MODAL OVERLAY ── */}
      {matchResult && (
        <div className="combat-modal-backdrop">
          <div className={`combat-modal-card ${matchResult === "defeat" ? "combat-modal-card--defeat" : ""}`}>
            <span className="combat-modal-icon">
              {matchResult === "victory" ? "🏆" : "💀"}
            </span>

            <h2 className={`combat-modal-title ${matchResult === "victory" ? "combat-modal-title--victory" : "combat-modal-title--defeat"}`}>
              {matchResult === "victory" ? "VICTORY AT SEA!" : "SHIP DESTROYED!"}
            </h2>

            <p className="combat-modal-subtitle">
              {matchResult === "victory"
                ? `Captain ${playerName}, you successfully sent ${opponentName} to the depths!`
                : `${opponentName} overpowered your defenses and sank your vessel.`}
            </p>

            <div className="combat-stats-grid">
              <div className="combat-stat-item">
                <span className="combat-stat-label">SHOTS FIRED</span>
                <span className="combat-stat-val">{matchStats.shotsFired}</span>
              </div>
              <div className="combat-stat-item">
                <span className="combat-stat-label">HITS LANDED</span>
                <span className="combat-stat-val">{matchStats.hitsLanded}</span>
              </div>
              <div className="combat-stat-item">
                <span className="combat-stat-label">BATTLE TIME</span>
                <span className="combat-stat-val">{matchStats.timeSec}s</span>
              </div>
            </div>

            <div className="combat-modal-actions">
              <button
                type="button"
                className="combat-primary-btn"
                onClick={handleRestartMatch}
              >
                Rematch Battle
              </button>
              <button
                type="button"
                className="combat-secondary-btn"
                onClick={() => setIsLobbyOpen(true)}
              >
                Change Mode / Name
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
