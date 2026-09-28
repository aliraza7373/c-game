import { useEffect, useRef } from "react";
import * as THREE from "three";
import { Water } from "three/addons/objects/Water.js";
import { Sky } from "three/addons/objects/Sky.js";

export default function OceanBackground() {
  const containerRef = useRef(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    /* ────── renderer ────── */
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 0.45;
    container.appendChild(renderer.domElement);

    /* ────── scene & camera ────── */
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(
      55,
      container.clientWidth / container.clientHeight,
      1,
      20000
    );
    camera.position.set(0, 35, 120);
    camera.lookAt(0, 0, 0);

    /* ────── sun position ────── */
    const sun = new THREE.Vector3();
    const pmremGenerator = new THREE.PMREMGenerator(renderer);
    pmremGenerator.compileEquirectangularShader();

    /* ────── water ────── */
    const waterGeometry = new THREE.PlaneGeometry(10000, 10000);
    const water = new Water(waterGeometry, {
      textureWidth: 512,
      textureHeight: 512,
      waterNormals: new THREE.TextureLoader().load(
        "https://raw.githubusercontent.com/mrdoob/three.js/dev/examples/textures/waternormals.jpg",
        (texture) => {
          texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
        }
      ),
      sunDirection: new THREE.Vector3(),
      sunColor: 0xfff5e6,
      waterColor: 0x001e3c,
      distortionScale: 6.0,
      fog: scene.fog !== undefined,
    });
    water.rotation.x = -Math.PI / 2;
    scene.add(water);

    /* ────── sky ────── */
    const sky = new Sky();
    sky.scale.setScalar(10000);
    scene.add(sky);

    const skyUniforms = sky.material.uniforms;
    skyUniforms["turbidity"].value = 8;
    skyUniforms["rayleigh"].value = 3.5;
    skyUniforms["mieCoefficient"].value = 0.006;
    skyUniforms["mieDirectionalG"].value = 0.82;

    /* ────── sun helper ────── */
    const phi = THREE.MathUtils.degToRad(88);      // just above horizon for sunset feel
    const theta = THREE.MathUtils.degToRad(180);
    sun.setFromSphericalCoords(1, phi, theta);

    sky.material.uniforms["sunPosition"].value.copy(sun);
    water.material.uniforms["sunDirection"].value.copy(sun).normalize();

    const renderTarget = pmremGenerator.fromScene(sky);
    scene.environment = renderTarget.texture;

    /* ────── ambient fog ────── */
    scene.fog = new THREE.FogExp2(0x0a2a4a, 0.00025);

    /* ────── gentle camera sway ────── */
    let time = 0;
    const clock = new THREE.Clock();
    let frameId;

    function animate() {
      frameId = requestAnimationFrame(animate);
      const delta = clock.getDelta();
      time += delta;

      // animate water
      water.material.uniforms["time"].value += delta * 0.6;

      // gentle camera bob
      camera.position.y = 35 + Math.sin(time * 0.35) * 3;
      camera.position.x = Math.sin(time * 0.12) * 8;
      camera.lookAt(0, 5, -30);

      renderer.render(scene, camera);
    }
    animate();

    /* ────── resize handler ────── */
    function onResize() {
      const w = container.clientWidth;
      const h = container.clientHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    }
    window.addEventListener("resize", onResize);

    /* ────── cleanup ────── */
    return () => {
      cancelAnimationFrame(frameId);
      window.removeEventListener("resize", onResize);
      renderer.dispose();
      waterGeometry.dispose();
      water.material.dispose();
      sky.material.dispose();
      pmremGenerator.dispose();
      if (renderTarget) renderTarget.dispose();
      if (container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
    };
  }, []);

  return (
    <div
      ref={containerRef}
      aria-hidden="true"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 0,
        pointerEvents: "none",
      }}
    />
  );
}
