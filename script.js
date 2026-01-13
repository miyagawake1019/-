import * as THREE from 'three';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';

let camera, scene, renderer;
let bike, bikeGroup;
let raycaster;
let obstacles = [];
let boostPads = []; // Array to store boost pad objects

// Physics variables
let speed = 0;
let maxSpeed = 3.0;
let acceleration = 0.05;
let friction = 0.02;
let turnSpeed = 0.05;
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

    const frameGeo = new THREE.BoxGeometry(1.5, 0.5, 3);
    const frameMat = new THREE.MeshStandardMaterial({ color: 0xff0000 });
    const frame = new THREE.Mesh(frameGeo, frameMat);
    frame.castShadow = true;
    frame.position.y = 0.5;
    bikeGroup.add(frame);

    const wheelGeo = new THREE.CylinderGeometry(0.6, 0.6, 0.4, 32);
    const wheelMat = new THREE.MeshStandardMaterial({ color: 0x111111 });

    const wheels = [
        { x: -1, z: -1.2 }, { x: 1, z: -1.2 },
        { x: -1, z: 1.2 }, { x: 1, z: 1.2 }
    ];

    wheels.forEach(pos => {
        const w = new THREE.Mesh(wheelGeo, wheelMat);
        w.rotation.z = Math.PI / 2;
        w.position.set(pos.x, 0.6, pos.z);
        w.castShadow = true;
        bikeGroup.add(w);
    });

    const riderGeo = new THREE.BoxGeometry(0.8, 1.2, 0.8);
    const riderMat = new THREE.MeshStandardMaterial({ color: 0x0000ff });
    const rider = new THREE.Mesh(riderGeo, riderMat);
    rider.position.set(0, 1.6, 0);
    bikeGroup.add(rider);

    camera.position.set(0, 5, 12);
    camera.lookAt(0, 2, 0);

    bikeGroup.add(camera);
    bikeGroup.position.set(0, 5, 0);
    scene.add(bikeGroup);

    raycaster = new THREE.Raycaster();
}

function createCourse() {
    obstacles = [];
    boostPads = [];

    const roadColor = 0x333333;
    const roadMaterial = new THREE.MeshStandardMaterial({ color: roadColor });
    const boostMaterial = new THREE.MeshStandardMaterial({ color: 0xffaa00, emissive: 0xff4400, emissiveIntensity: 0.5 });
    const startLineMaterial = new THREE.MeshStandardMaterial({ color: 0xffffff });
    const grassMaterial = new THREE.MeshStandardMaterial({ color: 0x55aa55 });

    const groundGeo = new THREE.PlaneGeometry(5000, 5000);
    const ground = new THREE.Mesh(groundGeo, grassMaterial);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -20;
    ground.receiveShadow = true;
    scene.add(ground);

    let currentPos = new THREE.Vector3(0, 0, 0);
    let currentDir = new THREE.Vector3(0, 0, -1);
    const trackWidth = 25;

    function addSegment(length, slope = 0, isBoost = false, isStart = false) {
        const segCenter = currentPos.clone().add(currentDir.clone().multiplyScalar(length / 2));
        const dy = Math.sin(slope) * length;
        segCenter.y += dy / 2;

        const mat = isStart ? startLineMaterial : (isBoost ? boostMaterial : roadMaterial);

        // Note: -slope for X rotation makes the local Z tip UP.
        // With currentDir facing -Z (North), PI rotation Y aligns local Z to North.
        // So the ramp goes UP towards North. Correct.
        const box = createBoxRotated(
            segCenter.x, segCenter.y, segCenter.z,
            trackWidth, 2, length,
            mat,
            Math.atan2(currentDir.x, currentDir.z),
            -slope
        );

        if (isBoost) boostPads.push(box);

        currentPos.add(currentDir.clone().multiplyScalar(length));
        currentPos.y += dy;
        return box;
    }

    function turn(angleDegrees) {
        const axis = new THREE.Vector3(0, 1, 0);
        const angle = THREE.MathUtils.degToRad(angleDegrees);
        currentDir.applyAxisAngle(axis, angle);
    }

    function addGap(length) {
        currentPos.add(currentDir.clone().multiplyScalar(length));
    }

    // --- Course Design ---
    addSegment(20, 0, false, true);
    addSegment(100);
    addSegment(30, 0, true);
    addSegment(100, 0.4);

    turn(45);
    addSegment(50);
    turn(45);
    addSegment(50);

    turn(10);
    addSegment(100, -0.5, true);

    // Jump Section
    // Ramp up (Kicker). Made it slightly longer and steeper for better launch feel with new physics.
    addSegment(30, 0.4);
    addGap(40); // The gap

    // Landing. Started slightly lower (-2) to help catching the landing.
    currentPos.y -= 2;
    addSegment(50, -0.1);

    turn(-90);
    addSegment(40);
    turn(-90);
    addSegment(40);
    turn(-90);
    addSegment(40);
    turn(-90);

    addSegment(60);
    turn(30);
    addSegment(60);
    turn(-60);
    addSegment(60);
    turn(30);
    addSegment(60);

    addSegment(50, 0, true);
    addSegment(50, 0, false, true);
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

    if (speed !== 0) {
        if (rotateLeft) bikeGroup.rotation.y += turnSpeed;
        if (rotateRight) bikeGroup.rotation.y -= turnSpeed;

        const targetBank = (rotateLeft ? 0.3 : (rotateRight ? -0.3 : 0));
        bikeGroup.rotation.z = THREE.MathUtils.lerp(bikeGroup.rotation.z, targetBank, 0.1);
    }

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
        // If we are moving forward, check the height difference
        if (Math.abs(speed) > 0.1) {
             const dy = groundHeight - prevGroundHeight;
             // If dy is positive and large, we are ramping up.
             // Impart this as vertical velocity.
             // We smooth it slightly or just take it if it's an upward launch?
             // Actually, while on ground, our vertical velocity IS the rate of climb.
             // V_y = dy / dt.
             const climbRate = dy / dt;

             // If we are climbing, set positive verticalVelocity so if we lose ground we fly.
             if (climbRate > 0) {
                 verticalVelocity = climbRate;
             } else {
                 verticalVelocity = 0; // Don't carry downward momentum into a fall unless gravity does it
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

    if (bikeGroup.position.y < -10) {
        bikeGroup.position.copy(lastSafePosition);
        speed = 0;
        verticalVelocity = 0;
        bikeGroup.rotation.set(0, bikeGroup.rotation.y, 0);
    }

    prevTime = time;
    renderer.render(scene, camera);
}
