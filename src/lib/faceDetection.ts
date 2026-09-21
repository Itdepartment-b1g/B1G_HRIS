/**
 * Face detection for time in/out photo capture.
 * Uses Tiny Face Detector from @vladmandic/face-api.
 */

import * as faceapi from '@vladmandic/face-api';

const MODEL_URL = '/models';
let modelsLoaded = false;
let loadPromise: Promise<void> | null = null;

type TfBackendApi = {
  removeBackend: (name: string) => void;
  setBackend: (name: string) => Promise<boolean>;
  ready: () => Promise<void>;
  getBackend: () => string;
};

/**
 * WASM is TensorFlow's default highest-priority backend, but it often is not
 * actually ready in Vite (wasm files / COOP-COEP). Using it first throws:
 * "The highest priority backend 'wasm' has not yet been initialized."
 */
async function initTfBackend(): Promise<void> {
  const tf = faceapi.tf as unknown as TfBackendApi;

  try {
    tf.removeBackend('wasm');
  } catch {
    // wasm may already be unregistered
  }

  for (const name of ['webgl', 'cpu'] as const) {
    try {
      const ok = await tf.setBackend(name);
      if (!ok) continue;
      await tf.ready();
      if (tf.getBackend() === name) return;
    } catch {
      // try next backend
    }
  }

  await tf.ready();
}

async function loadModels(): Promise<void> {
  await initTfBackend();
  await faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL);
  modelsLoaded = true;
}

export async function ensureModelsLoaded(): Promise<void> {
  if (modelsLoaded) return;
  if (!loadPromise) {
    loadPromise = loadModels().catch((err) => {
      loadPromise = null;
      throw err;
    });
  }
  await loadPromise;
}

/**
 * Detect if at least one face is present in the canvas image.
 * @param canvas - HTMLCanvasElement with the image drawn (video frame or photo)
 * @returns true if at least one face detected, false otherwise
 */
export async function detectFaceInCanvas(canvas: HTMLCanvasElement): Promise<boolean> {
  await ensureModelsLoaded();
  const options = new faceapi.TinyFaceDetectorOptions({
    inputSize: 224,
    scoreThreshold: 0.4,
  });
  const detections = await faceapi.detectAllFaces(canvas, options);
  return detections.length > 0;
}
