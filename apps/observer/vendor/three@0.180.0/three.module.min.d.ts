// Hand-written declaration of the SUBSET of three.js the 3D view uses. Not upstream
// code: see ../VENDOR.md, "The one handwritten file in here". It exists so the browser
// modules can be type-checked (criterion D16) without an `@types/three` dependency —
// which would be a development dependency nobody asked for, pinned to a version that
// drifts from the vendored runtime. Declaring what we call is smaller and honest: if a
// module reaches for something not listed here, the type-checker says so.
//
// TypeScript resolves `./three.module.min.js` to this `.d.ts` before the minified
// artefact, which is why the 721 KB blob is never parsed by the checker.

export class Vector2 {
  constructor(x?: number, y?: number);
  x: number;
  y: number;
  set(x: number, y: number): this;
}

export class Vector3 {
  constructor(x?: number, y?: number, z?: number);
  x: number;
  y: number;
  z: number;
  set(x: number, y: number, z: number): this;
  sub(v: Vector3): this;
  dot(v: Vector3): number;
  cross(v: Vector3): this;
  crossVectors(a: Vector3, b: Vector3): this;
  normalize(): this;
  project(camera: Camera): this;
  toArray(): number[];
}

export class Color {
  set(value: number | string): this;
}

export class Euler {
  x: number;
  y: number;
  z: number;
}

export class Matrix4 {
  elements: number[];
}

export class Object3D {
  readonly position: Vector3;
  readonly rotation: Euler;
  readonly scale: Vector3;
  readonly children: Object3D[];
  readonly matrixWorld: Matrix4;
  visible: boolean;
  userData: Record<string, unknown>;
  add(...objects: Object3D[]): this;
  lookAt(x: number, y: number, z: number): void;
  updateMatrixWorld(force?: boolean): void;
}

export class Scene extends Object3D {}

export class Camera extends Object3D {
  updateProjectionMatrix(): void;
}

export class OrthographicCamera extends Camera {
  constructor(left: number, right: number, top: number, bottom: number, near?: number, far?: number);
  left: number;
  right: number;
  top: number;
  bottom: number;
  zoom: number;
}

export class BufferGeometry {
  setFromPoints(points: Vector3[]): this;
  dispose(): void;
}

export class CylinderGeometry extends BufferGeometry {
  constructor(radiusTop?: number, radiusBottom?: number, height?: number, radialSegments?: number);
}

export class Material {
  transparent: boolean;
  opacity: number;
  readonly color: Color;
  dispose(): void;
}

export class MeshBasicMaterial extends Material {
  constructor(parameters?: { color?: number | string, transparent?: boolean, opacity?: number });
}

export class LineBasicMaterial extends Material {
  constructor(parameters?: { color?: number | string, transparent?: boolean, opacity?: number });
}

export class Mesh extends Object3D {
  constructor(geometry: BufferGeometry, material: Material);
  readonly material: Material;
  readonly geometry: BufferGeometry;
}

export class Line extends Object3D {
  constructor(geometry: BufferGeometry, material: Material);
  readonly material: Material;
  readonly geometry: BufferGeometry;
}

export class Raycaster {
  setFromCamera(coords: Vector2, camera: Camera): void;
  intersectObjects(objects: Object3D[], recursive?: boolean): Array<{ object: Object3D }>;
}

export class WebGLRenderer {
  constructor(parameters?: { antialias?: boolean, alpha?: boolean });
  readonly domElement: HTMLCanvasElement;
  setPixelRatio(value: number): void;
  setSize(width: number, height: number): void;
  render(scene: Scene, camera: Camera): void;
  dispose(): void;
}
