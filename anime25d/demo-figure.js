import { CanvasTexture, MathUtils } from 'three';
import { bindJoints, bindLocal, openBoneSetup } from './rig-map.js';

const outline = '#261f38';
const skin = '#ecad98';
const shade = '#d78283';
const shadow = '#a85d71';
const jersey = '#526b9d';
const jerseyLight = '#7295c8';
const shorts = '#373857';
const hair = '#44365d';
const hairLight = '#675282';

function paint(ctx, points, fill, stroke = outline, width = 2.5) {
  const path = new Path2D(points);
  if (fill) {
    ctx.fillStyle = fill;
    ctx.fill(path);
  }
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = width;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.stroke(path);
  }
}

function limbArtwork(ctx, arm, length, middle) {
  if (arm) {
    paint(ctx, `M -13 0 Q -12 -15 8 -17 C 35 -17 56 -12 ${middle} -11
      Q ${middle+20} -11 ${length-3} -8 Q ${length+7} 0 ${length-3} 8
      C ${middle+34} 11 ${middle+16} 13 ${middle} 13 Q 45 15 13 19 Q -12 19 -13 0 Z`, skin);
    paint(ctx, `M 48 -13 Q 70 -11 ${middle} -11 Q ${middle+30} -11 ${length-3} -8
      L ${length+2} -4 Q ${middle+26} -4 ${middle-6} -7 L 49 -7 Z`, shade, null);
    paint(ctx, 'M -13 0 Q -12 -16 8 -18 Q 24 -18 38 -16 L 41 17 Q 24 19 10 20 Q -13 19 -13 0 Z', jersey);
    paint(ctx, 'M 33 -15 L 36 17', null, jerseyLight, 3);
  } else {
    paint(ctx, `M -12 -22 Q 11 -27 38 -24 C 70 -22 97 -15 ${middle} -14
      C ${middle+29} -13 ${middle+47} -14 ${length-3} -10 Q ${length+9} -4 ${length+2} 10
      C ${middle+50} 16 ${middle+23} 19 ${middle} 15
      C 89 15 55 22 19 26 Q -12 27 -12 -22 Z`, skin);
    paint(ctx, `M 73 -21 Q 104 -15 ${middle} -14 C ${middle+30} -13 ${middle+56} -14 ${length} -10
      L ${length+1} -3 Q ${middle+48} -3 ${middle+30} -7 Q 103 -4 73 -13 Z`, shade, null);
    paint(ctx, 'M -13 -24 Q 8 -28 29 -26 L 56 -22 Q 62 0 57 23 L 22 27 Q 0 28 -13 24 Z', shorts);
    paint(ctx, 'M 51 -21 Q 54 0 51 23', null, '#7b7da4', 2);
    paint(ctx, `M ${length-35} -12 Q ${length-24} -1 ${length-35} 13
      L ${length+1} 12 L ${length+4} -8 Z`, '#dbcce3');
  }
}

