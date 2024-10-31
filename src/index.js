// src/index.js

// === Импорты ===
import * as THREE from 'three';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { AudioListener, Audio, AudioLoader } from 'three';
import './styles.css';

// Импорт моделей персонажа
import idleURL from './models/character_idle.fbx';
import walkURL from './models/character_idle.fbx'; // Убедитесь, что путь корректен
import startURL from './models/character_start.fbx';
import stopURL from './models/character_stop.fbx';

// Импорт победной музыки
import victoryMusicURL from './sounds/victory_music.mp3';

// Импортируем PNG-изображение
import wallImageURL from './textures/wall_image.png';

// === Константы ===
const CHARACTER_SCALE = 1;
const COLLISION_RADIUS = 0.4;
const MAZE_COLS = 4;
const MAZE_ROWS = 4;
const CELL_SIZE = 2;
const WALL_SPACING = 5;
const SPEED = 6;
const ROTATION_SPEED = Math.PI;

const WALL_HEIGHT = 8;
const THIRD_PERSON_CAMERA_OFFSET = new THREE.Vector3(0, 5, -5);

const CAMERA_MODES = {
    FREE: 'free',
    THIRD_PERSON: 'thirdPerson'
};

const MAX_POINTS = 5000;

// === Глобальные переменные ===
let scene, camera, renderer, controls, mixer, model;
let wallsList = [];
let wallBoxes = [];
let allWalls = [];
let finishSphere, victoryMusic;
let keysPressed = {};
const clockMain = new THREE.Clock();
let currentCameraMode = CAMERA_MODES.THIRD_PERSON;

// Переменные для следа
let trailPositions;
let trailGeometry;
let trailLine;
let lastTrailPosition = new THREE.Vector3();
let trailPointIndex = 0;

// Переменные для таймера
let timerElement, bestTimeElement;
let startTime = null;
let elapsedTime = 0;
let bestTime = null;
let gameCompleted = false;

// Переменные для паузы
let isPaused = false;
let pauseOverlay;

// === Вспомогательные функции ===

// Функция создания стены
const createWall = (x, y, z, width, height, depth, material, scene, walls, wallBoxes, rotationY = 0) => {
    const geometry = new THREE.BoxGeometry(width, height, depth);
    const wall = new THREE.Mesh(geometry, material);
    wall.position.set(x, y + height / 2, z);
    wall.rotation.y = rotationY;
    wall.castShadow = true;
    wall.receiveShadow = true;
    scene.add(wall);
    walls.push(wall);
    const box = new THREE.Box3().setFromObject(wall);
    wallBoxes.push(box);

    wall.userData = {
        width: width,
        height: height,
        depth: depth,
        rotationY: rotationY
    };

    return wall;
};

// Функция генерации лабиринта
const generateMaze = (cols, rows) => {
    const grid = [];
    for (let y = 0; y < rows; y++) {
        const row = [];
        for (let x = 0; x < cols; x++) {
            row.push({ x, y, walls: { top: true, right: true, bottom: true, left: true }, visited: false });
        }
        grid.push(row);
    }

    const stack = [];

    const centerX = Math.floor(cols / 2);
    const centerY = Math.floor(rows / 2);
    const current = grid[centerY][centerX];
    current.visited = true;
    stack.push(current);

    while (stack.length > 0) {
        const currentCell = stack.pop();
        const neighbors = [];

        const { x, y } = currentCell;

        if (y > 0 && !grid[y - 1][x].visited) neighbors.push(grid[y - 1][x]);
        if (x < cols - 1 && !grid[y][x + 1].visited) neighbors.push(grid[y][x + 1]);
        if (y < rows - 1 && !grid[y + 1][x].visited) neighbors.push(grid[y + 1][x]);
        if (x > 0 && !grid[y][x - 1].visited) neighbors.push(grid[y][x - 1]);

        if (neighbors.length > 0) {
            stack.push(currentCell);
            const next = neighbors[Math.floor(Math.random() * neighbors.length)];
            next.visited = true;
            stack.push(next);

            if (next.x === currentCell.x && next.y === currentCell.y - 1) {
                currentCell.walls.top = false;
                next.walls.bottom = false;
            }
            if (next.x === currentCell.x + 1 && next.y === currentCell.y) {
                currentCell.walls.right = false;
                next.walls.left = false;
            }
            if (next.x === currentCell.x && next.y === currentCell.y + 1) {
                currentCell.walls.bottom = false;
                next.walls.top = false;
            }
            if (next.x === currentCell.x - 1 && next.y === currentCell.y) {
                currentCell.walls.left = false;
                next.walls.right = false;
            }
        }
    }

    grid[centerY][centerX].walls.top = false;
    grid[centerY][centerX].walls.bottom = false;

    return grid;
};

