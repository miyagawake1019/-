import * as THREE from 'three';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';

let camera, scene, renderer;
let bike, bikeGroup;
let raycaster;
let obstacles = [];

// Physics variables
let speed = 0;
let maxSpeed = 2.0;
let acceleration = 0.05;
let friction = 0.02;
let turnSpeed = 0.05;
let gravity = 0.8;
let verticalVelocity = 0;
let isGrounded = false;

// Input states
let moveForward = false;
let moveBackward = false;
let rotateLeft = false;
let rotateRight = false;

let prevTime = performance.now();

init();
animate();

function init() {
    // Scene setup
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x87ceeb);
    scene.fog = new THREE.Fog(0x87ceeb, 0, 750);

    // Camera setup
    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);

    // Lights
    const hemiLight = new THREE.HemisphereLight(0xeeeeff, 0x777788, 0.75);
    hemiLight.position.set(0.5, 1, 0.75);
    scene.add(hemiLight);

    const dirLight = new THREE.DirectionalLight(0xffffff, 1);
    dirLight.position.set(50, 200, 100);
    dirLight.castShadow = true;
    dirLight.shadow.camera.left = -50;
    dirLight.shadow.camera.right = 50;
    dirLight.shadow.camera.top = 50;
    dirLight.shadow.camera.bottom = -50;
    scene.add(dirLight);

    // Create Course
    createCourse();

    // Create Bike (Player)
    createBike();

    // Controls Overlay Logic
    const instructions = document.getElementById('instructions');

    // We use a simple click to "start" (hide instructions),
    // but we don't strictly need PointerLock for steering since we use keys.
    // However, hiding the cursor is nice.
    document.addEventListener('click', function () {
        instructions.style.display = 'none';
        document.body.requestPointerLock();
    });

    // Input handling
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('keyup', onKeyUp);

    // Renderer
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true;
    document.body.appendChild(renderer.domElement);

    // Resize handler
    window.addEventListener('resize', onWindowResize);
}

function createBike() {
    bikeGroup = new THREE.Group();

    // Simple visual representation of handlebars
    const handleBarGeo = new THREE.CylinderGeometry(0.1, 0.1, 4, 16);
    const handleBarMat = new THREE.MeshStandardMaterial({ color: 0x333333 });
    const handleBar = new THREE.Mesh(handleBarGeo, handleBarMat);
    handleBar.rotation.z = Math.PI / 2;
    handleBar.position.set(0, -0.5, -1.5); // Position relative to camera
    handleBar.castShadow = true;

    // Stem
    const stemGeo = new THREE.BoxGeometry(0.2, 0.2, 1);
    const stem = new THREE.Mesh(stemGeo, handleBarMat);
    stem.position.set(0, -0.6, -1);

    bikeGroup.add(handleBar);
    bikeGroup.add(stem);

    // Add camera to the bike group so it follows
    bikeGroup.add(camera);

    // Start position
    bikeGroup.position.set(0, 5, 0);

    scene.add(bikeGroup);

    // Raycaster for ground detection
    raycaster = new THREE.Raycaster();
}

function createCourse() {
    // Materials
    const woodTextureColor = 0x8B4513;
    const woodMaterial = new THREE.MeshStandardMaterial({ color: woodTextureColor });
    const groundMaterial = new THREE.MeshStandardMaterial({ color: 0x55aa55 }); // Grass Green

    // 1. Ground Plane
    const groundGeo = new THREE.PlaneGeometry(2000, 2000);
    const ground = new THREE.Mesh(groundGeo, groundMaterial);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    scene.add(ground);
    obstacles.push(ground);

    // 2. Wooden Ramps and Platforms

    // Starting Platform
    createBox(0, 0, 0, 20, 1, 20, woodMaterial);

    // Ramp 1
    createRamp(0, 0, -30, 10, 20, 0.3, woodMaterial);

    // Elevated Path
    createBox(0, 5.8, -70, 10, 1, 60, woodMaterial);

    // Big Jump Ramp (The "Big One")
    // Positioned at the end of the elevated path
    createRamp(0, 5.8, -110, 10, 30, 0.5, woodMaterial);

    // Landing Zone (Far away)
    createBox(0, 2, -180, 30, 2, 50, woodMaterial);

    // Some random wooden obstacles/courses around
    // A loop-ish track
    for (let i = 0; i < 10; i++) {
        const angle = (i / 10) * Math.PI * 2;
        const radius = 80;
        const x = Math.cos(angle) * radius;
        const z = Math.sin(angle) * radius;

        // Pillars
        createBox(x, 5, z, 5, 10, 5, woodMaterial);

        // Connecting planks (very rough approx)
        if (i < 9) {
            // This is just decoration to make it look "busy"
        }
    }

    // Another steep ramp
    createRamp(50, 0, 50, 8, 40, 0.6, woodMaterial);
}

