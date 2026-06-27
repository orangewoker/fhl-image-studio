const DEG2RAD = Math.PI / 180;
const MAX_RENDER_SIDE = 2048;

const QUAD_VERTEX_SHADER = `#version 300 es
precision highp float;
layout(location = 0) in vec2 a_position;
out vec2 v_uv;
void main() {
  gl_Position = vec4(a_position, 0.0, 1.0);
  v_uv = vec2(a_position.x * 0.5 + 0.5, 1.0 - (a_position.y * 0.5 + 0.5));
}`;

const PANORAMA_FRAGMENT_SHADER = `#version 300 es
precision highp float;
in vec2 v_uv;
out vec4 outColor;

uniform sampler2D u_background;
uniform float u_yaw;
uniform float u_pitch;
uniform float u_hfov;
uniform float u_vfov;

const float PI = 3.1415926535897932384626433832795;
const float TWO_PI = 6.283185307179586476925286766559;

vec3 rotateCameraForward(float yaw, float pitch) {
  float cy = cos(yaw);
  float sy = sin(yaw);
  float cp = cos(pitch);
  float sp = sin(pitch);
  return vec3(cp * sy, sp, cp * cy);
}

mat3 cameraBasis(float yaw, float pitch) {
  vec3 fwd = normalize(rotateCameraForward(yaw, pitch));
  vec3 worldUp = vec3(0.0, 1.0, 0.0);
  if (abs(dot(fwd, worldUp)) > 0.999) worldUp = vec3(0.0, 0.0, 1.0);
  vec3 right = normalize(cross(worldUp, fwd));
  vec3 up = normalize(cross(fwd, right));
  return mat3(right, up, fwd);
}

vec2 projectCameraUv() {
  mat3 basis = cameraBasis(u_yaw, u_pitch);
  float nx = (v_uv.x * 2.0 - 1.0) * tan(u_hfov * 0.5);
  float ny = (1.0 - v_uv.y * 2.0) * tan(u_vfov * 0.5);
  vec3 dir = normalize(basis[2] + basis[0] * nx + basis[1] * ny);
  float lon = atan(dir.x, dir.z);
  float lat = asin(clamp(dir.y, -1.0, 1.0));
  return vec2(lon / TWO_PI + 0.5, clamp(0.5 - lat / PI, 0.0, 1.0));
}

void main() {
  outColor = texture(u_background, projectCameraUv());
}`;

type WebGLPreviewOwner = {
  __panoGlPreviewRenderer?: PanoramaGlPreviewRenderer | null;
  __panoGlPreviewUnavailable?: boolean;
};

type PanoramaGlPreviewOptions = {
  ctx: CanvasRenderingContext2D | null | undefined;
  owner: object | null | undefined;
  image: HTMLImageElement | null | undefined;
  rect: { x: number; y: number; w: number; h: number };
  yawDeg: number;
  pitchDeg: number;
  fovDeg: number;
  dpr?: number;
};

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function compileShader(gl: WebGL2RenderingContext, type: number, source: string) {
  const shader = gl.createShader(type);
  if (!shader) throw new Error("Unable to create WebGL shader");
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader) || "WebGL shader compile failed";
    gl.deleteShader(shader);
    throw new Error(log);
  }
  return shader;
}

function createProgram(gl: WebGL2RenderingContext, vertexSource: string, fragmentSource: string) {
  const vertexShader = compileShader(gl, gl.VERTEX_SHADER, vertexSource);
  let fragmentShader: WebGLShader | null = null;
  try {
    fragmentShader = compileShader(gl, gl.FRAGMENT_SHADER, fragmentSource);
    const program = gl.createProgram();
    if (!program) throw new Error("Unable to create WebGL program");
    gl.attachShader(program, vertexShader);
    gl.attachShader(program, fragmentShader);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      const log = gl.getProgramInfoLog(program) || "WebGL program link failed";
      gl.deleteProgram(program);
      throw new Error(log);
    }
    return program;
  } finally {
    gl.deleteShader(vertexShader);
    if (fragmentShader) gl.deleteShader(fragmentShader);
  }
}

function imageRevisionKey(image: HTMLImageElement) {
  return [
    String(image.currentSrc || image.src || ""),
    Number(image.naturalWidth || image.width || 0),
    Number(image.naturalHeight || image.height || 0),
  ].join("|");
}

function renderSize(width: number, height: number, dpr: number) {
  const sourceWidth = Math.max(1, Math.round(Number(width || 1) * Math.max(1, Number(dpr || 1))));
  const sourceHeight = Math.max(1, Math.round(Number(height || 1) * Math.max(1, Number(dpr || 1))));
  const scale = Math.min(1, MAX_RENDER_SIDE / Math.max(sourceWidth, sourceHeight));
  return {
    width: Math.max(1, Math.round(sourceWidth * scale)),
    height: Math.max(1, Math.round(sourceHeight * scale)),
  };
}

class PanoramaGlPreviewRenderer {
  private readonly surface: HTMLCanvasElement;
  private gl: WebGL2RenderingContext | null = null;
  private program: WebGLProgram | null = null;
  private quadBuffer: WebGLBuffer | null = null;
  private texture: WebGLTexture | null = null;
  private textureRevision = "";
  private uniforms: {
    background: WebGLUniformLocation | null;
    yaw: WebGLUniformLocation | null;
    pitch: WebGLUniformLocation | null;
    hFov: WebGLUniformLocation | null;
    vFov: WebGLUniformLocation | null;
  } | null = null;

