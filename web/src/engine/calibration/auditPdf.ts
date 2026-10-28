import type { AuditReport } from './auditReport';

/**
 * Renderizador de PDF do relatório de auditoria — escritor PDF mínimo em
 * TypeScript puro (fontes core Helvetica/Courier, codificação WinAnsi, A4).
 *
 * WHY sem dependências: o relatório deve nascer do mesmo commit que audita
 * em qualquer máquina com Node, sem instalar nada além do `npm ci` do app.
 * O texto é sanitizado para o repertório seguro (Latin-1 + mapeamentos
 * explícitos de travessões/setas), garantindo que nenhum glifo vire lixo.
 *
 * Determinismo: com o carimbo UTC fixo (injetável nos testes), dois
 * `renderAuditPdf` do mesmo relatório produzem os mesmos bytes.
 */

const PAGE_W = 595.276;
const PAGE_H = 841.89;
const MARGIN = 56.7;
const RIGHT = PAGE_W - MARGIN;

const BLACK: readonly [number, number, number] = [0, 0, 0];
const GRAY: readonly [number, number, number] = [0.38, 0.38, 0.38];
const LIGHT: readonly [number, number, number] = [0.75, 0.75, 0.75];
const GREEN: readonly [number, number, number] = [0, 0.45, 0.16];
const RED: readonly [number, number, number] = [0.7, 0, 0];

/** Mapeamentos explícitos para o repertório WinAnsi seguro do relatório. */
const REPLACEMENTS: Record<string, string> = {
  '–': '-',
  '—': '-',
  '…': '...',
  '≤': '<=',
  '≥': '>=',
  'α': 'alfa',
  '×': 'x',
  'χ': 'X',
  '²': '^2',
  '’': "'",
  '‘': "'",
  '“': '"',
  '”': '"',
  '·': '.',
};

function sanitize(value: string): string {
  let out = '';
  for (const ch of value) {
    const mapped = REPLACEMENTS[ch];
    if (mapped !== undefined) {
      out += mapped;
      continue;
    }
    out += (ch.codePointAt(0) ?? 0) <= 0xff ? ch : '?';
  }
  return out;
}

function pdfEscape(value: string): string {
  return sanitize(value)
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)');
}

/** Largura aproximada de texto Helvetica (suficiente para quebra de linha). */
function textWidth(value: string, size: number): number {
  let width = 0;
  for (const ch of sanitize(value)) {
    if ('ilj|!.,;:\'` '.includes(ch)) width += 0.3;
    else if ('ftrI()[]-'.includes(ch)) width += 0.38;
    else if ('mwMW@'.includes(ch)) width += 0.86;
    else if (ch >= 'A' && ch <= 'Z') width += 0.68;
    else if (ch >= '0' && ch <= '9') width += 0.556;
    else width += 0.52;
  }
  return width * size;
}

