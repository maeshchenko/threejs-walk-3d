// src/index.js
import * as THREE from 'three';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import './styles.css';

import idleURL from './models/character_idle.fbx';
import walkURL from './models/character_walk.fbx';
import startURL from './models/character_start.fbx';
import stopURL from './models/character_stop.fbx';

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xa0a0a0);

const camera = new THREE.PerspectiveCamera(
    75, window.innerWidth / window.innerHeight, 0.1, 1000
);
camera.position.set(0, 5, 15);
camera.lookAt(0, 0, 0);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.appendChild(renderer.domElement);

const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
scene.add(ambientLight);

const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
directionalLight.position.set(10, 20, 10);
directionalLight.castShadow = true;
directionalLight.shadow.mapSize.width = 1024;
directionalLight.shadow.mapSize.height = 1024;
directionalLight.shadow.camera.near = 0.5;
directionalLight.shadow.camera.far = 50;
scene.add(directionalLight);

const pointLight = new THREE.PointLight(0xffffff, 1);
pointLight.position.set(-10, 10, -10);
scene.add(pointLight);

const planeGeometry = new THREE.PlaneGeometry(1000, 1000);
const planeMaterial = new THREE.MeshPhongMaterial({ color: 0x808080, depthWrite: false });
const plane = new THREE.Mesh(planeGeometry, planeMaterial);
plane.rotation.x = -Math.PI / 2;
plane.receiveShadow = true;
scene.add(plane);

const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 1, 0);
controls.update();

const axesHelper = new THREE.AxesHelper(5);
scene.add(axesHelper);

const gridHelper = new THREE.GridHelper(100, 100);
scene.add(gridHelper);

const keysPressed = {};
const velocity = new THREE.Vector3();
const speed = 2.5;

window.addEventListener('keydown', (event) => {
    keysPressed[event.key] = true;
});

window.addEventListener('keyup', (event) => {
    keysPressed[event.key] = false;
});

function handleMovement(delta) {
    velocity.set(0, 0, 0);
    let moving = false;

    if (keysPressed['ArrowUp'] || keysPressed['w'] || keysPressed['W']) {
        velocity.z -= 0.5;
        moving = true;
    }
    if (keysPressed['ArrowDown'] || keysPressed['s'] || keysPressed['S']) {
        velocity.z += 0.5;
        moving = true;
    }
    if (keysPressed['ArrowLeft'] || keysPressed['a'] || keysPressed['A']) {
        velocity.x -= 1;
        moving = true;
    }
    if (keysPressed['ArrowRight'] || keysPressed['d'] || keysPressed['D']) {
        velocity.x += 1;
        moving = true;
    }

    if (moving) {
        velocity.normalize().multiplyScalar(speed * delta);
        model.position.add(velocity);

        const angle = Math.atan2(velocity.x, velocity.z);
        model.rotation.y = angle;

        if (mixer) {
            playAction('walk');
        }
    } else {
        if (mixer) {
            playAction('stop');
        }
    }
}

let activeAction;
let previousAction;
const actions = {};

function playAction(name) {
    previousAction = activeAction;
    activeAction = actions[name];

    if (previousAction !== activeAction) {
        if (previousAction) {
            previousAction.fadeOut(0.5);
        }
        if (activeAction) {
            activeAction.reset().fadeIn(0.5).play();
        }
    }
}

const loader = new FBXLoader();
let mixer;
let model;
const clock = new THREE.Clock();

loader.load(
    idleURL,
    (fbx) => {
        fbx.scale.set(1, 1, 1);
        fbx.position.set(0, 0, 0);
        fbx.traverse((child) => {
            if (child.isMesh) {
                child.castShadow = true;
                child.receiveShadow = true;
            }
        });

        scene.add(fbx);
        model = fbx;

        mixer = new THREE.AnimationMixer(fbx);

        loader.load(
            walkURL,
            (walkFbx) => {
                const walkAction = mixer.clipAction(walkFbx.animations[0]);
                walkAction.setLoop(THREE.LoopRepeat, Infinity);
                actions['walk'] = walkAction;
            },
            undefined,
            (error) => {
                console.error('Ошибка загрузки анимации walk:', error);
            }
        );

        loader.load(
            startURL,
            (startFbx) => {
                const startAction = mixer.clipAction(startFbx.animations[0]);
                startAction.setLoop(THREE.LoopOnce, 1);
                startAction.clampWhenFinished = true;
                actions['start'] = startAction;
            },
            undefined,
            (error) => {
                console.error('Ошибка загрузки анимации start:', error);
            }
        );

        loader.load(
            stopURL,
            (stopFbx) => {
                const stopAction = mixer.clipAction(stopFbx.animations[0]);
                stopAction.setLoop(THREE.LoopOnce, 1);
                stopAction.clampWhenFinished = true;
                actions['stop'] = stopAction;

                stopAction.onFinished = () => {
                    playAction('idle');
                };
            },
            undefined,
            (error) => {
                console.error('Ошибка загрузки анимации stop:', error);
            }
        );

        const idleAction = mixer.clipAction(fbx.animations[0]);
        idleAction.play();
        actions['idle'] = idleAction;
    },
    (xhr) => {
        console.log(`${(xhr.loaded / xhr.total * 100).toFixed(2)}% загружено`);
    },
    (error) => {
        console.error('Ошибка загрузки модели:', error);
    }
);

window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});

function animate() {
    requestAnimationFrame(animate);

    const delta = clock.getDelta();

    if (mixer) mixer.update(delta);

    handleMovement(delta);

    renderer.render(scene, camera);
}

animate();
