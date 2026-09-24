import * as THREE from 'three';
import {
  EffectComposer, RenderPass, EffectPass, LambdaPass, BloomEffect, DepthOfFieldEffect, VignetteEffect,
  ToneMappingEffect, ToneMappingMode, NoiseEffect, BlendFunction, SSAOEffect, NormalPass, OutlineEffect,
} from 'postprocessing';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { ANATOMY } from '../config/anatomy';
import { MicroscopeEffect } from './microscopeEffect';

/** WebGL renderer + microscope post-processing chain. */
export class View {
  renderer: THREE.WebGLRenderer;
  scene = new THREE.Scene();
  camera: THREE.PerspectiveCamera;
  composer: EffectComposer;
  dof: DepthOfFieldEffect;
  ssao: SSAOEffect;
  outline: OutlineEffect;
  /** Objects excluded from the ambient-occlusion normal pass. */
  noAO: THREE.Object3D[] = [];

  /** 'low' (URL ?quality=low) drops MSAA and ambient occlusion for weak GPUs. */
  readonly quality: 'high' | 'low' = new URLSearchParams(location.search).get('quality') === 'low' ? 'low' : 'high';

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', stencil: false, depth: true });
    const scale = Number(new URLSearchParams(location.search).get('scale')) || 0;
    this.renderer.setPixelRatio(scale || (this.quality === 'low' ? 1 : Math.min(window.devicePixelRatio, 2)));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.NoToneMapping; // done in the post chain
    this.scene.background = new THREE.Color('#000000');

    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environmentIntensity = 0.35;

    const m = ANATOMY.microscope;
    this.camera = new THREE.PerspectiveCamera(m.fovDeg, 1, m.workingDistance - 90, m.workingDistance + 400);

    this.composer = new EffectComposer(this.renderer, { frameBufferType: THREE.HalfFloatType, multisampling: this.quality === 'low' ? 0 : 4 });
    this.composer.addPass(new RenderPass(this.scene, this.camera));

    // Transparent films (arachnoid, blood later) must not cast ambient occlusion: hide them
    // while the normal buffer is drawn.
    const normalPass = new NormalPass(this.scene, this.camera);
    if (this.quality === 'high') {
      this.composer.addPass(new LambdaPass(() => this.noAO.forEach(o => (o.visible = false))));
      this.composer.addPass(normalPass);
      this.composer.addPass(new LambdaPass(() => this.noAO.forEach(o => (o.visible = true))));
    }
    this.ssao = new SSAOEffect(this.camera, normalPass.texture, {
      blendFunction: BlendFunction.MULTIPLY,
      samples: 16, rings: 5, radius: 0.08, intensity: 2.2, bias: 0.02, fade: 0.02,
      luminanceInfluence: 0.35, worldDistanceThreshold: 400, worldDistanceFalloff: 50,
      worldProximityThreshold: 6, worldProximityFalloff: 2, color: new THREE.Color('#1a0503'),
      resolutionScale: 0.75,
    });

    this.dof = new DepthOfFieldEffect(this.camera, { worldFocusRange: m.focusRange, bokehScale: m.bokehScale, resolutionScale: 0.75 });
    this.dof.target = new THREE.Vector3(...m.target);

    const bloom = new BloomEffect({ intensity: 0.45, luminanceThreshold: 0.72, luminanceSmoothing: 0.2, mipmapBlur: true, radius: 0.6 });
    const tone = new ToneMappingEffect({ mode: ToneMappingMode.ACES_FILMIC });
    const vignette = new VignetteEffect({ offset: 0.25, darkness: 0.55 });
    const noise = new NoiseEffect({ blendFunction: BlendFunction.OVERLAY, premultiply: false });
    noise.blendMode.opacity.value = 0.06;
    const scope = new MicroscopeEffect({ focusDist: m.workingDistance });
    // hover highlight for tool targets
    this.outline = new OutlineEffect(this.scene, this.camera, {
      blendFunction: BlendFunction.SCREEN, edgeStrength: 2.2, pulseSpeed: 0, xRay: true, blur: true,
      visibleEdgeColor: 0x5fe0b8, hiddenEdgeColor: 0x1f4a3e, resolutionScale: 1,
    });

    if (this.quality === 'high') this.composer.addPass(new EffectPass(this.camera, this.ssao));
    this.composer.addPass(new EffectPass(this.camera, this.dof, bloom));
    this.composer.addPass(new EffectPass(this.camera, tone, this.outline, vignette, noise));
    this.composer.addPass(new EffectPass(this.camera, scope));

    window.addEventListener('resize', () => this.resize());
    this.resize();
  }

  resize(): void {
    const w = window.innerWidth, h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.composer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  render(dt: number): void {
    this.composer.render(dt);
  }
}
