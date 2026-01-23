import * as THREE from 'three';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';

let camera, scene, renderer;
let bike, bikeGroup;
let raycaster;
let obstacles = [];
let boostPads = [];

// Physics variables
let speed = 0;
let maxSpeed = 3.0;
let acceleration = 0.08;
let friction = 0.05;
let turnSpeed = 0.06;
let gravity = 0.8;
let verticalVelocity = 0;
let isGrounded = false;
let lastSafePosition = new THREE.Vector3(0, 5, 0);
let timeSinceLastSafe = 0;
let prevGroundHeight = 0;

// Boost variables
let isBoosting = false;
let boostTimer = 0;
let boostDuration = 2.0;

// Input states
let moveForward = false;
let moveBackward = false;
let rotateLeft = false;
let rotateRight = false;

let prevTime = performance.now();

init();
animate();

function init() {
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x87ceeb);
    scene.fog = new THREE.Fog(0x87ceeb, 0, 1000);

    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 2000);

    const hemiLight = new THREE.HemisphereLight(0xeeeeff, 0x777788, 0.75);
    hemiLight.position.set(0.5, 1, 0.75);
    scene.add(hemiLight);

    const dirLight = new THREE.DirectionalLight(0xffffff, 1);
    dirLight.position.set(50, 200, 100);
    dirLight.castShadow = true;
    dirLight.shadow.camera.left = -100;
    dirLight.shadow.camera.right = 100;
    dirLight.shadow.camera.top = 100;
    dirLight.shadow.camera.bottom = -100;
    dirLight.shadow.mapSize.width = 2048;
    dirLight.shadow.mapSize.height = 2048;
    scene.add(dirLight);

    createCourse();
    createBike();

    const instructions = document.getElementById('instructions');
    document.addEventListener('click', function () {
        instructions.style.display = 'none';
        document.body.requestPointerLock();
    });

    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('keyup', onKeyUp);

    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true;
    document.body.appendChild(renderer.domElement);

    window.addEventListener('resize', onWindowResize);
}

function createBike() {
    bikeGroup = new THREE.Group();

    // 1. Frame
    const frameGeo = new THREE.BoxGeometry(1.0, 0.5, 2.5);
    const frameMat = new THREE.MeshStandardMaterial({ color: 0x222222 });
    const frame = new THREE.Mesh(frameGeo, frameMat);
    frame.castShadow = true;
    frame.position.y = 0.5;
    bikeGroup.add(frame);

    // 2. Wheels
    const wheelGeo = new THREE.CylinderGeometry(0.6, 0.6, 0.4, 32);
    const wheelMat = new THREE.MeshStandardMaterial({ color: 0x111111 });

    const wheels = [
        { x: -0.8, z: -1.2 }, { x: 0.8, z: -1.2 },
        { x: -0.8, z: 1.2 }, { x: 0.8, z: 1.2 }
    ];

    wheels.forEach(pos => {
        const w = new THREE.Mesh(wheelGeo, wheelMat);
        w.rotation.z = Math.PI / 2;
        w.position.set(pos.x, 0.6, pos.z);
        w.castShadow = true;
        bikeGroup.add(w);
    });

    // 3. Roblox Noob Avatar
    // Legs (Green)
    const legGeo = new THREE.BoxGeometry(0.4, 0.8, 0.4);
    const legMat = new THREE.MeshStandardMaterial({ color: 0x00FF00 });

    const leftLeg = new THREE.Mesh(legGeo, legMat);
    leftLeg.position.set(-0.25, 1.2, 0);
    leftLeg.castShadow = true;
    bikeGroup.add(leftLeg);

    const rightLeg = new THREE.Mesh(legGeo, legMat);
    rightLeg.position.set(0.25, 1.2, 0);
    rightLeg.castShadow = true;
    bikeGroup.add(rightLeg);

    // Torso (Blue)
    const torsoGeo = new THREE.BoxGeometry(1.0, 1.0, 0.5);
    const torsoMat = new THREE.MeshStandardMaterial({ color: 0x0000FF });
    const torso = new THREE.Mesh(torsoGeo, torsoMat);
    torso.position.set(0, 2.1, 0);
    torso.castShadow = true;
    bikeGroup.add(torso);

    // Head (Yellow)
    const headGeo = new THREE.BoxGeometry(0.6, 0.6, 0.6);
    const headMat = new THREE.MeshStandardMaterial({ color: 0xFFFF00 });
    const head = new THREE.Mesh(headGeo, headMat);
    head.position.set(0, 2.9, 0);
    head.castShadow = true;
    bikeGroup.add(head);

    // Arms (Yellow)
    const armGeo = new THREE.BoxGeometry(0.3, 0.9, 0.3);
    const armMat = new THREE.MeshStandardMaterial({ color: 0xFFFF00 });

    const leftArm = new THREE.Mesh(armGeo, armMat);
    leftArm.position.set(-0.7, 2.1, 0);
    leftArm.castShadow = true;
    bikeGroup.add(leftArm);

    const rightArm = new THREE.Mesh(armGeo, armMat);
    rightArm.position.set(0.7, 2.1, 0);
    rightArm.castShadow = true;
    bikeGroup.add(rightArm);


    // Camera
    camera.position.set(0, 5, 10);
    camera.lookAt(0, 2, 0);

    bikeGroup.add(camera);
    bikeGroup.position.set(0, 5, 0);
    scene.add(bikeGroup);

    raycaster = new THREE.Raycaster();
}