  constructor() {
    this.surface = document.createElement("canvas");
  }

  render(options: Omit<PanoramaGlPreviewOptions, "ctx" | "owner">): HTMLCanvasElement | null {
    if (!this.init()) return null;
    const gl = this.gl;
    const program = this.program;
    if (!gl || !program || !this.uniforms) return null;

    const rect = options.rect;
    const size = renderSize(rect.w, rect.h, options.dpr ?? 1);
    if (this.surface.width !== size.width) this.surface.width = size.width;
    if (this.surface.height !== size.height) this.surface.height = size.height;
    gl.viewport(0, 0, size.width, size.height);

    if (!this.uploadTexture(options.image)) return null;

    const hFov = clamp(Number(options.fovDeg || 100), 1, 179);
    const vFov = (2 * Math.atan(Math.tan(hFov * DEG2RAD * 0.5) * (size.height / Math.max(size.width, 1)))) / DEG2RAD;

    gl.disable(gl.BLEND);
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.STENCIL_TEST);
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.useProgram(program);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.uniform1i(this.uniforms.background, 0);
    gl.uniform1f(this.uniforms.yaw, Number(options.yawDeg || 0) * DEG2RAD);
    gl.uniform1f(this.uniforms.pitch, Number(options.pitchDeg || 0) * DEG2RAD);
    gl.uniform1f(this.uniforms.hFov, hFov * DEG2RAD);
    gl.uniform1f(this.uniforms.vFov, clamp(vFov, 0.1, 179) * DEG2RAD);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
    return this.surface;
  }

  private init() {
    if (this.gl && this.program && this.quadBuffer && this.texture) return true;
    try {
      const gl = this.surface.getContext("webgl2", {
        alpha: false,
        antialias: false,
        depth: false,
        stencil: false,
        premultipliedAlpha: true,
        preserveDrawingBuffer: false,
      });
      if (!gl) return false;
      const program = createProgram(gl, QUAD_VERTEX_SHADER, PANORAMA_FRAGMENT_SHADER);
      const quadBuffer = gl.createBuffer();
      const texture = gl.createTexture();
      if (!quadBuffer || !texture) return false;

      gl.bindBuffer(gl.ARRAY_BUFFER, quadBuffer);
      gl.bufferData(
        gl.ARRAY_BUFFER,
        new Float32Array([
          -1, -1,
          1, -1,
          -1, 1,
          -1, 1,
          1, -1,
          1, 1,
        ]),
        gl.STATIC_DRAW,
      );
      gl.enableVertexAttribArray(0);
      gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

      this.gl = gl;
      this.program = program;
      this.quadBuffer = quadBuffer;
      this.texture = texture;
      this.uniforms = {
        background: gl.getUniformLocation(program, "u_background"),
        yaw: gl.getUniformLocation(program, "u_yaw"),
        pitch: gl.getUniformLocation(program, "u_pitch"),
        hFov: gl.getUniformLocation(program, "u_hfov"),
        vFov: gl.getUniformLocation(program, "u_vfov"),
      };
      return true;
    } catch {
      this.dispose();
      return false;
    }
  }

  private uploadTexture(image: HTMLImageElement | null | undefined) {
    const gl = this.gl;
    if (!gl || !this.texture || !image?.complete || !(image.naturalWidth || image.width)) return false;
    const revision = imageRevisionKey(image);
    if (revision === this.textureRevision) return true;
    try {
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, this.texture);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
      this.textureRevision = revision;
      return gl.getError() === gl.NO_ERROR;
    } catch {
      this.textureRevision = "";
      return false;
    }
  }

  private dispose() {
    if (!this.gl) return;
    if (this.texture) this.gl.deleteTexture(this.texture);
    if (this.quadBuffer) this.gl.deleteBuffer(this.quadBuffer);
    if (this.program) this.gl.deleteProgram(this.program);
    this.gl = null;
    this.program = null;
    this.quadBuffer = null;
    this.texture = null;
    this.uniforms = null;
    this.textureRevision = "";
  }
}

export function renderPanoramaViewToContext2D(options: PanoramaGlPreviewOptions) {
  const { ctx, owner, image, rect } = options;
  if (!ctx || !owner || !image || !rect || rect.w <= 1 || rect.h <= 1) return false;
  const previewOwner = owner as WebGLPreviewOwner;
  if (previewOwner.__panoGlPreviewUnavailable) return false;
  if (typeof document === "undefined") return false;
  try {
    const renderer = previewOwner.__panoGlPreviewRenderer || new PanoramaGlPreviewRenderer();
    previewOwner.__panoGlPreviewRenderer = renderer;
    const surface = renderer.render(options);
    if (!surface) return false;
    ctx.drawImage(surface, rect.x, rect.y, rect.w, rect.h);
    return true;
  } catch {
    previewOwner.__panoGlPreviewUnavailable = true;
    previewOwner.__panoGlPreviewRenderer = null;
    return false;
  }
}
