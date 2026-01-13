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
let lastSafePosition = new THREE.Vector3(0, 5, 0); // Checkpoint
let timeSinceLastSafe = 0;

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

    // Bike Model (simplified)
    const frameGeo = new THREE.BoxGeometry(0.5, 1, 2.5);
    const frameMat = new THREE.MeshStandardMaterial({ color: 0xff0000 });
    const frame = new THREE.Mesh(frameGeo, frameMat);
    frame.castShadow = true;
    bikeGroup.add(frame);

    // Handlebars
    const handleBarGeo = new THREE.CylinderGeometry(0.1, 0.1, 2, 16);
    const handleBarMat = new THREE.MeshStandardMaterial({ color: 0x333333 });
    const handleBar = new THREE.Mesh(handleBarGeo, handleBarMat);
    handleBar.rotation.z = Math.PI / 2;
    handleBar.position.set(0, 0.5, -1);
    handleBar.castShadow = true;
    bikeGroup.add(handleBar);

    // Wheels (visual only)
    const wheelGeo = new THREE.CylinderGeometry(0.8, 0.8, 0.2, 32);
    const wheelMat = new THREE.MeshStandardMaterial({ color: 0x111111 });

    const frontWheel = new THREE.Mesh(wheelGeo, wheelMat);
    frontWheel.rotation.z = Math.PI / 2;
    frontWheel.position.set(0, -0.5, -1.2);
    bikeGroup.add(frontWheel);

    const backWheel = new THREE.Mesh(wheelGeo, wheelMat);
    backWheel.rotation.z = Math.PI / 2;
    backWheel.position.set(0, -0.5, 1.2);
    bikeGroup.add(backWheel);

    // Rider (simplified box)
    const riderGeo = new THREE.BoxGeometry(0.6, 1.5, 0.6);
    const riderMat = new THREE.MeshStandardMaterial({ color: 0x0000ff });
    const rider = new THREE.Mesh(riderGeo, riderMat);
    rider.position.set(0, 1.2, 0);
    bikeGroup.add(rider);

    // Add camera to the bike group (Third Person)
    // Position: Behind (+Z) and Up (+Y)
    camera.position.set(0, 4, 8);
    // Look slightly down at the bike
    camera.lookAt(0, 1, 0);

    bikeGroup.add(camera);

    // Start position
    bikeGroup.position.set(0, 5, 0);

    scene.add(bikeGroup);

    // Raycaster for ground detection
    raycaster = new THREE.Raycaster();
}

function createCourse() {
    obstacles = []; // Clear

    // Materials
    const woodTextureColor = 0x8B4513;
    const woodMaterial = new THREE.MeshStandardMaterial({ color: woodTextureColor });
    const groundMaterial = new THREE.MeshStandardMaterial({ color: 0x55aa55 });

    // 1. Ground Plane
    const groundGeo = new THREE.PlaneGeometry(2000, 2000);
    const ground = new THREE.Mesh(groundGeo, groundMaterial);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    scene.add(ground);
    obstacles.push(ground);

    // 2. Continuous Course Generation
    // We will build a path of connected segments

    let currentPos = new THREE.Vector3(0, 2, 0); // Start slightly above ground
    let currentDir = new THREE.Vector3(0, 0, -1); // Facing North (-Z)

    // Helper to add a straight segment
    function addStraight(length, width = 8, slope = 0) {
        // Calculate center position for the box
        // The box origin is center, so we move half-length
        const segCenter = currentPos.clone().add(currentDir.clone().multiplyScalar(length / 2));

        // Handle slope (vertical change)
        const dy = Math.sin(slope) * length;
        segCenter.y += dy / 2;

        const box = createBoxRotated(
            segCenter.x, segCenter.y, segCenter.z,
            width, 1, length,
            woodMaterial,
            Math.atan2(currentDir.x, currentDir.z), // Y rotation
            -slope // X rotation (tilt up)
        );

        // Update currentPos to the end of this segment
        currentPos.add(currentDir.clone().multiplyScalar(length));
        currentPos.y += dy;
        return box;
    }

    // Helper to turn
    function turn(angleDegrees) {
        const axis = new THREE.Vector3(0, 1, 0);
        const angle = THREE.MathUtils.degToRad(angleDegrees);
        currentDir.applyAxisAngle(axis, angle);
    }

    // Helper to add a gap/jump
    function addGap(length) {
        currentPos.add(currentDir.clone().multiplyScalar(length));
    }

    // --- Build the Track ---

    // 1. Start Platform
    createBox(0, 0, 10, 20, 2, 20, woodMaterial); // Behind start to stand on

    // 2. Initial Straight
    addStraight(40);

    // 3. Ramp Up
    addStraight(30, 8, 0.3); // 0.3 rad slope

    // 4. Elevated Turn Left
    addStraight(20);
    turn(45);
    addStraight(30);
    turn(45); // Now facing West (-X)
    addStraight(50);

    // 5. Downhill Speed
    turn(10);
    addStraight(60, 8, -0.4); // Down

    // 6. Jump!
    addStraight(20, 8, 0.2); // Kicker ramp
    addGap(15); // Gap

    // 7. Landing
    addStraight(30, 12, -0.1); // Wider landing

    // 8. Winding section
    turn(-45);
    addStraight(30);
    turn(-45); // Facing North again
    addStraight(30);
    turn(90); // East
    addStraight(30);
    turn(-90); // North

    // 9. Big Final Ramp
    addStraight(20);
    addStraight(50, 8, 0.5); // Steep up

    // 10. Top Platform
    addStraight(20);
}