function createCourse() {
    obstacles = [];
    boostPads = [];

    // Roblox-style Plastic Materials
    const matRed = new THREE.MeshStandardMaterial({ color: 0xFF0000, roughness: 0.3, metalness: 0.1 });
    const matBlue = new THREE.MeshStandardMaterial({ color: 0x0000FF, roughness: 0.3, metalness: 0.1 });
    const matGreen = new THREE.MeshStandardMaterial({ color: 0x00FF00, roughness: 0.3, metalness: 0.1 });
    const matYellow = new THREE.MeshStandardMaterial({ color: 0xFFFF00, roughness: 0.3, metalness: 0.1 });
    const matWhite = new THREE.MeshStandardMaterial({ color: 0xFFFFFF, roughness: 0.3, metalness: 0.1 });
    const matBoost = new THREE.MeshStandardMaterial({ color: 0xFFA500, emissive: 0xFF4400, emissiveIntensity: 0.6 });

    const grassMaterial = new THREE.MeshStandardMaterial({ color: 0x55aa55 });

    const groundGeo = new THREE.PlaneGeometry(5000, 5000);
    const ground = new THREE.Mesh(groundGeo, grassMaterial);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -50; // Far below
    ground.receiveShadow = true;
    scene.add(ground);

    let currentPos = new THREE.Vector3(0, 0, 0);
    let currentDir = new THREE.Vector3(0, 0, -1);

    // Helper Functions
    function addBox(length, width, height, material, slope = 0) {
        // Calculate center based on currentPos being the *start* of the segment
        // We want the box to extend 'length' along currentDir.

        const halfLen = length / 2;
        const center = currentPos.clone().add(currentDir.clone().multiplyScalar(halfLen));

        // Slope adjustment
        const dy = Math.sin(slope) * length;
        center.y += dy / 2;

        const geo = new THREE.BoxGeometry(width, height, length);
        const mesh = new THREE.Mesh(geo, material);
        mesh.position.copy(center);

        // Rotation
        mesh.rotation.y = Math.atan2(currentDir.x, currentDir.z);
        mesh.rotation.x = -slope;

        mesh.castShadow = true;
        mesh.receiveShadow = true;
        scene.add(mesh);
        obstacles.push(mesh);

        // Return object for special tagging (boost)
        const obj = mesh;

        // Update currentPos to end of segment
        currentPos.add(currentDir.clone().multiplyScalar(length));
        currentPos.y += dy;

        return obj;
    }

    function turn(angleDegrees) {
        const axis = new THREE.Vector3(0, 1, 0);
        const angle = THREE.MathUtils.degToRad(angleDegrees);
        currentDir.applyAxisAngle(axis, angle);
    }

    function addGap(length) {
        currentPos.add(currentDir.clone().multiplyScalar(length));
    }

    // === OBBY STAGE 1: THE START ===
    // Safe zone
    addBox(20, 20, 2, matGreen);

    // === STAGE 2: THE DROP ===
    // Steep red ramp
    addBox(60, 10, 2, matRed, -0.5); // Downhill

    // Recovery platform
    addBox(30, 15, 2, matBlue);

    // === STAGE 3: THE BALANCE BEAM ===
    // Narrow yellow beam
    turn(20);
    addBox(50, 4, 1, matYellow); // 4 wide is risky but doable

    turn(-40);
    addBox(50, 3, 1, matYellow); // 3 wide, harder

    // === STAGE 4: ISLAND HOPS ===
    // Platform
    turn(20);
    addBox(20, 10, 2, matGreen);

    // Gap 1
    addGap(15);
    addBox(15, 10, 2, matBlue);

    // Gap 2 (Higher)
    addGap(15);
    currentPos.y += 5; // Step up
    addBox(15, 10, 2, matRed);

    // Gap 3 (Long)
    addGap(25);
    currentPos.y -= 2; // Step down
    addBox(20, 10, 2, matGreen);

    // === STAGE 5: MEGA RAMP ===
    // Run up
    addBox(40, 10, 2, matWhite);

    // Boost Pad
    const pad = addBox(20, 10, 2, matBoost);
    boostPads.push(pad);

    // Ramp
    addBox(60, 10, 2, matRed, 0.5); // Steep up

    // Big Air Gap
    addGap(80);

    // Landing Zone
    currentPos.y -= 10;
    addBox(60, 30, 5, matBlue, -0.1);

    // Winner Podium
    addBox(30, 30, 10, matYellow);
}