function wrapWords(value: string, size: number, maxWidth: number): string[] {
  const words = sanitize(value).split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (textWidth(candidate, size) <= maxWidth) {
      current = candidate;
    } else {
      if (current) lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  return lines.length > 0 ? lines : [''];
}

/** Porcentagem em formato pt-BR determinístico ("3,3%"). */
export function pctPtBr(value: number, decimals = 1): string {
  return `${(value * 100).toFixed(decimals).replace('.', ',')}%`;
}

interface TextOptions {
  font?: 'F1' | 'F2' | 'F3';
  size?: number;
  color?: readonly [number, number, number];
}

interface TableSpec {
  columns: Array<{ x: number; width?: number; label?: string }>;
  size: number;
  rowHeight: number;
}

export function renderAuditPdf(report: AuditReport): Uint8Array {
  const layout = (totalPages: number): string[] => {
    const streams: string[] = [];
    let ops: string[] = [];
    let pageNumber = 0;
    let y = PAGE_H - MARGIN;

    const text = (x: number, yy: number, value: string, opts: TextOptions = {}): void => {
      const { font = 'F1', size = 9, color = BLACK } = opts;
      ops.push(
        `BT /${font} ${size} Tf ${color.join(' ')} rg 1 0 0 1 ` +
          `${x.toFixed(2)} ${yy.toFixed(2)} Tm (${pdfEscape(value)}) Tj ET`,
      );
    };
    const line = (
      x1: number,
      yy1: number,
      x2: number,
      yy2: number,
      color: readonly [number, number, number] = LIGHT,
      width = 0.6,
    ): void => {
      ops.push(
        `${width} w ${color.join(' ')} RG ${x1.toFixed(2)} ${yy1.toFixed(2)} m ` +
          `${x2.toFixed(2)} ${yy2.toFixed(2)} l S`,
      );
    };
    const footer = (): void => {
      line(MARGIN, 58, RIGHT, 58, LIGHT, 0.5);
      text(
        MARGIN,
        46,
        `Volante Plus — relatório de auditoria (Fase 2) — ` +
          `conteúdo SHA-256: ${report.meta.contentSha256.slice(0, 26)}...`,
        { size: 7, color: GRAY },
      );
      text(RIGHT, 46, `página ${pageNumber} de ${totalPages}`, { size: 7, color: GRAY });
    };
    const newPage = (): void => {
      footer();
      streams.push(ops.join('\n'));
      ops = [];
      pageNumber += 1;
      y = PAGE_H - MARGIN;
    };
    const ensure = (needed: number): void => {
      if (y - needed < MARGIN + 26) newPage();
    };

    pageNumber = 1;

    // --- Cabeçalho -------------------------------------------------------
    y -= 6;
    text(MARGIN, y, 'Relatório de Auditoria Estatística', { font: 'F2', size: 15 });
    y -= 16;
    text(
      MARGIN,
      y,
      'Volante Plus — calibração do contrato de significância (docs/calibration-contract.md)',
      { size: 9.5, color: GRAY },
    );
    y -= 10;
    line(MARGIN, y, RIGHT, y);
    y -= 14;

    // --- Identidade da auditoria ----------------------------------------
    const meta = report.meta;
    const identity: Array<[string, string]> = [];
    identity.push([
      'Commit',
      meta.gitCommit
        ? `${meta.gitCommit.slice(0, 12)} (${meta.gitBranch ?? '?'}) — ` +
          `árvore ${meta.gitDirty ? 'suja' : 'limpa'}`
        : 'indisponível (execução fora de um repositório git)',
    ]);
    if (meta.gitSubject) identity.push(['Assunto', meta.gitSubject]);
    identity.push(['Pacote web', `v${meta.webVersion} — Node ${meta.nodeVersion}`]);
    identity.push(['Execução (UTC)', meta.generatedAtUtc]);
    identity.push([
      'Simulação',
      `N = ${meta.runs} históricos honestos x ${meta.historyLength} concursos — ` +
        `semente base ${meta.seedBase}`,
    ]);
    identity.push(['Critério', meta.criterion]);
    for (const [label, value] of identity) {
      text(MARGIN, y, label, { font: 'F2', size: 8.5 });
      const lines = wrapWords(value, 8.5, RIGHT - MARGIN - 95);
      text(MARGIN + 92, y, lines[0] ?? '', { size: 8.5 });
      for (const extra of lines.slice(1)) {
        y -= 11;
        text(MARGIN + 92, y, extra, { size: 8.5 });
      }
      y -= 12;
    }
    y -= 2;
    line(MARGIN, y, RIGHT, y);
    y -= 18;

    // --- 1. Monte Carlo ---------------------------------------------------
    text(MARGIN, y, '1. Monte Carlo — falso-positivo real em históricos honestos', {
      font: 'F2',
      size: 11,
    });
    y -= 14;
    const table: TableSpec = {
      columns: [
        { x: MARGIN },
        { x: 296 },
        { x: 326 },
        { x: 366 },
        { x: 442 },
        { x: 478 },
      ],
      size: 8,
      rowHeight: 13,
    };
    text(table.columns[0].x, y, 'Método', { font: 'F2', size: table.size });
    text(table.columns[1].x, y, 'alfa', { font: 'F2', size: table.size });
    text(table.columns[2].x, y, 'FPR', { font: 'F2', size: table.size });
    text(table.columns[3].x, y, 'IC 95%', { font: 'F2', size: table.size });
    text(table.columns[4].x, y, 'Limite', { font: 'F2', size: table.size });
    text(table.columns[5].x, y, 'Veredito', { font: 'F2', size: table.size });
    y -= 4;
    line(MARGIN, y, RIGHT, y, GRAY, 0.8);
    y -= table.rowHeight;
    for (const result of report.monteCarlo) {
      ensure(table.rowHeight);
      const ok = result.verdict === 'PASS';
      text(table.columns[0].x, y, result.method, { size: table.size });
      text(table.columns[1].x, y, pctPtBr(result.alpha, 0), { size: table.size });
      text(table.columns[2].x, y, pctPtBr(result.fpr), { size: table.size });
      text(
        table.columns[3].x,
        y,
        `[${pctPtBr(result.ci.lower)}; ${pctPtBr(result.ci.upper)}]`,
        { size: table.size },
      );
      text(table.columns[4].x, y, pctPtBr(result.bound, 0), { size: table.size });
      text(table.columns[5].x, y, result.verdict, {
        font: 'F2',
        size: table.size,
        color: ok ? GREEN : RED,
      });
      y -= table.rowHeight;
    }
    // Sonda: a régua do harness (deve reprovar sempre).
    ensure(table.rowHeight);
    const probe = report.probe;
    text(table.columns[0].x, y, probe.method, { size: table.size, color: GRAY });
    text(table.columns[1].x, y, pctPtBr(probe.alpha, 0), { size: table.size, color: GRAY });
    text(table.columns[2].x, y, pctPtBr(probe.fpr), { size: table.size, color: GRAY });
    text(
      table.columns[3].x,
      y,
      `[${pctPtBr(probe.ci.lower)}; ${pctPtBr(probe.ci.upper)}]`,
      { size: table.size, color: GRAY },
    );
    text(table.columns[4].x, y, pctPtBr(probe.bound, 0), { size: table.size, color: GRAY });
    text(table.columns[5].x, y, 'FAIL (esperado)', { font: 'F2', size: table.size, color: GREEN });
    y -= table.rowHeight;
    for (const deferred of report.deferred) {
      ensure(table.rowHeight);
      text(table.columns[0].x, y, deferred.method, { size: table.size, color: GRAY });
      text(
        table.columns[1].x,
        y,
        'adido ao gate de CI (Fase 3)',
        { size: table.size, color: GRAY },
      );
      y -= table.rowHeight;
    }
    y -= 4;
    text(MARGIN, y, report.summary.allPass ? 'TODOS OS MÉTODOS DENTRO DO CONTRATO' : 'CONTRATO VIOLADO', {
      font: 'F2',
      size: 10,
      color: report.summary.allPass ? GREEN : RED,
    });
    y -= 20;

    // --- 2. Métodos exatos ------------------------------------------------
    ensure(60);
    text(MARGIN, y, '2. Métodos exatos — recomputação independente', { font: 'F2', size: 11 });
    y -= 14;
    for (const check of report.exact) {
      text(MARGIN, y, check.method, { font: 'F2', size: 8.5 });
      text(RIGHT, y, check.pass ? 'PASS' : 'FAIL', {
        font: 'F2',
        size: 8.5,
        color: check.pass ? GREEN : RED,
      });
      y -= 11;
      for (const lineText of wrapWords(`${check.scenario}. ${check.detail}.`, 8.5, RIGHT - MARGIN - 8)) {
        ensure(11);
        text(MARGIN + 8, y, lineText, { size: 8.5 });
        y -= 11;
      }
      y -= 5;
    }
    y -= 6;

    // --- 3. Procedência ----------------------------------------------------
    ensure(80);
    text(MARGIN, y, '3. Procedência — sementes e hashes', { font: 'F2', size: 11 });
    y -= 14;
    text(MARGIN, y, `Semente base da simulação: ${meta.seedBase}`, { size: 8.5 });
    y -= 11;
    text(MARGIN + 8, y, 'SHA-256:', { size: 7.5, color: GRAY });
    text(MARGIN + 52, y, meta.seedBaseSha256.slice(0, 32), { font: 'F3', size: 7.5 });
    y -= 9;
    text(MARGIN + 52, y, meta.seedBaseSha256.slice(32), { font: 'F3', size: 7.5 });
    y -= 13;
    text(
      MARGIN,
      y,
      `Seed de histórico embutido (web/src/data/history/): versão ${meta.historySeedVersion}`,
      { size: 8.5 },
    );
    y -= 11;
    text(MARGIN + 8, y, 'SHA-256 (concatenação canônica):', { size: 7.5, color: GRAY });
    y -= 9;
    text(MARGIN + 8, y, meta.historySeedSha256.slice(0, 32), { font: 'F3', size: 7.5 });
    y -= 9;
    text(MARGIN + 8, y, meta.historySeedSha256.slice(32), { font: 'F3', size: 7.5 });
    y -= 11;
    for (const [name, hash] of Object.entries(meta.historySeedFiles)) {
      ensure(11);
      text(MARGIN + 16, y, `${name}`, { size: 7.5, color: GRAY });
      text(MARGIN + 130, y, hash.slice(0, 32), { font: 'F3', size: 7 });
      text(MARGIN + 130 + 194, y, hash.slice(32), { font: 'F3', size: 7 });
      y -= 10;
    }
    y -= 8;
    ensure(26);
    text(
      MARGIN,
      y,
      'Verificação de integridade: regenere este relatório no mesmo commit e compare ' +
        'meta.contentSha256 —',
      { size: 8, color: GRAY },
    );
    y -= 10;
    text(MARGIN, y, `igual byte a byte = mesmos históricos, mesmas medições, mesmos vereditos.`, {
      size: 8,
      color: GRAY,
    });

    footer();
    streams.push(ops.join('\n'));
    return streams;
  };

  // Passo 1: layout com total provisório só para contar páginas.
  const pageCount = layout(1).length;
  // Passo 2: layout definitivo com "página i de P".
  const streams = layout(pageCount);

  // --- Montagem dos objetos PDF -----------------------------------------
  const fontObj = (base: string): string =>
    `<</Type /Font /Subtype /Type1 /BaseFont /${base} /Encoding /WinAnsiEncoding>>`;
  const firstPageObj = 7;
  const kids = streams
    .map((_, i) => `${firstPageObj + i * 2} 0 R`)
    .join(' ');
  const creationDate = metaDateStamp(report.meta.generatedAtUtc);
  const objects: string[] = [
    '<</Type /Catalog /Pages 2 0 R>>',
    `<</Type /Pages /Kids [${kids}] /Count ${streams.length}>>`,
    fontObj('Helvetica'),
    fontObj('Helvetica-Bold'),
    fontObj('Courier'),
    `<</Producer (volante-plus audit-report Fase 2) /CreationDate (D:${creationDate}Z)>>`,
  ];
  streams.forEach((stream, i) => {
    const pageObj = firstPageObj + i * 2;
    objects.push(
      `<</Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_W} ${PAGE_H}] ` +
        `/Resources <</Font <</F1 3 0 R /F2 4 0 R /F3 5 0 R>>>> /Contents ${pageObj + 1} 0 R>>`,
    );
    objects.push(
      `<</Length ${Buffer.byteLength(stream, 'latin1')}>>\nstream\n${stream}\nendstream`,
    );
  });

  const chunks: Buffer[] = [];
  const offsets: number[] = [];
  let offset = 0;
  const push = (value: string): void => {
    const buffer = Buffer.from(value, 'latin1');
    chunks.push(buffer);
    offset += buffer.length;
  };
  push('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n');
  objects.forEach((body, index) => {
    offsets.push(offset);
    push(`${index + 1} 0 obj\n${body}\nendobj\n`);
  });
  const xrefOffset = offset;
  let xref = `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const entry of offsets) {
    xref += `${String(entry).padStart(10, '0')} 00000 n \n`;
  }
  xref +=
    `trailer\n<</Size ${objects.length + 1} /Root 1 0 R /Info 6 0 R>>\n` +
    `startxref\n${xrefOffset}\n%%EOF`;
  push(xref);

  return new Uint8Array(Buffer.concat(chunks));
}

/** '2026-10-28T14:55:01Z' -> '20261028145501' (carimbo /CreationDate). */
function metaDateStamp(generatedAtUtc: string): string {
  return generatedAtUtc.replace(/[^0-9]/g, '').slice(0, 14);
}
