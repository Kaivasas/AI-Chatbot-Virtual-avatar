"use client";
import { useRef } from 'react';
import * as PIXI from 'pixi.js';
import type { Cubism4InternalModel, Live2DModel } from 'pixi-live2d-display';

export function useAudioLipSync() {
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const analysisGainRef = useRef<GainNode | null>(null);
  const compressorRef = useRef<DynamicsCompressorNode | null>(null);
  const audioQueueRef = useRef<string[]>([]);
  const isPlayingAudioRef = useRef(false);
  const bufferSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const mouthValueRef = useRef(0);
  const lastSoundTimeRef = useRef<number>(0);
  const lipSyncActiveRef = useRef<boolean>(false);
  const mouthWigglePhaseRef = useRef<number>(0);
  const MOUTH_PARAM_ID = 'ParamMouthOpenY';
  const MOUTH_FORM_PARAM_ID = 'ParamMouthForm';
  const NOISE_THRESHOLD_RMS = 0.003;
  const NOISE_THRESHOLD_PEAK = 0.010;
  const MAX_RMS = 0.35;
  const MAX_PEAK = 0.95;
  const HOLD_MS = 500;
  const OPEN_SPEED = 0.85;
  const CLOSE_SPEED = 0.10;

  function ensureAudioContext() {
    if (!audioContextRef.current) {
      audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    audioContextRef.current.resume().catch(() => {});
  }

  function ensureAudioAnalyser() {
    if (!audioContextRef.current) return;
    if (analyserRef.current) return;
    const ctx = audioContextRef.current;
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 1024;
    analyser.smoothingTimeConstant = 0.8;
    const compressor = ctx.createDynamicsCompressor();
    compressor.threshold.value = -24;
    compressor.knee.value = 30;
    compressor.ratio.value = 12;
    compressor.attack.value = 0.003;
    compressor.release.value = 0.25;
    const gainNode = ctx.createGain();
    gainNode.gain.value = 3.0;
    compressor.connect(gainNode);
    gainNode.connect(analyser);
    analyser.connect(ctx.destination);
    compressorRef.current = compressor;
    analysisGainRef.current = gainNode;
    analyserRef.current = analyser;
  }

  function normalizeBase64(b64: string) {
    let s = (b64 || '').trim();
    if (s.startsWith('data:')) {
      const commaIdx = s.indexOf(',');
      if (commaIdx !== -1) s = s.slice(commaIdx + 1);
    }
    s = s.replace(/\s/g, '').replace(/-/g, '+').replace(/_/g, '/');
    return s;
  }

  function arrayBufferFromBase64(base64: string) {
    const binary = atob(base64);
    const buf = new ArrayBuffer(binary.length);
    const view = new Uint8Array(buf);
    for (let i = 0; i < binary.length; i++) view[i] = binary.charCodeAt(i);
    return buf;
  }

  function decodeAudioDataPromise(ctx: AudioContext, buf: ArrayBuffer) {
    return new Promise<AudioBuffer>((resolve, reject) => {
      ctx.decodeAudioData(buf, resolve, reject);
    });
  }

  function startTalkingMotion() {
    try {
      const model = (window as any).live2dModel as Live2DModel<Cubism4InternalModel> | undefined;
      const mm: any = model?.internalModel?.motionManager;
      if (!model || !mm) return;
      const idx = Math.floor(Math.random() * 4);
      if (typeof mm.startMotion === 'function') {
        try { mm.startMotion('TapBody', idx, 2); } catch { mm.startMotion('TapBody', idx); }
      }
    } catch {}
  }

  function stopTalkingMotion() {
    try {
      const model = (window as any).live2dModel as Live2DModel<Cubism4InternalModel> | undefined;
      const mm: any = model?.internalModel?.motionManager;
      if (!model || !mm) return;
      if (typeof mm.stopAllMotions === 'function') {
        mm.stopAllMotions();
      } else if (typeof mm.stopAll === 'function') {
        mm.stopAll();
      }
      try { if (mm.setIdleMotionEnabled) mm.setIdleMotionEnabled(true); } catch {}
    } catch {}
  }

  function handleLipSync() {
    const model = (window as any).live2dModel as Live2DModel<Cubism4InternalModel> | undefined;
    if (!analyserRef.current || !model) return;
    const bufferLength = analyserRef.current.fftSize;
    const timeData = new Float32Array(bufferLength);
    analyserRef.current.getFloatTimeDomainData(timeData);
    let sumSquares = 0;
    let peakAbs = 0;
    for (let i = 0; i < bufferLength; i++) {
      const x = timeData[i];
      sumSquares += x * x;
      const ax = Math.abs(x);
      if (ax > peakAbs) peakAbs = ax;
    }
    const rms = Math.sqrt(sumSquares / bufferLength);
    let rmsNorm = 0.0;
    if (rms > NOISE_THRESHOLD_RMS) {
      rmsNorm = (rms - NOISE_THRESHOLD_RMS) / (MAX_RMS - NOISE_THRESHOLD_RMS);
    }
    let peakNorm = 0.0;
    if (peakAbs > NOISE_THRESHOLD_PEAK) {
      peakNorm = (peakAbs - NOISE_THRESHOLD_PEAK) / (MAX_PEAK - NOISE_THRESHOLD_PEAK);
    }
    let targetMouthValue = 0.6 * peakNorm + 0.4 * rmsNorm;
    targetMouthValue *= 1.25;
    targetMouthValue = Math.min(1.0, Math.max(0.0, targetMouthValue));
    targetMouthValue = Math.pow(targetMouthValue, 0.55);
    const now = performance.now();
    const aboveThreshold = rms > NOISE_THRESHOLD_RMS || peakAbs > NOISE_THRESHOLD_PEAK;
    if (aboveThreshold) {
      lastSoundTimeRef.current = now;
    } else {
      if (now - lastSoundTimeRef.current < HOLD_MS) {
        targetMouthValue = Math.max(targetMouthValue, mouthValueRef.current * 0.92);
      } else {
        if (lipSyncActiveRef.current) {
          mouthWigglePhaseRef.current += 0.24;
          const wiggle = 0.15 + 0.05 * Math.sin(mouthWigglePhaseRef.current);
          targetMouthValue = Math.max(targetMouthValue, wiggle);
        }
      }
    }
    let currentMouthValue = mouthValueRef.current;
    const effectiveSpeed = targetMouthValue > currentMouthValue ? OPEN_SPEED : CLOSE_SPEED;
    currentMouthValue = currentMouthValue * (1.0 - effectiveSpeed) + targetMouthValue * effectiveSpeed;
    if (lipSyncActiveRef.current) {
      currentMouthValue = Math.max(currentMouthValue, 0.10);
    }
    mouthValueRef.current = currentMouthValue;
  }

  function applyLipParameters() {
    const model = (window as any).live2dModel as Live2DModel<Cubism4InternalModel> | undefined;
    if (!model) return;
    const currentMouthValue = mouthValueRef.current;
    try {
      const core = model.internalModel.coreModel;
      const appliedBefore = core.getParameterValueById(MOUTH_PARAM_ID);
      core.setParameterValueById(MOUTH_PARAM_ID, currentMouthValue);
      const delta = currentMouthValue - appliedBefore;
      try { core.addParameterValueById(MOUTH_PARAM_ID, delta, 1.0); } catch {}
      core.setParameterValueById(MOUTH_FORM_PARAM_ID, 0);
    } catch {}
  }

  function attachLipSync(app: PIXI.Application) {
    app.ticker.add(handleLipSync, undefined, PIXI.UPDATE_PRIORITY.HIGH);
    app.renderer.on('prerender', applyLipParameters);
    app.renderer.on('postrender', applyLipParameters);
  }

  function detachLipSync(app: PIXI.Application) {
    app.ticker.remove(handleLipSync);
    app.renderer.off('prerender', applyLipParameters);
    app.renderer.off('postrender', applyLipParameters);
  }

  async function processAudioQueue(app?: PIXI.Application) {
    if (isPlayingAudioRef.current || audioQueueRef.current.length === 0) return;
    isPlayingAudioRef.current = true;
    const nextAudioBase64 = audioQueueRef.current.shift();
    if (nextAudioBase64) {
      try {
        const base64 = normalizeBase64(nextAudioBase64);
        const audioBuffer = arrayBufferFromBase64(base64);
        if (!analyserRef.current) ensureAudioAnalyser();
        if (!audioContextRef.current) ensureAudioContext();
        const decodedBuffer = await decodeAudioDataPromise(audioContextRef.current!, audioBuffer);
        const bufferSource = audioContextRef.current!.createBufferSource();
        bufferSource.buffer = decodedBuffer;
        if (compressorRef.current && analysisGainRef.current) {
          bufferSource.connect(compressorRef.current);
        } else if (analyserRef.current) {
          bufferSource.connect(analyserRef.current);
        }
        bufferSourceRef.current = bufferSource;
        if (app) attachLipSync(app);
        lipSyncActiveRef.current = true;
        startTalkingMotion();
        bufferSource.start(0);
        bufferSource.onended = () => {
          bufferSource.disconnect();
          lipSyncActiveRef.current = false;
          mouthValueRef.current = 0;
          isPlayingAudioRef.current = false;
          processAudioQueue(app);
        };
      } catch (e) {
        isPlayingAudioRef.current = false;
        processAudioQueue(app);
      }
    } else {
      isPlayingAudioRef.current = false;
      stopTalkingMotion();
      if (app) detachLipSync(app);
    }
  }

  return {
    ensureAudioContext,
    ensureAudioAnalyser,
    normalizeBase64,
    arrayBufferFromBase64,
    decodeAudioDataPromise,
    startTalkingMotion,
    stopTalkingMotion,
    handleLipSync,
    applyLipParameters,
    attachLipSync,
    detachLipSync,
    processAudioQueue,
    audioContextRef,
    analyserRef,
    analysisGainRef,
    compressorRef,
    audioQueueRef,
    isPlayingAudioRef,
    bufferSourceRef,
    mouthValueRef,
    lastSoundTimeRef,
    lipSyncActiveRef,
    mouthWigglePhaseRef,
    MOUTH_PARAM_ID,
    MOUTH_FORM_PARAM_ID,
  };
}