// === Инициализация сцены и основных компонентов ===

const initScene = () => {
    // Создание сцены
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0xa0a0a0);

    // Создание камеры
    camera = new THREE.PerspectiveCamera(
        75, window.innerWidth / window.innerHeight, 0.1, 1000
    );
    camera.position.copy(THIRD_PERSON_CAMERA_OFFSET);

    // Создание рендерера
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    document.body.appendChild(renderer.domElement);

    // Добавление освещения
    addLights();

    // Создание плоскости
    addPlane();

    // Инициализация линии следа
    initTrail();

    // Инициализация контролов
    initControls();

    // Добавление помощников
    addHelpers();

    // Создание финишного шарика
    createFinishSphere();

    // Загрузка и настройка победной музыки
    initAudio();

    // Генерация лабиринта
    generateAndCreateMaze();

    // Загрузка персонажа
    loadCharacter();

    // Создание элементов таймера
    createTimerElements();

    // Создание элементов паузы
    createPauseOverlay();

    // Добавление обработчиков событий
    addEventListeners();
};

// === Функции добавления компонентов в сцену ===

// Функция добавления освещения
const addLights = () => {
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
};

// Функция добавления плоскости
const addPlane = () => {
    const planeGeometry = new THREE.PlaneGeometry(1000, 1000);
    const planeMaterial = new THREE.MeshPhongMaterial({ color: 0x808080, depthWrite: false });
    const plane = new THREE.Mesh(planeGeometry, planeMaterial);
    plane.rotation.x = -Math.PI / 2;
    plane.receiveShadow = true;
    scene.add(plane);
};

// Функция инициализации линии следа
const initTrail = () => {
    trailPositions = new Float32Array(MAX_POINTS * 3);
    trailGeometry = new THREE.BufferGeometry();
    trailGeometry.setAttribute('position', new THREE.BufferAttribute(trailPositions, 3));
    const trailMaterial = new THREE.LineBasicMaterial({ color: 0xff0000 });
    trailLine = new THREE.Line(trailGeometry, trailMaterial);
    trailLine.frustumCulled = false;
    scene.add(trailLine);
};

// Функция инициализации контролов
const initControls = () => {
    controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(0, 1, 0);
    controls.enabled = false;
    controls.update();
};

// Функция добавления помощников
const addHelpers = () => {
    const axesHelper = new THREE.AxesHelper(5);
    scene.add(axesHelper);

    const gridHelper = new THREE.GridHelper(100, 100);
    scene.add(gridHelper);
};

// Функция создания финишного шарика
const createFinishSphere = () => {
    const finishSphereGeometry = new THREE.SphereGeometry(0.5, 32, 32);
    const finishSphereMaterial = new THREE.MeshBasicMaterial({ color: 0xff0000 });
    finishSphere = new THREE.Mesh(finishSphereGeometry, finishSphereMaterial);
    finishSphere.position.set(0, 0.5, 0);
    finishSphere.castShadow = true;
    finishSphere.receiveShadow = true;
    scene.add(finishSphere);
};

