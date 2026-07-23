import { useEffect, useRef, type RefObject } from 'react';
import { EntityType, BUILDING_CONFIGS } from '../game/gameEngine';
import { SPECIES_CONFIG } from '../game/gameEngine';
import type { WorldState } from '../game/gameEngine';
import type { ViewState } from '../game/viewState';

export default function MiniMap({
  worldRef,
  viewRef,
}: {
  worldRef: RefObject<WorldState>;
  viewRef: RefObject<ViewState>;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const frameCounter = useRef(0);

  useEffect(() => {
    let animId = 0;
    const draw = () => {
      frameCounter.current++;
      if (frameCounter.current % 5 === 0) {
        const world = worldRef.current;
        const camera = viewRef.current?.camera;
        const canvas = canvasRef.current;
        if (world && camera && canvas) {
          const ctx = canvas.getContext('2d');
          if (ctx) {
            const w = 140;
            const h = 100;
            ctx.fillStyle = '#72a85c';
            ctx.fillRect(0, 0, w, h);

            const scaleX = w / world.width;
            const scaleY = h / world.height;

            for (const e of world.entities) {
              if (!e.alive || e.type === EntityType.Grass) continue;
              const sx = e.x * scaleX;
              const sy = e.y * scaleY;
              if (e.type === EntityType.Tree) {
                ctx.fillStyle = '#166534';
                ctx.fillRect(sx - 1, sy - 1, 2, 2);
              } else if (e.type === EntityType.Human) {
                ctx.fillStyle = '#fbbf24';
                ctx.fillRect(sx - 1, sy - 1, 2, 2);
              } else {
                const speciesCfg = SPECIES_CONFIG[e.type];
                if (!speciesCfg) continue;
                ctx.fillStyle = speciesCfg.color;
                ctx.fillRect(sx - 1, sy - 1, 2, 2);
              }
            }

            for (const b of world.buildings) {
              if (!b.completed) continue;
              const buildingCfg = BUILDING_CONFIGS[b.type];
              if (!buildingCfg) continue;
              const sx = b.x * scaleX;
              const sy = b.y * scaleY;
              ctx.fillStyle = buildingCfg.backgroundColor;
              ctx.fillRect(sx - 2, sy - 2, 4, 3);
            }

            const camW = (world.width / camera.zoom) * scaleX * 0.5;
            const camH = (world.height / camera.zoom) * scaleY * 0.5;
            const camX = camera.x * scaleX - camW / 2;
            const camY = camera.y * scaleY - camH / 2;
            ctx.strokeStyle = '#fbbf24';
            ctx.lineWidth = 1;
            ctx.strokeRect(camX, camY, camW, camH);
          }
        }
      }
      animId = requestAnimationFrame(draw);
    };
    animId = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(animId);
  }, [worldRef, viewRef]);

  return (
    <div className="pointer-events-auto absolute bottom-4 left-4 overflow-hidden rounded-lg border border-stone-600 bg-stone-800/80 shadow-xl backdrop-blur">
      <canvas ref={canvasRef} width={140} height={100} className="block" />
    </div>
  );
}
