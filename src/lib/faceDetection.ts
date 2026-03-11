/**
 * Face detection for time in/out photo capture.
 * Uses Tiny Face Detector from @vladmandic/face-api.
 */

import * as faceapi from '@vladmandic/face-api';

const MODEL_URL = '/models';
let modelsLoaded = false;

export async function ensureModelsLoaded(): Promise<void> {
  if (modelsLoaded) return;
  await faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL);
  modelsLoaded = true;
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
