import * as THREE from 'three';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';

let camera, scene, renderer, controls;
const objects = [];
let raycaster;

let moveForward = false;
let moveBackward = false;
let rotateLeft = false;
let rotateRight = false;
let canJump = false;

let prevTime = performance.now();
const velocity = new THREE.Vector3();
const direction = new THREE.Vector3();

init();
animate();

function init() {

    // Camera setup
    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 1, 1000);
    camera.position.y = 20;

    // Scene setup
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x87ceeb);
    scene.fog = new THREE.Fog(0x87ceeb, 0, 750);

    // Lights
    const hemiLight = new THREE.HemisphereLight(0xeeeeff, 0x777788, 0.75);
    hemiLight.position.set(0.5, 1, 0.75);
    scene.add(hemiLight);

    const dirLight = new THREE.DirectionalLight(0xffffff, 1);
    dirLight.position.set(50, 200, 100);
    dirLight.castShadow = true;
    scene.add(dirLight);

    // Controls
    controls = new PointerLockControls(camera, document.body);

    document.addEventListener('keydown', function (event) {
        if (event.code === 'Enter') {
            controls.lock();
        }
    });

    // Lock on any click
    document.addEventListener('click', function () {
        controls.lock();
    });

    scene.add(controls.getObject());

    // Input handling
    const onKeyDown = function (event) {
        switch (event.code) {
            case 'ArrowUp':
            case 'KeyW': moveForward = true; break;
            case 'ArrowLeft':
            case 'KeyA': rotateLeft = true; break;
            case 'ArrowDown':
            case 'KeyS': moveBackward = true; break;
            case 'ArrowRight':
            case 'KeyD': rotateRight = true; break;
            case 'Space':
                attack();
                break;
        }

        // Jump Check: Up Arrow + Down Arrow (Simultaneous)
        if (moveForward && moveBackward && canJump) {
            velocity.y += 350;
            canJump = false;
        }
    };

    const onKeyUp = function (event) {
        switch (event.code) {
            case 'ArrowUp':
            case 'KeyW': moveForward = false; break;
            case 'ArrowLeft':
            case 'KeyA': rotateLeft = false; break;
            case 'ArrowDown':
            case 'KeyS': moveBackward = false; break;
            case 'ArrowRight':
            case 'KeyD': rotateRight = false; break;
        }
    };

    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('keyup', onKeyUp);

    // World Generation
    const boxGeometry = new THREE.BoxGeometry(5, 5, 5);
    const boxMaterial = new THREE.MeshLambertMaterial({ color: 0x55aa55 }); // Grass
    const stoneMaterial = new THREE.MeshLambertMaterial({ color: 0x808080 }); // Stone

    // Floor
    for (let x = -20; x < 20; x++) {
        for (let z = -20; z < 20; z++) {
            const material = Math.random() > 0.9 ? stoneMaterial : boxMaterial;
            const box = new THREE.Mesh(boxGeometry, material);
            box.position.set(x * 5, 2.5, z * 5);
            scene.add(box);
            objects.push(box);
        }
    }

    // Raycaster for physics
    raycaster = new THREE.Raycaster(new THREE.Vector3(), new THREE.Vector3(0, -1, 0), 0, 10);

    // Renderer
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true;
    document.body.appendChild(renderer.domElement);

    // Event listeners
    window.addEventListener('resize', onWindowResize);
    document.addEventListener('mousedown', onMouseDown);
}

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

function attack() {
    if (!controls.isLocked) return;

    // Raycast from camera center
    const mouseRaycaster = new THREE.Raycaster();
    mouseRaycaster.setFromCamera(new THREE.Vector2(), camera);

    const intersects = mouseRaycaster.intersectObjects(objects);

    if (intersects.length > 0) {
        const intersect = intersects[0];
        if (intersect.distance > 30) return;

        scene.remove(intersect.object);
        objects.splice(objects.indexOf(intersect.object), 1);
    }
}

function onMouseDown(event) {
    if (!controls.isLocked) return;

    // Only Right Click (2) places block. Left Click (0) is disabled (Attack is Space).
    if (event.button === 2) {
        const mouseRaycaster = new THREE.Raycaster();
        mouseRaycaster.setFromCamera(new THREE.Vector2(), camera);
        const intersects = mouseRaycaster.intersectObjects(objects);

        if (intersects.length > 0) {
            const intersect = intersects[0];
            if (intersect.distance > 30) return;

            const voxel = new THREE.Mesh(intersect.object.geometry, intersect.object.material);
            voxel.position.copy(intersect.point).add(intersect.face.normal);
            voxel.position.divideScalar(5).floor().multiplyScalar(5).addScalar(2.5);
            scene.add(voxel);
            objects.push(voxel);
        }
    }
}

function animate() {
    requestAnimationFrame(animate);

    const time = performance.now();

    if (controls.isLocked === true) {
        const delta = (time - prevTime) / 1000;

        velocity.x -= velocity.x * 10.0 * delta;
        velocity.z -= velocity.z * 10.0 * delta;
        velocity.y -= 9.8 * 100.0 * delta; // Gravity

        // Rotation
        if (rotateLeft) {
            controls.getObject().rotation.y += 2.0 * delta;
        }
        if (rotateRight) {
            controls.getObject().rotation.y -= 2.0 * delta;
        }

        direction.z = Number(moveForward) - Number(moveBackward);
        // direction.x = Number(moveRight) - Number(moveLeft); // Strafe removed
        direction.normalize();

        if (moveForward || moveBackward) velocity.z -= direction.z * 400.0 * delta;
        // if (moveLeft || moveRight) velocity.x -= direction.x * 400.0 * delta; // Strafe removed

        // controls.moveRight(-velocity.x * delta); // Strafe removed
        controls.moveForward(-velocity.z * delta);
        controls.getObject().position.y += (velocity.y * delta);

        // Ground Check
        raycaster.ray.origin.copy(controls.getObject().position);
        const intersections = raycaster.intersectObjects(objects, false);
        const onObject = intersections.length > 0;

        if (onObject) {
            const dist = intersections[0].distance;
            // 10 units eye height
            if (dist <= 10 && velocity.y <= 0) {
                velocity.y = 0;
                canJump = true;
                controls.getObject().position.y = intersections[0].point.y + 10;
            }
        }

        // Fall off world check
        if (controls.getObject().position.y < -100) {
            velocity.y = 0;
            controls.getObject().position.set(0, 20, 0);
        }
    }

    prevTime = time;

    renderer.render(scene, camera);
}