// Функция инициализации аудио
const initAudio = () => {
    const listener = new THREE.AudioListener();
    camera.add(listener);

    const audioLoader = new AudioLoader();

    victoryMusic = new THREE.Audio(listener);
    audioLoader.load(victoryMusicURL, function(buffer) {
        victoryMusic.setBuffer(buffer);
        victoryMusic.setLoop(false);
        victoryMusic.setVolume(1.0);
    }, undefined, function(err) {
        console.error('Ошибка загрузки победной музыки:', err);
    });

    const resumeAudio = () => {
        if (listener.context.state === 'suspended') {
            listener.context.resume().then(() => {
                console.log('AudioContext resumed');
            });
        }
        window.removeEventListener('click', resumeAudio);
        window.removeEventListener('keydown', resumeAudio);
    };

    window.addEventListener('click', resumeAudio);
    window.addEventListener('keydown', resumeAudio);
};

// === Генерация и создание лабиринта ===

const generateAndCreateMaze = () => {
    // Удаляем предыдущие стены, если они есть
    wallsList.forEach(wall => scene.remove(wall));
    wallsList = [];
    wallBoxes = [];
    allWalls = [];

    const wallMaterialMesh = new THREE.MeshPhongMaterial({ color: 0x0000ff });
    const maze = generateMaze(MAZE_COLS, MAZE_ROWS);

    for (let y = 0; y < MAZE_ROWS; y++) {
        for (let x = 0; x < MAZE_COLS; x++) {
            const cell = maze[y][x];
            const posX = (x - Math.floor(MAZE_COLS / 2)) * CELL_SIZE * WALL_SPACING;
            const posZ = (y - Math.floor(MAZE_ROWS / 2)) * CELL_SIZE * WALL_SPACING;

            if (cell.walls.top) {
                const wall = createWall(
                    posX,
                    0,
                    posZ - (CELL_SIZE * WALL_SPACING) / 2,
                    CELL_SIZE * WALL_SPACING,
                    WALL_HEIGHT,
                    0.2,
                    wallMaterialMesh,
                    scene,
                    wallsList,
                    wallBoxes,
                    0
                );
                allWalls.push(wall);
            }
            if (cell.walls.right) {
                const wall = createWall(
                    posX + (CELL_SIZE * WALL_SPACING) / 2,
                    0,
                    posZ,
                    CELL_SIZE * WALL_SPACING,
                    WALL_HEIGHT,
                    0.2,
                    wallMaterialMesh,
                    scene,
                    wallsList,
                    wallBoxes,
                    Math.PI / 2
                );
                allWalls.push(wall);
            }
            if (cell.walls.bottom) {
                const wall = createWall(
                    posX,
                    0,
                    posZ + (CELL_SIZE * WALL_SPACING) / 2,
                    CELL_SIZE * WALL_SPACING,
                    WALL_HEIGHT,
                    0.2,
                    wallMaterialMesh,
                    scene,
                    wallsList,
                    wallBoxes,
                    0
                );
                allWalls.push(wall);
            }
            if (cell.walls.left) {
                const wall = createWall(
                    posX - (CELL_SIZE * WALL_SPACING) / 2,
                    0,
                    posZ,
                    CELL_SIZE * WALL_SPACING,
                    WALL_HEIGHT,
                    0.2,
                    wallMaterialMesh,
                    scene,
                    wallsList,
                    wallBoxes,
                    Math.PI / 2
                );
                allWalls.push(wall);
            }
        }
    }

    addImageToRandomWall();
};

