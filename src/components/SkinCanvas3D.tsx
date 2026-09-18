import React, { useCallback, useEffect, useRef, useState } from 'react';
import { RotateCw, ZoomIn, ZoomOut, Play, Pause, Layers, Download } from 'lucide-react';

interface SkinCanvas3DProps {
  skinUrl: string;
  capeUrl?: string;
  model?: 'classic' | 'slim'; // classic = 4px arm, slim = 3px arm
  showLayers?: boolean;
  autoRotate?: boolean;
}

/** One textured quad, ready to be painted. */
interface Face {
  /** Screen-space corners in texture order: top-left, top-right, bottom-right, bottom-left. */
  points: [number, number][];
  depth: number;
  /** Source rectangle inside the texture. */
  sx: number;
  sy: number;
  sw: number;
  sh: number;
  /** Directional shading multiplier; 1 leaves the texture untouched. */
  light: number;
  texture: HTMLImageElement;
  isOverlay: boolean;
}

type Vec3 = [number, number, number];

const MIN_ZOOM = 4;
const MAX_ZOOM = 18;

export const SkinCanvas3D: React.FC<SkinCanvas3DProps> = ({
  skinUrl,
  capeUrl,
  model = 'classic',
  showLayers = true,
  autoRotate = true,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const [isAnimating, setIsAnimating] = useState<boolean>(autoRotate);
  const [displayLayers, setDisplayLayers] = useState<boolean>(showLayers);
  const [isTextureReady, setIsTextureReady] = useState<boolean>(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  /*
   * Camera state lives in refs, not React state. Dragging updates it many times
   * per second and a re-render per mouse move is both pointless and expensive:
   * only the canvas needs to change, and it is redrawn imperatively.
   */
  const yawRef = useRef(25);
  const pitchRef = useRef(10);
  const zoomRef = useRef(8.5);
  const animTimeRef = useRef(0);

  const skinRef = useRef<HTMLImageElement | null>(null);
  const capeRef = useRef<HTMLImageElement | null>(null);
  /** Legacy 64x32 skins have no second layer and no separate left limbs. */
  const isLegacySkinRef = useRef(false);

  const frameRef = useRef<number | null>(null);
  const dragRef = useRef<{ active: boolean; x: number; y: number; yaw: number; pitch: number }>({
    active: false,
    x: 0,
    y: 0,
    yaw: 25,
    pitch: 10,
  });

  const drawRef = useRef<() => void>(() => {});

  /** Schedules exactly one frame. Repeated calls in the same tick collapse. */
  const requestDraw = useCallback(() => {
    if (frameRef.current !== null) return;
    frameRef.current = requestAnimationFrame(() => {
      frameRef.current = null;
      drawRef.current();
    });
  }, []);

  // --- texture loading ------------------------------------------------------

  useEffect(() => {
    if (!skinUrl) {
      skinRef.current = null;
      setIsTextureReady(false);
      return;
    }

    const image = new Image();
    image.crossOrigin = 'anonymous';
    let cancelled = false;

    image.onload = () => {
      if (cancelled) return;
      skinRef.current = image;
      isLegacySkinRef.current = image.height === image.width / 2;
      setIsTextureReady(true);
      setLoadError(null);
      requestDraw();
    };
    image.onerror = () => {
      if (cancelled) return;
      skinRef.current = null;
      setIsTextureReady(false);
      setLoadError('This skin texture could not be loaded.');
      requestDraw();
    };
    image.src = skinUrl;

    return () => {
      cancelled = true;
    };
  }, [skinUrl, requestDraw]);

  useEffect(() => {
    if (!capeUrl) {
      capeRef.current = null;
      requestDraw();
      return;
    }

    const image = new Image();
    image.crossOrigin = 'anonymous';
    let cancelled = false;

    image.onload = () => {
      if (cancelled) return;
      capeRef.current = image;
      requestDraw();
    };
    image.onerror = () => {
      if (cancelled) return;
      capeRef.current = null;
    };
    image.src = capeUrl;

    return () => {
      cancelled = true;
    };
  }, [capeUrl, requestDraw]);

  // --- renderer -------------------------------------------------------------

  useEffect(() => {
    const draw = () => {
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext('2d');
      if (!canvas || !ctx) return;

      const dpr = window.devicePixelRatio || 1;
      const width = canvas.width / dpr;
      const height = canvas.height / dpr;

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, width, height);
      ctx.imageSmoothingEnabled = false;

      const skin = skinRef.current;
      if (!skin) return;

      const legacy = isLegacySkinRef.current;
      const layers = displayLayers && !legacy;

      if (isAnimating) {
        animTimeRef.current += 0.04;
      }

      const yaw = yawRef.current + (isAnimating ? Math.sin(animTimeRef.current * 0.4) * 5 : 0);
      const radYaw = (yaw * Math.PI) / 180;
      const radPitch = (pitchRef.current * Math.PI) / 180;
      const cosY = Math.cos(radYaw);
      const sinY = Math.sin(radYaw);
      const cosP = Math.cos(radPitch);
      const sinP = Math.sin(radPitch);

      const walk = isAnimating ? Math.sin(animTimeRef.current * 2) * 25 : 0;
      const armSwing = (walk * Math.PI) / 180;
      const legSwing = (-walk * Math.PI) / 180;
      const headBob = isAnimating ? Math.sin(animTimeRef.current * 4) * 0.4 : 0;

      const cx = width / 2;
      const cy = height / 2 + 10;
      const scale = zoomRef.current;

      /* Orthographic projection: yaw, then pitch, then a plain scale. Because
         there is no perspective divide, every box face stays a parallelogram on
         screen, which is what makes exact affine texture mapping possible. */
      const project = (x: number, y: number, z: number): Vec3 => {
        const x1 = x * cosY + z * sinY;
        const z1 = -x * sinY + z * cosY;
        const y2 = y * cosP - z1 * sinP;
        const z2 = y * sinP + z1 * cosP;
        return [cx + x1 * scale, cy + y2 * scale, z2];
      };

      /** Depth of a direction vector; negative means it points at the camera. */
      const depthOf = (x: number, y: number, z: number): number => {
        const z1 = -x * sinY + z * cosY;
        return y * sinP + z1 * cosP;
      };

      const faces: Face[] = [];

      interface BoxOptions {
        /** Centre on x/z, top edge on y. */
        x: number;
        y: number;
        z: number;
        w: number;
        h: number;
        d: number;
        texX: number;
        texY: number;
        texture?: HTMLImageElement;
        /** Rotation around the X axis, in radians, about `pivotY`. */
        rotX?: number;
        pivotY?: number;
        isOverlay?: boolean;
        /** Grows the box evenly; used for the second skin layer. */
        expand?: number;
        /** Swaps the front and back faces, for textures laid out back-to-front. */
        mirrorZ?: boolean;
      }

      const addBox = (options: BoxOptions) => {
        const {
          x,
          y,
          z,
          w,
          h,
          d,
          texX,
          texY,
          texture = skin,
          rotX = 0,
          pivotY = y,
          isOverlay = false,
          expand = 0,
          mirrorZ = false,
        } = options;

        const hw = w / 2 + expand;
        const hd = (d / 2 + expand) * (mirrorZ ? -1 : 1);
        const top = y - expand;
        const bottom = y + h + expand;

        const cosR = Math.cos(rotX);
        const sinR = Math.sin(rotX);

        // Local joint rotation, then translation into model space.
        const vertex = (lx: number, ly: number, lz: number): Vec3 => {
          const dy = ly - pivotY;
          return [x + lx, pivotY + dy * cosR - lz * sinR, z + dy * sinR + lz * cosR];
        };

        // Face normals travel through the same joint rotation as the vertices.
        const normalDepth = (nx: number, ny: number, nz: number): number =>
          depthOf(nx, ny * cosR - nz * sinR, ny * sinR + nz * cosR);

        const v = {
          frontTopLeft: vertex(-hw, top, -hd),
          frontTopRight: vertex(hw, top, -hd),
          frontBottomRight: vertex(hw, bottom, -hd),
          frontBottomLeft: vertex(-hw, bottom, -hd),
          backTopLeft: vertex(-hw, top, hd),
          backTopRight: vertex(hw, top, hd),
          backBottomRight: vertex(hw, bottom, hd),
          backBottomLeft: vertex(-hw, bottom, hd),
        };

        const projected = {
          frontTopLeft: project(...v.frontTopLeft),
          frontTopRight: project(...v.frontTopRight),
          frontBottomRight: project(...v.frontBottomRight),
          frontBottomLeft: project(...v.frontBottomLeft),
          backTopLeft: project(...v.backTopLeft),
          backTopRight: project(...v.backTopRight),
          backBottomRight: project(...v.backBottomRight),
          backBottomLeft: project(...v.backBottomLeft),
        };

        /*
         * Minecraft's box UV layout, with each face's corners listed in texture
         * order (top-left, top-right, bottom-right, bottom-left) so the texture
         * lands the right way up on every side.
         */
        const sides: Array<{
          corners: [Vec3, Vec3, Vec3, Vec3];
          normal: Vec3;
          rect: [number, number, number, number];
          light: number;
        }> = [
          {
            corners: [
              projected.frontTopLeft,
              projected.frontTopRight,
              projected.frontBottomRight,
              projected.frontBottomLeft,
            ],
            normal: [0, 0, -1],
            rect: [texX + d, texY + d, w, h],
            light: 1,
          },
          {
            corners: [
              projected.backTopRight,
              projected.backTopLeft,
              projected.backBottomLeft,
              projected.backBottomRight,
            ],
            normal: [0, 0, 1],
            rect: [texX + d + w + d, texY + d, w, h],
            light: 0.72,
          },
          {
            corners: [
              projected.backTopLeft,
              projected.backTopRight,
              projected.frontTopRight,
              projected.frontTopLeft,
            ],
            // Screen y grows downwards, so "up" is negative y.
            normal: [0, -1, 0],
            rect: [texX + d, texY, w, d],
            light: 1.18,
          },
          {
            corners: [
              projected.frontBottomLeft,
              projected.frontBottomRight,
              projected.backBottomRight,
              projected.backBottomLeft,
            ],
            normal: [0, 1, 0],
            rect: [texX + d + w, texY, w, d],
            light: 0.55,
          },
          {
            corners: [
              projected.backTopLeft,
              projected.frontTopLeft,
              projected.frontBottomLeft,
              projected.backBottomLeft,
            ],
            normal: [-1, 0, 0],
            rect: [texX, texY + d, d, h],
            light: 0.86,
          },
          {
            corners: [
              projected.frontTopRight,
              projected.backTopRight,
              projected.backBottomRight,
              projected.frontBottomRight,
            ],
            normal: [1, 0, 0],
            rect: [texX + d + w, texY + d, d, h],
            light: 0.94,
          },
        ];

        for (const side of sides) {
          // Cull with the real rotated normal instead of screen winding: the
          // winding sign differs per face, which used to hide half the model.
          if (normalDepth(...side.normal) >= 0) continue;

          const [a, b, c, dd] = side.corners;
          faces.push({
            points: [
              [a[0], a[1]],
              [b[0], b[1]],
              [c[0], c[1]],
              [dd[0], dd[1]],
            ],
            depth: (a[2] + b[2] + c[2] + dd[2]) / 4,
            sx: side.rect[0],
            sy: side.rect[1],
            sw: side.rect[2],
            sh: side.rect[3],
            light: side.light,
            texture,
            isOverlay,
          });
        }
      };

      const slim = model === 'slim';
      const armW = slim ? 3 : 4;
      const armX = slim ? 5.5 : 6;

      // Head
      addBox({ x: 0, y: -28 + headBob, z: 0, w: 8, h: 8, d: 8, texX: 0, texY: 0 });

      // Torso
      addBox({ x: 0, y: -20, z: 0, w: 8, h: 12, d: 4, texX: 16, texY: 16 });

      // Arms. On a legacy skin the left arm reuses the right arm's texture.
      addBox({
        x: -armX,
        y: -20,
        z: 0,
        w: armW,
        h: 12,
        d: 4,
        texX: 40,
        texY: 16,
        rotX: armSwing,
        pivotY: -20,
      });
      addBox({
        x: armX,
        y: -20,
        z: 0,
        w: armW,
        h: 12,
        d: 4,
        texX: legacy ? 40 : 32,
        texY: legacy ? 16 : 48,
        rotX: -armSwing,
        pivotY: -20,
      });

      // Legs
      addBox({ x: -2, y: -8, z: 0, w: 4, h: 12, d: 4, texX: 0, texY: 16, rotX: legSwing, pivotY: -8 });
      addBox({
        x: 2,
        y: -8,
        z: 0,
        w: 4,
        h: 12,
        d: 4,
        texX: legacy ? 0 : 16,
        texY: legacy ? 16 : 48,
        rotX: -legSwing,
        pivotY: -8,
      });

      // Cape: its own texture, and mirrored because the outer side is the one
      // the cape layout puts in the front slot.
      const cape = capeRef.current;
      if (cape) {
        const sway = ((isAnimating ? 14 + Math.sin(animTimeRef.current * 2) * 8 : 10) * Math.PI) / 180;
        addBox({
          x: 0,
          y: -20.5,
          z: 2.2,
          w: 10,
          h: 16,
          d: 1,
          texX: 0,
          texY: 0,
          texture: cape,
          rotX: sway,
          pivotY: -20.5,
          mirrorZ: true,
        });
      }

      // The head layer is the only overlay a legacy skin has.
      if (displayLayers) {
        addBox({
          x: 0,
          y: -28 + headBob,
          z: 0,
          w: 8,
          h: 8,
          d: 8,
          texX: 32,
          texY: 0,
          isOverlay: true,
          expand: 0.5,
        });
      }

      if (layers) {
        addBox({ x: 0, y: -20, z: 0, w: 8, h: 12, d: 4, texX: 16, texY: 32, isOverlay: true, expand: 0.28 });
        addBox({
          x: -armX,
          y: -20,
          z: 0,
          w: armW,
          h: 12,
          d: 4,
          texX: 40,
          texY: 32,
          rotX: armSwing,
          pivotY: -20,
          isOverlay: true,
          expand: 0.28,
        });
        addBox({
          x: armX,
          y: -20,
          z: 0,
          w: armW,
          h: 12,
          d: 4,
          texX: 48,
          texY: 48,
          rotX: -armSwing,
          pivotY: -20,
          isOverlay: true,
          expand: 0.28,
        });
        addBox({
          x: -2,
          y: -8,
          z: 0,
          w: 4,
          h: 12,
          d: 4,
          texX: 0,
          texY: 32,
          rotX: legSwing,
          pivotY: -8,
          isOverlay: true,
          expand: 0.28,
        });
        addBox({
          x: 2,
          y: -8,
          z: 0,
          w: 4,
          h: 12,
          d: 4,
          texX: 0,
          texY: 48,
          rotX: -legSwing,
          pivotY: -8,
          isOverlay: true,
          expand: 0.28,
        });
      }

      // Ground shadow, drawn under the model.
      ctx.save();
      ctx.translate(cx, cy + 20 * (scale / 8.5));
      ctx.scale(1, 0.32);
      const shadow = ctx.createRadialGradient(0, 0, 4, 0, 0, 7 * scale);
      shadow.addColorStop(0, 'rgba(0,0,0,0.45)');
      shadow.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = shadow;
      ctx.beginPath();
      ctx.arc(0, 0, 7 * scale, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      /* Painter's algorithm, far faces first. The transparent second layer is
         drawn after every solid face so it blends against what is behind it. */
      const paint = (face: Face) => {
        const [a, b, , d] = face.points;

        // Affine map from the texture rectangle onto the face parallelogram.
        const ux = (b[0] - a[0]) / face.sw;
        const uy = (b[1] - a[1]) / face.sw;
        const vx = (d[0] - a[0]) / face.sh;
        const vy = (d[1] - a[1]) / face.sh;

        ctx.save();
        ctx.beginPath();
        ctx.moveTo(face.points[0][0], face.points[0][1]);
        ctx.lineTo(face.points[1][0], face.points[1][1]);
        ctx.lineTo(face.points[2][0], face.points[2][1]);
        ctx.lineTo(face.points[3][0], face.points[3][1]);
        ctx.closePath();
        ctx.clip();

        ctx.transform(ux, uy, vx, vy, a[0], a[1]);
        // Half a texel of overdraw hides seams between neighbouring faces.
        ctx.drawImage(
          face.texture,
          face.sx,
          face.sy,
          face.sw,
          face.sh,
          -0.5,
          -0.5,
          face.sw + 1,
          face.sh + 1
        );
        ctx.restore();

        if (face.light !== 1) {
          ctx.save();
          ctx.beginPath();
          ctx.moveTo(face.points[0][0], face.points[0][1]);
          ctx.lineTo(face.points[1][0], face.points[1][1]);
          ctx.lineTo(face.points[2][0], face.points[2][1]);
          ctx.lineTo(face.points[3][0], face.points[3][1]);
          ctx.closePath();
          ctx.clip();
          ctx.globalCompositeOperation = face.light > 1 ? 'lighter' : 'source-atop';
          ctx.fillStyle =
            face.light > 1
              ? `rgba(255, 255, 255, ${(face.light - 1) * 0.5})`
              : `rgba(0, 0, 0, ${1 - face.light})`;
          ctx.fill();
          ctx.restore();
        }
      };

      const solid = faces.filter((face) => !face.isOverlay).sort((p, q) => q.depth - p.depth);
      const overlay = faces.filter((face) => face.isOverlay).sort((p, q) => q.depth - p.depth);
      solid.forEach(paint);
      overlay.forEach(paint);

      if (isAnimating) {
        frameRef.current = requestAnimationFrame(() => {
          frameRef.current = null;
          drawRef.current();
        });
      }
    };

    drawRef.current = draw;
    requestDraw();

    return () => {
      if (frameRef.current !== null) {
        cancelAnimationFrame(frameRef.current);
        frameRef.current = null;
      }
    };
  }, [isAnimating, displayLayers, model, isTextureReady, requestDraw]);

  // Canvas resolution follows the element's real size and pixel density.
  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      const { width, height } = container.getBoundingClientRect();
      if (width === 0 || height === 0) return;
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      requestDraw();
    };

    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(container);
    return () => observer.disconnect();
  }, [requestDraw]);

  // --- pointer controls -----------------------------------------------------

  const handlePointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = {
      active: true,
      x: event.clientX,
      y: event.clientY,
      yaw: yawRef.current,
      pitch: pitchRef.current,
    };
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!dragRef.current.active) return;
    const dx = event.clientX - dragRef.current.x;
    const dy = event.clientY - dragRef.current.y;
    yawRef.current = dragRef.current.yaw + dx * 0.6;
    pitchRef.current = Math.max(-85, Math.min(85, dragRef.current.pitch + dy * 0.6));
    requestDraw();
  };

  const handlePointerUp = (event: React.PointerEvent<HTMLCanvasElement>) => {
    dragRef.current.active = false;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  const applyZoom = (delta: number) => {
    zoomRef.current = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, zoomRef.current + delta));
    requestDraw();
  };

  // Wheel is bound natively: React's synthetic wheel handler is passive, so it
  // cannot call preventDefault and the whole view scrolls while zooming.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      zoomRef.current = Math.max(
        MIN_ZOOM,
        Math.min(MAX_ZOOM, zoomRef.current - event.deltaY * 0.008)
      );
      requestDraw();
    };

    canvas.addEventListener('wheel', onWheel, { passive: false });
    return () => canvas.removeEventListener('wheel', onWheel);
  }, [requestDraw]);

  const handleResetView = () => {
    yawRef.current = 25;
    pitchRef.current = 10;
    zoomRef.current = 8.5;
    requestDraw();
  };

  /** Saves the texture itself, fetched as a blob so cross-origin URLs work. */
  const handleDownloadSkin = async () => {
    if (!skinUrl) return;
    try {
      const response = await fetch(skinUrl);
      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = objectUrl;
      link.download = `skin-${Date.now()}.png`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(objectUrl);
    } catch (error) {
      console.warn('Could not download the skin texture:', error);
    }
  };

  return (
    <div
      ref={containerRef}
      className="relative w-full h-full min-h-[320px] flex items-center justify-center select-none group"
    >
      <canvas
        ref={canvasRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        className="absolute inset-0 w-full h-full cursor-grab active:cursor-grabbing touch-none"
      />

      {loadError && (
        <div className="relative z-10 px-3 py-2 rounded-lg panel-inset text-xs text-neutral-300">
          {loadError}
        </div>
      )}

      <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex items-center gap-1.5 px-3 py-1.5 rounded-full glass text-neutral-300 opacity-80 group-hover:opacity-100 transition-opacity z-10">
        <button
          type="button"
          onClick={() => setIsAnimating((value) => !value)}
          title={isAnimating ? 'Pause animation' : 'Start animation'}
          aria-label={isAnimating ? 'Pause animation' : 'Start animation'}
          className="p-1.5 hover:text-neutral-100 hover:bg-white/10 rounded-full transition-colors"
        >
          {isAnimating ? <Pause size={15} /> : <Play size={15} />}
        </button>

        <button
          type="button"
          onClick={() => setDisplayLayers((value) => !value)}
          title="Toggle hat and jacket layers"
          aria-label="Toggle hat and jacket layers"
          aria-pressed={displayLayers}
          className={`p-1.5 rounded-full transition-colors ${
            displayLayers ? 'text-neutral-100 bg-white/15' : 'hover:text-neutral-100 hover:bg-white/10'
          }`}
        >
          <Layers size={15} />
        </button>

        <div className="w-px h-4 bg-white/15" />

        <button
          type="button"
          onClick={() => applyZoom(1)}
          title="Zoom in"
          aria-label="Zoom in"
          className="p-1.5 hover:text-neutral-100 hover:bg-white/10 rounded-full transition-colors"
        >
          <ZoomIn size={15} />
        </button>

        <button
          type="button"
          onClick={() => applyZoom(-1)}
          title="Zoom out"
          aria-label="Zoom out"
          className="p-1.5 hover:text-neutral-100 hover:bg-white/10 rounded-full transition-colors"
        >
          <ZoomOut size={15} />
        </button>

        <button
          type="button"
          onClick={handleResetView}
          title="Reset the camera"
          aria-label="Reset the camera"
          className="p-1.5 hover:text-neutral-100 hover:bg-white/10 rounded-full transition-colors"
        >
          <RotateCw size={15} />
        </button>

        <button
          type="button"
          onClick={handleDownloadSkin}
          title="Download the skin texture"
          aria-label="Download the skin texture"
          className="p-1.5 hover:text-neutral-100 hover:bg-white/10 rounded-full transition-colors"
        >
          <Download size={15} />
        </button>
      </div>

      <div className="absolute top-3 right-3 text-[11px] font-mono uppercase tracking-wider text-neutral-400 px-2 py-0.5 rounded panel-inset z-10">
        {model}
      </div>
    </div>
  );
};
