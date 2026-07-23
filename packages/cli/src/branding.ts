import { stdout } from 'node:process';

/**
 * localbrain branding & theme — the octopus 🐙.
 *
 * The octopus is the mascot: a famously smart creature (a big brain for its
 * size), many tentacles (many capabilities — classify, extract, summarize,
 * embed, chat), yet small and nimble (runs locally on a tiny model).
 *
 * Everything here degrades gracefully: truecolor gradient when the terminal
 * supports it, a single brand color on basic terminals, and plain text under
 * NO_COLOR or when piped (non-TTY).
 */

const isTTY = !!stdout.isTTY && !process.env.NO_COLOR;
const truecolor = isTTY && /truecolor|24bit/i.test(process.env.COLORTERM ?? '');

type RGB = [number, number, number];

// Ocean → mind gradient: violet → magenta → cyan.
const VIOLET: RGB = [149, 128, 255];
const MAGENTA: RGB = [214, 122, 224];
const CYAN: RGB = [86, 204, 214];

function esc(code: string, s: string): string {
  return isTTY ? `\x1b[${code}m${s}\x1b[0m` : s;
}

function fg(rgb: RGB, s: string): string {
  if (!isTTY) return s;
  if (truecolor) return `\x1b[38;2;${rgb[0]};${rgb[1]};${rgb[2]}m${s}\x1b[0m`;
  return `\x1b[35m${s}\x1b[0m`; // magenta fallback on 16-color terminals
}

function lerp(a: number, b: number, t: number): number {
  return Math.round(a + (b - a) * t);
}

/** Interpolate across VIOLET → MAGENTA → CYAN for position t in [0,1]. */
function gradientAt(t: number): RGB {
  if (t < 0.5) {
    const u = t / 0.5;
    return [lerp(VIOLET[0], MAGENTA[0], u), lerp(VIOLET[1], MAGENTA[1], u), lerp(VIOLET[2], MAGENTA[2], u)];
  }
  const u = (t - 0.5) / 0.5;
  return [lerp(MAGENTA[0], CYAN[0], u), lerp(MAGENTA[1], CYAN[1], u), lerp(MAGENTA[2], CYAN[2], u)];
}

/** Color a string with the left→right brand gradient (per visible char). */
export function gradient(text: string): string {
  if (!isTTY) return text;
  const chars = [...text];
  const n = Math.max(1, chars.length - 1);
  return chars.map((ch, i) => (ch === ' ' ? ch : fg(gradientAt(i / n), ch))).join('');
}

/** Named theme colors used across the CLI. */
export const theme = {
  brand: (s: string) => fg(VIOLET, s),
  accent: (s: string) => fg(CYAN, s),
  bold: (s: string) => esc('1', s),
  dim: (s: string) => esc('2', s),
  green: (s: string) => esc('32', s),
  yellow: (s: string) => esc('33', s),
  red: (s: string) => esc('31', s),
};

/** The octopus mark for inline use. */
export const MARK = '🐙';

// A filled octopus silhouette: domed mantle, brow, real eyes (@), curling arms.
// '@' marks eye positions — rendered bright white so they read as eyes.
const OCTOPUS = [
  '     ╭▄▄▄▄╮',
  '   ▗█████████▖',
  '  ▟███████████▙',
  '  █████████████',
  '  ███@█████@███',
  '  ▜███████████▛',
  '   ╰┬─┬──┬─┬╯',
  '  ╭─╯ │  │ ╰─╮',
  ' ╭╯  ╭╯  ╰╮  ╰╮',
  ' ╰╮  ╰╮  ╭╯  ╭╯',
];

const EYE: [number, number, number] = [237, 240, 255];

/**
 * Render the octopus: each line colored by vertical position (violet → cyan),
 * with '@' eye markers rendered bright white so they stand out on the body.
 */
function renderOctopus(lines: string[]): string {
  const n = Math.max(1, lines.length - 1);
  if (!isTTY) return lines.map((l) => l.replace(/@/g, '◉')).join('\n');
  return lines
    .map((line, i) => {
      const rgb = gradientAt(i / n);
      return [...line].map((ch) => (ch === '@' ? fg(EYE, '◉') : ch === ' ' ? ' ' : fg(rgb, ch))).join('');
    })
    .join('\n');
}

/**
 * The full startup banner: colored octopus + gradient wordmark + tagline.
 * Shown once for `npx localbrain` and `--help`.
 */
export function banner(): string {
  const art = renderOctopus(OCTOPUS.map((line) => '  ' + line));
  const wordmark = gradient('l o c a l b r a i n');
  const tagline = theme.dim('a small brain with a long reach — free, private, local AI');
  return `\n${art}\n\n     ${wordmark}\n     ${tagline}\n`;
}

/** A compact one-line mark, e.g. for command headers. */
export function markLine(subtitle?: string): string {
  const name = gradient('localbrain');
  return `${MARK} ${name}${subtitle ? theme.dim(' · ' + subtitle) : ''}`;
}