// Функция добавления изображения на случайную стену
const addImageToRandomWall = () => {
    if (allWalls.length === 0) return;

    const randomIndex = Math.floor(Math.random() * allWalls.length);
    const wall = allWalls[randomIndex];

    const textureLoader = new THREE.TextureLoader();
    textureLoader.load(wallImageURL, (texture) => {
        const pictureMaterial = new THREE.MeshBasicMaterial({ map: texture });

        const pictureWidth = 1.5;
        const pictureHeight = 1;
        const pictureGeometry = new THREE.PlaneGeometry(pictureWidth, pictureHeight);

        const pictureMesh = new THREE.Mesh(pictureGeometry, pictureMaterial);

        const frameThickness = 0.1;
        const frameWidth = pictureWidth + frameThickness * 2;
        const frameHeight = pictureHeight + frameThickness * 2;

        const frameGeometry = new THREE.BoxGeometry(frameWidth, frameHeight, frameThickness);

        const frameMaterial = new THREE.MeshPhongMaterial({ color: 0x8B4513 });

        const frameMesh = new THREE.Mesh(frameGeometry, frameMaterial);

        const paintingGroup = new THREE.Group();
        paintingGroup.add(frameMesh);

        pictureMesh.position.z = frameThickness / 2 + 0.001;
        paintingGroup.add(pictureMesh);

        paintingGroup.position.copy(wall.position);
        paintingGroup.rotation.y = wall.rotation.y;

        paintingGroup.position.y += wall.userData.height * 0;

        const offset = wall.userData.depth / 2 + frameThickness / 2 + 0.01;

        const normal = new THREE.Vector3(0, 0, 1).applyAxisAngle(new THREE.Vector3(0, 1, 0), wall.rotation.y);
        paintingGroup.position.add(normal.multiplyScalar(offset));

        scene.add(paintingGroup);
    });
};

// === Загрузка и настройка персонажа ===

const loadCharacter = () => {
    const loader = new FBXLoader();

    loader.load(
        idleURL,
        (fbx) => {
            fbx.scale.set(CHARACTER_SCALE, CHARACTER_SCALE, CHARACTER_SCALE);

            const entranceX = (-Math.floor(MAZE_COLS / 2)) * CELL_SIZE * WALL_SPACING;
            const entranceZ = (-Math.floor(MAZE_ROWS / 2)) * CELL_SIZE * WALL_SPACING;
            fbx.position.set(entranceX, 0, entranceZ);

            lastTrailPosition.copy(fbx.position);

            fbx.rotation.y = Math.PI;

            const axesHelper = new THREE.AxesHelper(1);
            fbx.add(axesHelper);

            fbx.traverse((child) => {
                if (child.isMesh) {
                    child.castShadow = true;
                    child.receiveShadow = true;
                }
            });

            scene.add(fbx);
            model = fbx;

            mixer = new THREE.AnimationMixer(fbx);

            loadAnimations(loader, fbx);

            // Сброс таймера при загрузке персонажа
            resetTimer();
            startTimer();
            gameCompleted = false;
        },
        (xhr) => {
            console.log(`${(xhr.loaded / xhr.total * 100).toFixed(2)}% загружено`);
        },
        (error) => {
            console.error('Ошибка загрузки модели:', error);
        }
    );
};

// Функция загрузки анимаций персонажа
const loadAnimations = (loader, fbx) => {
    const actions = {};

    loader.load(
        walkURL,
        (walkFbx) => {
            if (walkFbx.animations.length > 0) {
                const walkAction = mixer.clipAction(walkFbx.animations[0]);
                walkAction.setLoop(THREE.LoopRepeat, Infinity);
                actions['walk'] = walkAction;
            } else {
                console.warn('Анимация ходьбы не найдена в character_walk.fbx');
            }
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

            stopAction.addEventListener('finished', () => {
                playAction('idle', actions);
            });
        },
        undefined,
        (error) => {
            console.error('Ошибка загрузки анимации stop:', error);
        }
    );

    if (fbx.animations.length > 0) {
        const idleAction = mixer.clipAction(fbx.animations[0]);
        idleAction.play();
        actions['idle'] = idleAction;
    } else {
        console.warn('Idle анимация не найдена в модели.');
    }

    fbx.userData.actions = actions;
};

// Функция воспроизведения анимации
const playAction = (name, actions) => {
    const currentAction = actions[name];
    if (currentAction) {
        Object.values(actions).forEach(action => {
            if (action !== currentAction) {
                action.fadeOut(0.5);
            }
        });
        currentAction.reset().fadeIn(0.5).play();
    }
};