function createBox(x, y, z, w, h, d, material) {
    const geo = new THREE.BoxGeometry(w, h, d);
    const mesh = new THREE.Mesh(geo, material);
    mesh.position.set(x, y + h/2, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    scene.add(mesh);
    obstacles.push(mesh);
    return mesh;
}

function createBoxRotated(x, y, z, w, h, d, material, rotY, rotX) {
    const geo = new THREE.BoxGeometry(w, h, d);
    const mesh = new THREE.Mesh(geo, material);
    mesh.position.set(x, y, z);
    mesh.rotation.y = rotY;
    mesh.rotation.x = rotX;
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
    const dt = Math.min(delta, 0.1);

    // 1. Handle Input & Speed
    if (moveForward) {
        speed += acceleration;
    } else if (moveBackward) {
        speed -= acceleration;
    } else {
        if (speed > 0) speed = Math.max(0, speed - friction);
        if (speed < 0) speed = Math.min(0, speed + friction);
    }

    if (speed > maxSpeed) speed = maxSpeed;
    if (speed < -maxSpeed / 2) speed = -maxSpeed / 2;

    // 2. Handle Rotation
    if (speed !== 0) {
        if (rotateLeft) bikeGroup.rotation.y += turnSpeed;
        if (rotateRight) bikeGroup.rotation.y -= turnSpeed;

        const targetBank = (rotateLeft ? 0.3 : (rotateRight ? -0.3 : 0));
        bikeGroup.rotation.z = THREE.MathUtils.lerp(bikeGroup.rotation.z, targetBank, 0.1);
    }

    // 3. Move Bike
    const forwardX = -Math.sin(bikeGroup.rotation.y);
    const forwardZ = -Math.cos(bikeGroup.rotation.y);

    const nextX = bikeGroup.position.x + forwardX * speed * 60 * dt;
    const nextZ = bikeGroup.position.z + forwardZ * speed * 60 * dt;

    bikeGroup.position.x = nextX;
    bikeGroup.position.z = nextZ;

    // 4. Physics
    const rayOrigin = bikeGroup.position.clone();
    rayOrigin.y += 5;

    raycaster.set(rayOrigin, new THREE.Vector3(0, -1, 0));
    const intersects = raycaster.intersectObjects(obstacles);

    let groundHeight = -100;
    let isOverCourse = false;

    if (intersects.length > 0) {
        // We might intersect multiple things (e.g., overlapping boxes).
        // We want the highest point below us.
        // intersects is sorted by distance, so intersects[0] is the first hit.
        groundHeight = intersects[0].point.y;

        // Check if we are over the "course" (any obstacle that is not the floor, or including floor?)
        // The user said "fall off course". If the ground is part of the "world" but not "course",
        // we might want to differentiate. For now, anything we can stand on is safe.
        isOverCourse = true;
    }

    const playerHeight = 1.0; // Distance from center of bike to bottom of wheels

    if (bikeGroup.position.y > groundHeight + playerHeight + 0.1) {
        // Air
        verticalVelocity -= gravity * dt * 50;
        isGrounded = false;
    } else {
        // Ground
        isGrounded = true;
        verticalVelocity = Math.max(0, verticalVelocity);
        bikeGroup.position.y = groundHeight + playerHeight;
    }

    bikeGroup.position.y += verticalVelocity * dt;

    // 5. Checkpoint Logic
    if (isGrounded && isOverCourse) {
        // We are safely on something.
        // Update checkpoint occasionally to avoid saving "edge" positions too aggressively
        timeSinceLastSafe += dt;
        if (timeSinceLastSafe > 1.0) { // Save every 1 second of stability
            lastSafePosition.copy(bikeGroup.position);
            // Slightly lift it to avoid clipping on respawn
            lastSafePosition.y += 2;
            timeSinceLastSafe = 0;
        }
    } else {
        timeSinceLastSafe = 0;
    }

    // 6. Respawn Logic
    // If we fall too far below the last safe height (or absolute floor)
    if (bikeGroup.position.y < -30) {
        // Respawn at checkpoint
        bikeGroup.position.copy(lastSafePosition);

        // Reset physics
        speed = 0;
        verticalVelocity = 0;
        bikeGroup.rotation.set(0, bikeGroup.rotation.y, 0); // Keep facing direction, reset tilt
    }

    prevTime = time;
    renderer.render(scene, camera);
}