export function createDemoFigure(prepareTexture) {
  const images = [];
  const textures = new Map();
  const slots = [];
  const attachments = {};
  const order = {};

  function layer(id, bone, depth, [minX, minY, maxX, maxY], artwork, { columns = 1, rows = 1, weights } = {}) {
    const canvas = document.createElement('canvas');
    canvas.width = Math.ceil((maxX - minX) * 2);
    canvas.height = Math.ceil((maxY - minY) * 2);
    const ctx = canvas.getContext('2d');
    ctx.setTransform(canvas.width / (maxX - minX), 0, 0, -canvas.height / (maxY - minY),
      -minX * canvas.width / (maxX - minX), maxY * canvas.height / (maxY - minY));
    artwork(ctx);
    images.push({ id, name: id, src: '', width: canvas.width, height: canvas.height });
    textures.set(id, prepareTexture(new CanvasTexture(canvas)));

    const uvs = [], vertices = [], triangles = [], influences = [];
    for (let row = 0; row <= rows; row++) {
      for (let col = 0; col <= columns; col++) {
        const u = col / columns, v = row / rows;
        const x = MathUtils.lerp(minX, maxX, u), y = MathUtils.lerp(maxY, minY, v);
        uvs.push(u, v);
        vertices.push(...bindLocal(bone, x, y));
        influences.push((weights?.(x, y) ?? [[bone, 1]]).filter(([, weight]) => weight > 0).map(([id, weight]) => {
          const [xLocal, yLocal] = bindLocal(id, x, y);
          return { bone: id, x: xLocal, y: yLocal, weight };
        }));
        if (row < rows && col < columns) {
          const i = row * (columns + 1) + col;
          triangles.push(i, i + columns + 1, i + 1, i + 1, i + columns + 1, i + columns + 2);
        }
      }
    }
    order[id] = depth;
    slots.push({ id, name: id, bone, attachment: id, color: '#ffffff', blend: 'normal' });
    attachments[id] = { [id]: { type: 'mesh', name: id, image: id, color: '#ffffff', vertices, uvs, triangles, weights: influences, hull: 4 } };
  }

  for (const [side, sign] of [['left', -1], ['right', 1]]) {
    for (const kind of ['arm', 'leg']) {
      const arm = kind === 'arm';
      const upper = side + (arm ? 'Arm' : 'Thigh');
      const hinge = side + (arm ? 'Elbow' : 'Knee');
      const lower = side + (arm ? 'Forearm' : 'Shin');
      const start = bindJoints.get(upper);
      const length = start.length + bindJoints.get(lower).length;
      const c = Math.cos(start.angle), s = Math.sin(start.angle);
      const tipX = start.x + c * length, tipY = start.y + s * length;
      const margin = arm ? 25 : 30;
      layer(side + '-' + kind, upper, arm ? 16 : 5,
        [Math.min(start.x, tipX) - margin, tipY - margin, Math.max(start.x, tipX) + margin, start.y + margin], ctx => {
          ctx.transform(c, s, -s, c, start.x, start.y);
          limbArtwork(ctx, arm, length, start.length);
        }, { columns: 9, rows: 22, weights(x, y) {
          const [distance] = bindLocal(upper, x, y);
          const fade = MathUtils.smoothstep(distance, start.length - 24, start.length + 24);
          const middle = .78 * (1 - MathUtils.smoothstep(Math.abs(distance - start.length), 0, 21));
          return [[upper, (1 - fade) * (1 - middle)], [hinge, middle], [lower, fade * (1 - middle)]];
        } });
    }

    const hand = bindJoints.get(side + 'Hand');
    layer(side + '-hand', hand.id, 17, [hand.x - 18, hand.y - 41, hand.x + 18, hand.y + 17], ctx => {
      const c = Math.cos(hand.angle), s = Math.sin(hand.angle);
      ctx.transform(c, s, -s, c, hand.x, hand.y);
      ctx.scale(1, sign);
      paint(ctx, 'M -6 -7 Q 5 -10 15 -10 L 29 -7 Q 35 -5 33 0 L 31 6 Q 29 12 23 11 L 17 8 Q 19 15 13 14 L 6 9 L -6 7 Z', skin);
      paint(ctx, 'M 19 -4 L 30 -3 M 20 1 L 31 2', null, shadow, 1.35);
    });

    const foot = bindJoints.get(side + 'Foot');
    layer(side + '-shoe', foot.id, 6, [foot.x - 31, -7, foot.x + 31, 37], ctx => {
      ctx.translate(foot.x, foot.y);
      ctx.scale(sign, 1);
      paint(ctx, 'M -16 13 Q -9 16 10 13 L 15 4 Q 23 4 25 -7 Q 24 -15 9 -16 L -14 -16 Q -23 -15 -21 -6 Z', '#414866');
      paint(ctx, 'M -19 -8 Q -9 -12 24 -8 L 24 -13 Q 13 -17 -17 -15 Z', '#d4d8ed', outline, 1.6);
      paint(ctx, 'M -9 4 L 12 3 M -8 0 L 13 -1', null, '#a2cadd', 2);
    });
  }

  layer('shorts', 'pelvis', 28, [-66, 215, 66, 319], ctx => {
    paint(ctx, 'M -43 304 Q 0 314 43 304 Q 52 278 58 248 Q 42 226 16 231 L 0 240 L -16 231 Q -41 226 -58 248 Q -56 276 -43 304 Z', shorts);
    paint(ctx, 'M -49 273 Q 0 263 49 273 L 47 285 Q 0 276 -47 285 Z', '#515575', null);
    paint(ctx, 'M 0 266 V 241 M -44 269 L -32 250 M 44 269 L 32 250', null, '#7d80a6', 1.8);
  });
  layer('neck', 'torso', 23, [-32, 396, 32, 455], ctx => {
    paint(ctx, 'M -14 450 L 14 450 Q 12 420 24 407 Q 0 394 -25 407 Q -13 420 -14 450 Z', skin);
    paint(ctx, 'M -13 443 Q 0 431 13 441 L 13 428 Q 1 419 -13 424 Z', shade, null);
  });
  layer('jersey', 'torso', 30, [-86, 280, 86, 420], ctx => {
    paint(ctx, `M -71 399 Q -48 408 -22 413 Q 0 393 22 413 Q 48 408 71 399
      Q 77 383 70 369 Q 61 365 53 371 C 54 353 40 329 40 314 L 45 292
      Q 0 282 -45 292 L -40 314 C -40 329 -54 353 -53 371 Q -61 365 -70 369 Q -77 383 -71 399 Z`, jersey);
    paint(ctx, 'M -48 358 Q -20 337 -35 305 L -42 294 L -40 315 Z M 52 366 Q 42 336 37 314 L 43 294 L 40 317 Z', '#435c8b', null);
    paint(ctx, 'M -22 412 Q 0 390 22 412 M -44 300 Q 0 291 44 300 M 36 376 L 50 375', null, '#9dd2df', 3);
    paint(ctx, 'M -12 354 L 0 363 L 12 354 L 0 345 Z', '#a1d7e6', null);
  });
  layer('hair-back', 'head', 21, [-68, 397, 68, 552], ctx => {
    paint(ctx, `M -53 509 Q -54 544 0 545 Q 52 546 53 505 L 55 448 Q 58 424 64 419
      Q 44 412 34 424 Q 38 403 17 400 Q 7 411 0 414 Q -12 399 -29 401
      Q -38 412 -36 426 Q -52 418 -64 427 Q -52 453 -53 509 Z`, hair);
  });
  layer('head', 'head', 40, [-56, 422, 56, 542], ctx => {
    paint(ctx, `M -40 493 C -41 526 -22 537 0 536 C 22 537 41 526 40 493
      Q 51 493 50 481 Q 47 465 38 468 Q 28 439 0 432 Q -29 440 -38 468
      Q -47 465 -50 481 Q -51 493 -40 493 Z`, skin);
    paint(ctx, 'M -38 477 Q -27 449 0 442 Q 29 452 38 478 Q 26 440 0 432 Q -27 440 -38 477 Z', shade, null);
  });
  layer('face', 'head', 41, [-42, 449, 42, 505], ctx => {
    for (const sign of [-1, 1]) {
      ctx.save(); ctx.scale(sign, 1);
      paint(ctx, 'M 8 487 Q 21 500 35 488 Q 29 475 21 476 Q 12 476 8 487 Z', '#fff2ea', outline, 2);
      paint(ctx, 'M 14 488 Q 17 496 25 493 Q 29 490 28 482 Q 24 476 18 479 Q 14 481 14 488 Z', '#5a587b', null);
      paint(ctx, 'M 18 489 a 3 3 0 1 1 0 -.01 Z', '#fcf3f4', null);
      paint(ctx, 'M 10 498 Q 26 505 36 495', null, hair, 2);
      paint(ctx, 'M 26 468 L 32 470', null, shade, 2.2);
      ctx.restore();
    }
    paint(ctx, 'M 0 477 L -2 468 L 2 468 M -6 455 Q 0 452 6 456', null, shadow, 1.6);
  });
  layer('hair-front', 'head', 42, [-60, 464, 60, 553], ctx => {
    paint(ctx, `M -54 517 Q -48 546 0 548 Q 50 548 54 511 Q 57 486 43 469 L 35 507
      Q 29 493 17 492 Q 17 510 12 514 Q 0 494 -15 490 Q -13 499 -15 507
      Q -24 493 -38 494 L -44 470 Q -56 489 -54 517 Z`, hair);
    paint(ctx, `M -44 518 Q -30 543 5 539 Q 30 540 44 520 Q 28 527 19 526
      Q 0 533 -14 523 Q -31 514 -44 518 Z`, hairLight, null);
    paint(ctx, 'M 39 507 L 50 509 M 40 503 L 51 505', null, '#a3dae3', 2.2);
  });

  return {
    order,
    asset: {
      baseUrl: import.meta.url,
      textures,
      doc: {
        format: 'openbone', version: 1, name: 'Atelier-Demonstrationsfigur', width: 660, height: 610,
        originX: 330, originY: 578, fps: 30, background: '#1a1f2c', images,
        skeleton: { bones: openBoneSetup(), slots, skins: [{ id: 'default', name: 'default', attachments }], ik: [], transform: [], path: [], physics: [] },
        animations: [], events: [], stateMachines: [], scripts: []
      }
    }
  };
}