// === Обработчики событий ===

// Обработчик нажатий клавиш
const onKeyDown = (event) => {
    const key = event.key.toLowerCase();
    keysPressed[key] = true;

    if (key === 'r') {
        restartGame();
    }

    if (key === '1') {
        switchCameraMode(CAMERA_MODES.FREE);
    }
    if (key === '2') {
        switchCameraMode(CAMERA_MODES.THIRD_PERSON);
    }

    if (key === 'p') {
        togglePause();
    }
};

// Обработчик отпускания клавиш
const onKeyUp = (event) => {
    const key = event.key.toLowerCase();
    keysPressed[key] = false;
};

// Обработчик изменения размера окна
const onWindowResize = () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
};

// Добавление обработчиков событий
const addEventListeners = () => {
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('resize', onWindowResize);
};

// === Функции управления игрой ===

// Функция перезапуска игры
const restartGame = () => {
    console.log('Игра перезапускается...');

    if (mixer) {
        mixer.stopAllAction();
    }
    if (model) {
        scene.remove(model);
        model = null;
    }

    if (finishSphere) {
        scene.remove(finishSphere);
    }
    createFinishSphere();

    generateAndCreateMaze();

    loadCharacter();

    finishSphere.visible = true;

    switchCameraMode(CAMERA_MODES.THIRD_PERSON);

    trailPositions.fill(0);
    trailPointIndex = 0;
    trailGeometry.setDrawRange(0, trailPointIndex);
    trailGeometry.attributes.position.needsUpdate = true;
    lastTrailPosition.set(0, 0, 0);

    // Сброс таймера
    resetTimer();
    startTimer();
    gameCompleted = false;

    // Удаление паузы, если игра была на паузе
    if (isPaused) {
        togglePause();
    }
};

// Функция переключения режимов камеры
const switchCameraMode = (mode) => {
    if (mode === CAMERA_MODES.FREE) {
        currentCameraMode = CAMERA_MODES.FREE;
        controls.enabled = true;
    } else if (mode === CAMERA_MODES.THIRD_PERSON) {
        currentCameraMode = CAMERA_MODES.THIRD_PERSON;
        controls.enabled = false;
        updateThirdPersonCamera();
    }
};

// === Функции управления персонажем ===

// Функция обработки движения и столкновений
const handleMovement = (delta) => {
    if (!model || !mixer || gameCompleted || isPaused) return;

    let movingForward = keysPressed['arrowup'] || keysPressed['w'];
    let rotatingLeft = keysPressed['arrowleft'] || keysPressed['a'];
    let rotatingRight = keysPressed['arrowright'] || keysPressed['d'];

    if (rotatingLeft) {
        model.rotation.y += ROTATION_SPEED * delta;
    }
    if (rotatingRight) {
        model.rotation.y -= ROTATION_SPEED * delta;
    }

    if (movingForward) {
        const forward = new THREE.Vector3(0, 0, 1);
        forward.applyEuler(model.rotation);
        forward.normalize();

        const movement = forward.multiplyScalar(SPEED * delta);
        const newPosition = model.position.clone().add(movement);

        const collisionSphere = new THREE.Sphere(newPosition, COLLISION_RADIUS);
        let collision = false;

        for (let i = 0; i < wallBoxes.length; i++) {
            if (collisionSphere.intersectsBox(wallBoxes[i])) {
                collision = true;
                break;
            }
        }

        if (finishSphere.visible) {
            const distance = model.position.distanceTo(finishSphere.position);
            if (distance < COLLISION_RADIUS + 0.5) {
                playVictorySound();
                finishSphere.visible = false;
                completeGame();
            }
        }

        if (!collision) {
            model.position.copy(newPosition);

            if (lastTrailPosition.distanceTo(model.position) > 0.1 && trailPointIndex < MAX_POINTS) {
                trailPositions[trailPointIndex * 3] = model.position.x;
                trailPositions[trailPointIndex * 3 + 1] = model.position.y;
                trailPositions[trailPointIndex * 3 + 2] = model.position.z;

                trailPointIndex++;

                trailGeometry.setDrawRange(0, trailPointIndex);
                trailGeometry.attributes.position.needsUpdate = true;

                lastTrailPosition.copy(model.position);
            }

            const actions = model.userData.actions;
            if (actions) {
                playAction('walk', actions);
            }
        } else {
            const actions = model.userData.actions;
            if (actions) {
                playAction('idle', actions);
            }
        }
    } else {
        const actions = model.userData.actions;
        if (actions) {
            playAction('idle', actions);
        }
    }

    if (currentCameraMode === CAMERA_MODES.THIRD_PERSON) {
        updateThirdPersonCamera();
    }
};

