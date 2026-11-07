import { test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { compare, expectNoErrors, facePoint, openEditor, paint, pickTool, scribble, setSlider, settle, tap } from './helpers';

const fixture = JSON.parse(readFileSync('tests/fixtures/portrait.json', 'utf8')) as { blemishes: { x: number; y: number }[] };

/** Regions of the fixture portrait, in its own coordinates. */
const EYE_L: [number, number] = [-0.155, -0.06];
const EYE_R: [number, number] = [0.155, -0.06];

type Clip = { x: number; y: number; w: number; h: number };

interface Check {
  name: string;
  title: string;
  clip: Clip;
  /** Zooms here after the edit and uses the hold-to-compare view for the "before" shot. */
  zoom?: [number, number];
  run: (page: Page) => Promise<void>;
}

const FACE: Clip = { x: -0.3, y: -0.42, w: 0.6, h: 0.84 };
const EYES: Clip = { x: -0.26, y: -0.16, w: 0.52, h: 0.2 };
const MOUTH: Clip = { x: -0.15, y: 0.16, w: 0.3, h: 0.17 };
const CHEEK: Clip = { x: -0.28, y: 0.0, w: 0.25, h: 0.25 };

const CHECKS: Check[] = [
  {
    name: '01-manchas',
    title: 'Manchas: toque único em cada mancha',
    clip: FACE,
    run: async (page) => {
      await pickTool(page, 'skin', 'heal');
      for (const b of fixture.blemishes.slice(0, 14)) await tap(page, b.x, b.y);
    },
  },
  {
    name: '02-suavizar-leve',
    title: 'Suavizar: modo Leve, a 100%',
    clip: CHEEK,
    zoom: [-0.16, 0.13],
    run: async (page) => {
      await pickTool(page, 'skin', 'smooth');
      await paint(page, scribble(-0.15, 0.12, 0.11, 0.1, 10));
    },
  },
  {
    name: '03-suavizar-intenso',
    title: 'Suavizar: modo Intenso, a 100%',
    clip: CHEEK,
    zoom: [-0.16, 0.13],
    run: async (page) => {
      await pickTool(page, 'skin', 'smooth');
      await page.getByRole('radio', { name: 'Intenso' }).click();
      await paint(page, scribble(-0.15, 0.12, 0.11, 0.1, 10));
    },
  },
  {
    name: '04-olheiras',
    title: 'Olheiras: clarear e neutralizar',
    clip: EYES,
    run: async (page) => {
      await pickTool(page, 'skin', 'undereye');
      await setSlider(page, 'Tamanho', 40);
      await paint(page, [[-0.21, -0.012], [-0.1, -0.012]], 2);
      await paint(page, [[0.1, -0.012], [0.21, -0.012]], 2);
    },
  },
  {
    name: '05-tom-de-pele',
    title: 'Tom de pele: mais quente e clara na metade esquerda',
    clip: FACE,
    run: async (page) => {
      await pickTool(page, 'skin', 'skintone');
      await setSlider(page, 'Matiz', 40);
      await setSlider(page, 'Luminância', 35);
      await paint(page, scribble(-0.13, 0.08, 0.1, 0.2, 8));
    },
  },
  {
    name: '06-iluminador',
    title: 'Iluminador: maçã do rosto e ponte do nariz',
    clip: FACE,
    run: async (page) => {
      await pickTool(page, 'skin', 'highlight');
      await paint(page, [[-0.2, 0.05], [-0.11, 0.03]], 2);
      await paint(page, [[-0.012, -0.02], [-0.012, 0.11]], 2);
    },
  },
  {
    name: '07-clarear-dentes',
    title: 'Clarear: dentes',
    clip: MOUTH,
    run: async (page) => {
      await pickTool(page, 'eyes', 'whiten');
      await paint(page, [[-0.08, 0.232], [0.08, 0.232]]);
      await paint(page, [[-0.07, 0.247], [0.07, 0.247]]);
    },
  },
  {
    name: '08-olho-vermelho',
    title: 'Olho vermelho',
    clip: EYES,
    run: async (page) => {
      await pickTool(page, 'eyes', 'redeye');
      await tap(page, ...EYE_L);
    },
  },
  {
    name: '09-cor-dos-olhos',
    title: 'Cor dos olhos: azul na íris',
    clip: EYES,
    run: async (page) => {
      await pickTool(page, 'eyes', 'eyecolor');
      await setSlider(page, 'Tamanho', 50);
      await tap(page, ...EYE_L);
      await tap(page, ...EYE_R);
    },
  },
  {
    name: '10-brilho-no-olhar',
    title: 'Brilho no olhar',
    clip: EYES,
    run: async (page) => {
      await pickTool(page, 'eyes', 'sparkle');
      await setSlider(page, 'Tamanho', 50);
      await tap(page, ...EYE_L);
      await tap(page, ...EYE_R);
    },
  },
  {
    name: '11-maquiagem',
    title: 'Batom, blush, sombra, sobrancelha e contorno',
    clip: FACE,
    run: async (page) => {
      await pickTool(page, 'makeup', 'lips');
      await setSlider(page, 'Tamanho', 28);
      await paint(page, [[-0.08, 0.232], [-0.04, 0.212], [0, 0.209], [0.04, 0.212], [0.08, 0.232]]);
      await setSlider(page, 'Tamanho', 36);
      await paint(page, [[-0.07, 0.268], [-0.04, 0.282], [0, 0.285], [0.04, 0.282], [0.07, 0.268]]);
      await pickTool(page, 'makeup', 'blush');
      await paint(page, [[-0.19, 0.09], [-0.13, 0.08]], 3);
      await paint(page, [[0.13, 0.08], [0.19, 0.09]], 3);
      await pickTool(page, 'makeup', 'eyeshadow');
      await paint(page, [[-0.21, -0.1], [-0.1, -0.1]], 2);
      await paint(page, [[0.1, -0.1], [0.21, -0.1]], 2);
      await pickTool(page, 'makeup', 'brow');
      await paint(page, [[-0.235, -0.13], [-0.08, -0.14]], 2);
      await paint(page, [[0.08, -0.14], [0.235, -0.13]], 2);
      await pickTool(page, 'makeup', 'contour');
      await paint(page, [[-0.25, 0.16], [-0.16, 0.24]], 3);
      await paint(page, [[0.25, 0.16], [0.16, 0.24]], 3);
    },
  },
  {
    name: '12-cabelo',
    title: 'Cabelo: trocar a cor',
    clip: { x: -0.36, y: -0.48, w: 0.72, h: 0.5 },
    run: async (page) => {
      await pickTool(page, 'makeup', 'hair');
      await paint(page, [[-0.15, -0.4], [0.15, -0.4]]);
      await paint(page, [[-0.16, -0.35], [0.16, -0.35]]);
    },
  },
  {
    name: '13-sardas',
    title: 'Sardas sobre nariz e bochechas',
    clip: FACE,
    run: async (page) => {
      await pickTool(page, 'makeup', 'freckles');
      await setSlider(page, 'Densidade', 60);
      await paint(page, [[-0.2, 0.06], [0, 0.03], [0.2, 0.06]], 2);
    },
  },
  {
    name: '14-liquify',
    title: 'Liquify: empurrar a bochecha e inflar um olho',
    clip: FACE,
    run: async (page) => {
      await pickTool(page, 'shape', 'liquify');
      await paint(page, [[-0.29, 0.14], [-0.24, 0.14]]);
      await page.getByRole('radio', { name: 'Inflar' }).click();
      await setSlider(page, 'Tamanho', 45);
      await paint(page, [EYE_R, EYE_R]);
    },
  },
  {
    name: '15-ajustes',
    title: 'Ajustes: contraste, sombras, temperatura, vibrance, granulação e vinheta',
    clip: FACE,
    run: async (page) => {
      await pickTool(page, 'light', 'adjust');
      await setSlider(page, 'Contraste', 25);
      await setSlider(page, 'Sombras', 30);
      await setSlider(page, 'Temperatura', 18);
      await setSlider(page, 'Vibrance', 30);
      await setSlider(page, 'Granulação', 25);
      await setSlider(page, 'Vinheta', 45);
    },
  },
  {
    name: '16-filtro',
    title: 'Filtro: Cinema à Tarde',
    clip: FACE,
    run: async (page) => {
      await pickTool(page, 'looks', 'filters');
      await page.locator('[data-filter=cinema-tarde]').click();
    },
  },
  {
    name: '17-filtro-mono',
    title: 'Filtro: Prata',
    clip: FACE,
    run: async (page) => {
      await pickTool(page, 'looks', 'filters');
      await page.locator('[data-filter=prata]').click();
    },
  },
  {
    name: '18-blur-radial',
    title: 'Desfoque radial',
    clip: { x: -0.4, y: -0.5, w: 0.8, h: 1 },
    run: async (page) => {
      await pickTool(page, 'light', 'blur');
      await page.getByRole('radio', { name: 'Radial' }).click();
      await setSlider(page, 'Intensidade', 80);
    },
  },
  {
    name: '19-blur-tilt',
    title: 'Tilt-shift',
    clip: { x: -0.4, y: -0.5, w: 0.8, h: 1 },
    run: async (page) => {
      await pickTool(page, 'light', 'blur');
      await page.getByRole('radio', { name: 'Tilt-shift' }).click();
      await setSlider(page, 'Intensidade', 80);
      await setSlider(page, 'Área em foco', 12);
      await setSlider(page, 'Ângulo', 15);
    },
  },
];

for (const check of CHECKS) {
  test(check.name, async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.setViewportSize({ width: 1500, height: 1120 });
    await openEditor(page);
    const c = check.clip;
    const [x0, y0] = facePoint(page, c.x, c.y);
    const [x1, y1] = facePoint(page, c.x + c.w, c.y + c.h);
    const clip = { x: x0, y: y0, width: x1 - x0, height: y1 - y0 };
    let before = check.zoom ? Buffer.alloc(0) : await page.screenshot({ clip });
    await check.run(page);
    await settle(page, 500);
    if (check.zoom) {
      await page.mouse.move(...facePoint(page, ...check.zoom));
      await page.mouse.wheel(0, -320);
      await page.mouse.move(2, 2);
      await settle(page, 500);
      await page.keyboard.down('Backslash');
      await settle(page, 300);
      before = await page.screenshot({ clip });
      await page.keyboard.up('Backslash');
      await settle(page, 300);
    }
    const after = await page.screenshot({ clip });
    await compare(page, check.name, check.title, before, after);
    expectNoErrors(errors);
  });
}