function createBox(x, y, z, w, h, d, material) {
    const geo = new THREE.BoxGeometry(w, h, d);
    const mesh = new THREE.Mesh(geo, material);
    mesh.position.set(x, y + h/2, z); // pivot at bottom
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    scene.add(mesh);
    obstacles.push(mesh);
    return mesh;
}

function createRamp(x, y, z, width, length, slope, material) {
    // Create a box and rotate it
    const geo = new THREE.BoxGeometry(width, 1, length);
    const mesh = new THREE.Mesh(geo, material);

    mesh.position.set(x, y, z);
    mesh.rotation.x = -slope; // Tilt up

    // Adjust Y so the bottom edge matches y
    // simple heuristic adjustment
    const dy = (Math.sin(slope) * length) / 2;
    mesh.position.y += dy;

    mesh.castShadow = true;
    mesh.receiveShadow = true;
    scene.add(mesh);
    obstacles.push(mesh);
    return mesh;
}

function onKeyDown(event) {
    switch (event.code) {
        case 'ArrowUp': moveForward = true; break;
        case 'ArrowDown': moveBackward = true; break;
        case 'ArrowLeft': rotateLeft = true; break;
        case 'ArrowRight': rotateRight = true; break;
    }
}

function onKeyUp(event) {
    switch (event.code) {
        case 'ArrowUp': moveForward = false; break;
        case 'ArrowDown': moveBackward = false; break;
        case 'ArrowLeft': rotateLeft = false; break;
        case 'ArrowRight': rotateRight = false; break;
    }
}

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

function animate() {
    requestAnimationFrame(animate);

    const time = performance.now();
    const delta = (time - prevTime) / 1000;
    const dt = Math.min(delta, 0.1); // Cap delta time

    // 1. Handle Input & Speed
    if (moveForward) {
        speed += acceleration;
    } else if (moveBackward) {
        speed -= acceleration;
    } else {
        // Friction
        if (speed > 0) speed = Math.max(0, speed - friction);
        if (speed < 0) speed = Math.min(0, speed + friction);
    }

    // Cap speed
    if (speed > maxSpeed) speed = maxSpeed;
    if (speed < -maxSpeed / 2) speed = -maxSpeed / 2;

    // 2. Handle Rotation
    if (speed !== 0) { // Only turn if moving (or allow static turning? Bicycles usually need speed, but games are forgiving)
        // Actually, in games, static turning is fine usually
        if (rotateLeft) bikeGroup.rotation.y += turnSpeed;
        if (rotateRight) bikeGroup.rotation.y -= turnSpeed;

        // Bank angle (visual effect)
        const targetBank = (rotateLeft ? 0.3 : (rotateRight ? -0.3 : 0));
        bikeGroup.rotation.z = THREE.MathUtils.lerp(bikeGroup.rotation.z, targetBank, 0.1);
    }

    // 3. Move Bike (Horizontal)
    const forwardX = -Math.sin(bikeGroup.rotation.y);
    const forwardZ = -Math.cos(bikeGroup.rotation.y);

    // Propose new position
    const nextX = bikeGroup.position.x + forwardX * speed * 60 * dt; // 60 is arbitrary scale factor
    const nextZ = bikeGroup.position.z + forwardZ * speed * 60 * dt;

    bikeGroup.position.x = nextX;
    bikeGroup.position.z = nextZ;

    // 4. Physics (Gravity & Ground Collision)

    // Cast ray down from slightly above current position
    // We lift the ray origin up to ensure we catch ramps that we are climbing
    const rayOrigin = bikeGroup.position.clone();
    rayOrigin.y += 5;

    raycaster.set(rayOrigin, new THREE.Vector3(0, -1, 0));

    const intersects = raycaster.intersectObjects(obstacles);

    let groundHeight = -100; // Default fallback
    if (intersects.length > 0) {
        groundHeight = intersects[0].point.y;
    }

    const playerHeight = 2.0; // Height of camera/eyes from ground

    if (bikeGroup.position.y > groundHeight + playerHeight + 0.1) {
        // In air
        verticalVelocity -= gravity * dt * 50;
        isGrounded = false;
    } else {
        // On ground
        isGrounded = true;
        verticalVelocity = Math.max(0, verticalVelocity); // Stop falling

        // Snap to ground smoothly-ish
        bikeGroup.position.y = groundHeight + playerHeight;
    }

    bikeGroup.position.y += verticalVelocity * dt;

    // Simple kill floor
    if (bikeGroup.position.y < -50) {
        bikeGroup.position.set(0, 5, 0);
        speed = 0;
        verticalVelocity = 0;
    }

    prevTime = time;
    renderer.render(scene, camera);
}