// Функция воспроизведения победной музыки
const playVictorySound = () => {
    if (victoryMusic && victoryMusic.buffer) {
        console.log('Воспроизведение победной музыки');
        victoryMusic.play();
    } else {
        console.warn('Победная музыка еще не загружена.');
    }
};

// Функция завершения игры
const completeGame = () => {
    stopTimer();
    updateBestTime();
};

// Функция обновления лучшего времени
const updateBestTime = () => {
    if (bestTime === null || elapsedTime < bestTime) {
        bestTime = elapsedTime;
        localStorage.setItem('bestTime', bestTime.toFixed(2));
        bestTimeElement.textContent = `Лучший результат: ${formatTime(bestTime)}`;
    }
};

// Функция форматирования времени
const formatTime = (time) => {
    const minutes = Math.floor(time / 60);
    const seconds = (time % 60).toFixed(2);
    return `${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;
};

// === Функции управления таймером ===

// Функция создания элементов таймера
const createTimerElements = () => {
    timerElement = document.createElement('div');
    timerElement.style.position = 'absolute';
    timerElement.style.top = '10px';
    timerElement.style.right = '10px';
    timerElement.style.color = 'white';
    timerElement.style.backgroundColor = 'rgba(0, 0, 0, 0.5)';
    timerElement.style.padding = '10px';
    timerElement.style.borderRadius = '5px';
    timerElement.style.fontFamily = 'Arial, sans-serif';
    timerElement.style.fontSize = '20px';
    timerElement.style.zIndex = '100';
    timerElement.textContent = 'Время: 0:00.00';
    document.body.appendChild(timerElement);

    bestTimeElement = document.createElement('div');
    bestTimeElement.style.position = 'absolute';
    bestTimeElement.style.top = '50px';
    bestTimeElement.style.right = '10px';
    bestTimeElement.style.color = 'white';
    bestTimeElement.style.backgroundColor = 'rgba(0, 0, 0, 0.5)';
    bestTimeElement.style.padding = '10px';
    bestTimeElement.style.borderRadius = '5px';
    bestTimeElement.style.fontFamily = 'Arial, sans-serif';
    bestTimeElement.style.fontSize = '20px';
    bestTimeElement.style.zIndex = '100';
    bestTimeElement.textContent = 'Лучший результат: --:--.--';
    document.body.appendChild(bestTimeElement);

    // Загрузка лучшего времени из localStorage
    const storedBestTime = localStorage.getItem('bestTime');
    if (storedBestTime !== null) {
        bestTime = parseFloat(storedBestTime);
        bestTimeElement.textContent = `Лучший результат: ${formatTime(bestTime)}`;
    }
};

// Функция запуска таймера
const startTimer = () => {
    startTime = clockMain.getElapsedTime();
};

// Функция остановки таймера
const stopTimer = () => {
    gameCompleted = true;
};

// Функция сброса таймера
const resetTimer = () => {
    startTime = null;
    elapsedTime = 0;
    gameCompleted = false;
    timerElement.textContent = 'Время: 0:00.00';
};

// === Функции управления паузой ===

// Функция создания элемента паузы
const createPauseOverlay = () => {
    pauseOverlay = document.createElement('div');
    pauseOverlay.style.position = 'absolute';
    pauseOverlay.style.top = '50%';
    pauseOverlay.style.left = '50%';
    pauseOverlay.style.transform = 'translate(-50%, -50%)';
    pauseOverlay.style.color = 'white';
    pauseOverlay.style.backgroundColor = 'rgba(0, 0, 0, 0.7)';
    pauseOverlay.style.padding = '20px';
    pauseOverlay.style.borderRadius = '10px';
    pauseOverlay.style.fontFamily = 'Arial, sans-serif';
    pauseOverlay.style.fontSize = '40px';
    pauseOverlay.style.zIndex = '200';
    pauseOverlay.style.display = 'none'; // Скрыт по умолчанию
    pauseOverlay.textContent = 'Пауза';
    document.body.appendChild(pauseOverlay);
};

// Функция переключения состояния паузы
const togglePause = () => {
    isPaused = !isPaused;

    if (isPaused) {
        pauseGame();
    } else {
        resumeGame();
    }
};

// Функция приостановки игры
const pauseGame = () => {
    console.log('Игра на паузе');
    // Остановить таймер
    // В предыдущей реализации таймер обновляется в animate, поэтому нужно просто прекратить его обновление
    // Также можно приостановить AnimationMixer
    mixer && mixer.timeScale === 1 && (mixer.timeScale = 0);

    // Отобразить оверлей паузы
    pauseOverlay.style.display = 'block';
};

// Функция возобновления игры
const resumeGame = () => {
    console.log('Игра возобновлена');
    // Запустить таймер
    // В animate таймер будет продолжать обновляться
    // Восстановить AnimationMixer
    mixer && mixer.timeScale === 0 && (mixer.timeScale = 1);

    // Скрыть оверлей паузы
    pauseOverlay.style.display = 'none';
};

// === Функция обновления позиции камеры для режима третьего лица ===

const updateThirdPersonCamera = () => {
    if (!model) return;

    const desiredOffset = THIRD_PERSON_CAMERA_OFFSET.clone();

    const rotatedOffset = desiredOffset.applyQuaternion(model.quaternion);

    const desiredPosition = model.position.clone().add(rotatedOffset);

    const direction = desiredPosition.clone().sub(model.position).normalize();

    const raycaster = new THREE.Raycaster(model.position, direction);
    const maxDistance = desiredOffset.length();

    const collisionObjects = wallsList;

    const intersections = raycaster.intersectObjects(collisionObjects);

    let cameraPosition;

    if (intersections.length > 0 && intersections[0].distance < maxDistance) {
        const intersectionPoint = intersections[0].point;
        const safeDistance = 0.5;
        cameraPosition = intersectionPoint.clone().add(direction.clone().multiplyScalar(-safeDistance));
    } else {
        cameraPosition = desiredPosition;
    }

    camera.position.lerp(cameraPosition, 0.1);

    const lookAtOffset = new THREE.Vector3(0, 1.5, 0);
    lookAtOffset.applyQuaternion(model.quaternion);

    const lookAtPosition = model.position.clone().add(lookAtOffset);

    camera.lookAt(lookAtPosition);
};

// === Основной цикл анимации ===

const animate = () => {
    requestAnimationFrame(animate);

    if (isPaused) {
        renderer.render(scene, camera);
        return; // Пропустить обновление анимации и рендеринг сцены
    }

    const delta = clockMain.getDelta();
    const currentTime = clockMain.getElapsedTime();

    if (startTime !== null && !gameCompleted) {
        elapsedTime = currentTime - startTime;
        timerElement.textContent = `Время: ${formatTime(elapsedTime)}`;
    }

    if (mixer) mixer.update(delta);

    handleMovement(delta);

    renderer.render(scene, camera);
};

// === Запуск приложения ===

initScene();
animate();
