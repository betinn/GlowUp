import { test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { compare, expectNoErrors, facePoint, openEditor, paint, pickTool, scribble, setSlider, settle, tap, limitSettled } from './helpers';

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
const HAIR: Clip = { x: -0.4, y: -0.5, w: 0.8, h: 0.9 };

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
    title: 'Dentes: clarear',
    clip: MOUTH,
    run: async (page) => {
      await pickTool(page, 'makeup', 'whiten');
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
    name: '21-branco-do-olho',
    title: 'Branco do olho: o traço passa pela íris e ela fica como está',
    clip: EYES,
    run: async (page) => {
      await pickTool(page, 'eyes', 'sclera');
      await setSlider(page, 'Tamanho', 50);
      await paint(page, [[EYE_L[0] - 0.06, EYE_L[1]], [EYE_L[0] + 0.06, EYE_L[1]]], 2);
      await paint(page, [[EYE_R[0] - 0.06, EYE_R[1]], [EYE_R[0] + 0.06, EYE_R[1]]], 2);
    },
  },
  {
    name: '22-limite-dentes',
    title: 'Dentes: um traço largo por cima da boca toda só pega os dentes',
    clip: MOUTH,
    run: async (page) => {
      await pickTool(page, 'makeup', 'whiten');
      await setSlider(page, 'Tamanho', 70);
      await paint(page, [[-0.14, 0.24], [0.14, 0.24]]);
    },
  },
  {
    name: '11-maquiagem',
    title: 'Batom, blush, sombra, sobrancelha e contorno, cada um no Automático',
    clip: FACE,
    run: async (page) => {
      for (const tool of ['lips', 'blush', 'eyeshadow', 'brow', 'contour']) await pickTool(page, 'makeup', tool, { auto: true });
    },
  },
  {
    name: '12-cabelo',
    title: 'Cabelo, Cor: acobreado no Automático, só onde o detector achou fios',
    clip: HAIR,
    run: async (page) => {
      await pickTool(page, 'hair', 'haircolor', { auto: true });
      await page.locator('.swatch').nth(2).click();
      await setSlider(page, 'Intensidade', 85);
    },
  },
  {
    name: '13-sardas',
    title: 'Sardas sobre nariz e bochechas',
    clip: FACE,
    run: async (page) => {
      await pickTool(page, 'makeup', 'freckles', { auto: true });
      await setSlider(page, 'Quantidade', 60);
    },
  },
  {
    name: '14-liquify',
    title: 'Liquify: empurrar a bochecha e inflar um olho',
    clip: FACE,
    run: async (page) => {
      await pickTool(page, 'shape', 'liquify');
      await limitSettled(page);
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
      await limitSettled(page);
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
      await pickTool(page, 'filters', 'filters');
      await page.locator('[data-filter=cinema-tarde]').click();
    },
  },
  {
    name: '17-filtro-mono',
    title: 'Filtro: Prata',
    clip: FACE,
    run: async (page) => {
      await pickTool(page, 'filters', 'filters');
      await page.locator('[data-filter=prata]').click();
    },
  },
  {
    name: '18-blur-radial',
    title: 'Desfoque radial',
    clip: { x: -0.4, y: -0.5, w: 0.8, h: 1 },
    run: async (page) => {
      await pickTool(page, 'light', 'blur');
      await limitSettled(page);
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
      await limitSettled(page);
      await page.getByRole('radio', { name: 'Tilt-shift' }).click();
      await setSlider(page, 'Intensidade', 80);
      await setSlider(page, 'Área em foco', 12);
      await setSlider(page, 'Ângulo', 15);
    },
  },
  {
    name: '23-cabelo-escurecer',
    title: 'Cabelo, Escurecer: a 80%, o brilho fica',
    clip: HAIR,
    run: async (page) => {
      await pickTool(page, 'hair', 'hairdark', { auto: true });
      await setSlider(page, 'Intensidade', 80);
    },
  },
  {
    name: '24-cabelo-clarear',
    title: 'Cabelo, Clarear: a 80%, com o dourado de fábrica',
    clip: HAIR,
    run: async (page) => {
      await pickTool(page, 'hair', 'hairlight', { auto: true });
      await setSlider(page, 'Intensidade', 80);
    },
  },
  {
    name: '25-cabelo-contraste',
    title: 'Cabelo, Contraste: no máximo',
    clip: HAIR,
    run: async (page) => {
      await pickTool(page, 'hair', 'haircontrast', { auto: true });
      await setSlider(page, 'Contraste', 100);
    },
  },
  {
    name: '26-cabelo-nitidez',
    title: 'Cabelo, Nitidez: no máximo, de perto',
    clip: { x: -0.4, y: -0.2, w: 0.2, h: 0.25 },
    zoom: [-0.31, -0.08],
    run: async (page) => {
      await pickTool(page, 'hair', 'hairsharp', { auto: true });
      await setSlider(page, 'Intensidade', 100);
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