function createBoxRotated(x, y, z, w, h, d, material, rotY, rotX) {
    // Deprecated by internal helper but keeping signature if needed
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

    // Boost Logic
    let currentMaxSpeed = maxSpeed;
    let currentAccel = acceleration;

    if (isBoosting) {
        currentMaxSpeed = maxSpeed * 2.5;
        currentAccel = acceleration * 3;
        boostTimer -= dt;
        if (boostTimer <= 0) {
            isBoosting = false;
        }
    }

    if (moveForward) {
        speed += currentAccel;
    } else if (moveBackward) {
        speed -= currentAccel;
    } else {
        if (speed > 0) speed = Math.max(0, speed - friction);
        if (speed < 0) speed = Math.min(0, speed + friction);
    }

    if (speed > currentMaxSpeed) speed = currentMaxSpeed;
    if (speed < -currentMaxSpeed / 2) speed = -currentMaxSpeed / 2;

    // Handle Rotation (Allowed always for arcade feel / air control)
    if (rotateLeft) bikeGroup.rotation.y += turnSpeed;
    if (rotateRight) bikeGroup.rotation.y -= turnSpeed;

    // Bank angle
    const targetBank = (rotateLeft ? 0.3 : (rotateRight ? -0.3 : 0));
    bikeGroup.rotation.z = THREE.MathUtils.lerp(bikeGroup.rotation.z, targetBank, 0.1);

    const forwardX = -Math.sin(bikeGroup.rotation.y);
    const forwardZ = -Math.cos(bikeGroup.rotation.y);

    const nextX = bikeGroup.position.x + forwardX * speed * 60 * dt;
    const nextZ = bikeGroup.position.z + forwardZ * speed * 60 * dt;

    bikeGroup.position.x = nextX;
    bikeGroup.position.z = nextZ;

    // Physics Check
    const rayOrigin = bikeGroup.position.clone();
    rayOrigin.y += 5;

    raycaster.set(rayOrigin, new THREE.Vector3(0, -1, 0));
    const intersects = raycaster.intersectObjects(obstacles);

    let groundHeight = -100;
    let isOverCourse = false;
    let groundObject = null;

    if (intersects.length > 0) {
        groundHeight = intersects[0].point.y;
        groundObject = intersects[0].object;
        isOverCourse = true;
    }

    const playerHeight = 1.0;

    if (bikeGroup.position.y > groundHeight + playerHeight + 0.1) {
        // Air
        verticalVelocity -= gravity * dt * 50;
        isGrounded = false;
    } else {
        // Ground
        isGrounded = true;

        // Calculate vertical boost from slope
        if (Math.abs(speed) > 0.1) {
             const dy = groundHeight - prevGroundHeight;
             const climbRate = dy / dt;

             if (climbRate > 0) {
                 verticalVelocity = climbRate;
             } else {
                 verticalVelocity = 0;
             }
        } else {
             verticalVelocity = 0;
        }

        bikeGroup.position.y = groundHeight + playerHeight;
        prevGroundHeight = groundHeight;

        if (boostPads.includes(groundObject)) {
            isBoosting = true;
            boostTimer = boostDuration;
        }
    }

    bikeGroup.position.y += verticalVelocity * dt;

    if (isGrounded && isOverCourse) {
        timeSinceLastSafe += dt;
        if (timeSinceLastSafe > 0.5) {
            lastSafePosition.copy(bikeGroup.position);
            lastSafePosition.y += 2;
            timeSinceLastSafe = 0;
        }
    } else {
        timeSinceLastSafe = 0;
    }

    if (bikeGroup.position.y < -30) {
        bikeGroup.position.copy(lastSafePosition);
        speed = 0;
        verticalVelocity = 0;
        bikeGroup.rotation.set(0, bikeGroup.rotation.y, 0);
    }

    prevTime = time;
    renderer.render(scene, camera);
}
