/**
 * Compactador ZIP puro (sem dependências e sem binário externo).
 *
 * Usado como fallback quando o binário `zip` do sistema não existe — o caso
 * de máquinas Windows de desenvolvimento. O formato produzido é ZIP clássico
 * (método deflate do `node:zlib`), aceito pelas lojas de extensões
 * (Chrome Web Store, Microsoft Edge Add-ons e AMO/Firefox).
 *
 * Estrutura: local file header + dados por entrada, diretório central e
 * EOCD, com nomes UTF-8 (flag 0x0800) e entradas de diretório explícitas.
 */

import { deflateRawSync } from 'node:zlib';
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

// ---------------------------------------------------------------------------
// CRC-32 (polinômio padrão do ZIP), tabela pré-computada.
// ---------------------------------------------------------------------------

const CRC_TABLE = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) {
    c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
  CRC_TABLE[n] = c >>> 0;
}

function crc32(buffer) {
  let c = 0xffffffff;
  for (let i = 0; i < buffer.length; i++) {
    c = CRC_TABLE[(c ^ buffer[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

// ---------------------------------------------------------------------------
// Timestamp DOS (data/hora locais, como o Info-ZIP faz por padrão).
// ---------------------------------------------------------------------------

function dosDateTime(mtimeMs) {
  const d = new Date(mtimeMs);
  const year = Math.max(1980, d.getFullYear());
  const date = ((year - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
  const time = (d.getHours() << 11) | (d.getMinutes() << 5) | Math.floor(d.getSeconds() / 2);
  return { time, date };
}

// ---------------------------------------------------------------------------
// Caminhos dentro do arquivo sempre com barra '/', como o padrão ZIP.
// ---------------------------------------------------------------------------

function zipPathOf(relativePath) {
  return relativePath.split(sep).join('/');
}

/** Lista recursiva de `dir`, em ordem determinística, diretórios antes de arquivos. */
function walk(dir) {
  const dirs = [];
  const files = [];
  const visit = (current) => {
    for (const name of readdirSync(current).sort()) {
      const full = join(current, name);
      const stat = statSync(full);
      if (stat.isDirectory()) {
        dirs.push(full);
        visit(full);
      } else {
        files.push(full);
      }
    }
  };
  visit(dir);
  return { dirs, files };
}

/**
 * Cria `outZip` com o conteúdo de `sourceDir` (a raiz vira a raiz do zip,
 * como `zip -r out.zip .` executado dentro de `sourceDir`).
 */
export function zipDirectory(sourceDir, outZip) {
  const { dirs, files } = walk(sourceDir);
  const chunks = [];
  const central = [];
  let offset = 0;

  const push = (part) => {
    chunks.push(part);
    offset += part.length;
  };

  const localHeader = ({ name, method, time, date, crc, payloadLength, dataLength }) => {
    const header = Buffer.alloc(30);
    header.writeUInt32LE(0x04034b50, 0);
    header.writeUInt16LE(20, 4); // versão necessária (2.0)
    header.writeUInt16LE(0x0800, 6); // UTF-8
    header.writeUInt16LE(method, 8);
    header.writeUInt16LE(time, 10);
    header.writeUInt16LE(date, 12);
    header.writeUInt32LE(crc, 14);
    header.writeUInt32LE(payloadLength, 18);
    header.writeUInt32LE(dataLength, 22);
    header.writeUInt16LE(name.length, 26);
    header.writeUInt16LE(0, 28); // extra length
    return header;
  };

  const centralEntry = ({ name, method, time, date, crc, payloadLength, dataLength, externalAttrs, localOffset }) => {
    const entry = Buffer.alloc(46);
    entry.writeUInt32LE(0x02014b50, 0);
    entry.writeUInt16LE(20, 4); // versão feita por
    entry.writeUInt16LE(20, 6); // versão necessária
    entry.writeUInt16LE(0x0800, 8); // UTF-8
    entry.writeUInt16LE(method, 10);
    entry.writeUInt16LE(time, 12);
    entry.writeUInt16LE(date, 14);
    entry.writeUInt32LE(crc, 16);
    entry.writeUInt32LE(payloadLength, 20);
    entry.writeUInt32LE(dataLength, 24);
    entry.writeUInt16LE(name.length, 28);
    entry.writeUInt16LE(0, 30); // extra
    entry.writeUInt16LE(0, 32); // comment
    entry.writeUInt16LE(0, 34); // número do disco
    entry.writeUInt16LE(0, 36); // atributos internos
    entry.writeUInt32LE(externalAttrs, 38);
    entry.writeUInt32LE(localOffset, 42);
    return entry;
  };

  // Entradas de diretório (método store, vazias), antes dos arquivos.
  for (const dir of dirs) {
    const name = Buffer.from(`${zipPathOf(relative(sourceDir, dir))}/`, 'utf8');
    const { time, date } = dosDateTime(statSync(dir).mtimeMs);
    const localOffset = offset;
    push(localHeader({ name, method: 0, time, date, crc: 0, payloadLength: 0, dataLength: 0 }));
    push(name);
    central.push({
      name,
      entry: centralEntry({
        name, method: 0, time, date, crc: 0, payloadLength: 0, dataLength: 0,
        externalAttrs: 0x10, localOffset,
      }),
    });
  }

  for (const file of files) {
    const data = readFileSync(file);
    // Sem compressão para arquivos pequenos (<64 bytes): o deflate não
    // compensa e mantém compatibilidade máxima.
    const method = data.length < 64 ? 0 : 8;
    const payload = method === 8 ? deflateRawSync(data) : data;
    const name = Buffer.from(zipPathOf(relative(sourceDir, file)), 'utf8');
    const { time, date } = dosDateTime(statSync(file).mtimeMs);
    const localOffset = offset;
    push(localHeader({
      name, method, time, date, crc: crc32(data),
      payloadLength: payload.length, dataLength: data.length,
    }));
    push(name);
    push(payload);
    central.push({
      name,
      entry: centralEntry({
        name, method, time, date, crc: crc32(data),
        payloadLength: payload.length, dataLength: data.length,
        externalAttrs: 0, localOffset,
      }),
    });
  }

  const centralOffset = offset;
  let centralSize = 0;
  for (const { entry, name } of central) {
    push(entry);
    centralSize += entry.length + name.length;
    push(name);
  }

  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(central.length, 8);
  eocd.writeUInt16LE(central.length, 10);
  eocd.writeUInt32LE(centralSize, 12);
  eocd.writeUInt32LE(centralOffset, 16);
  eocd.writeUInt16LE(0, 20);
  push(eocd);

  writeFileSync(outZip, Buffer.concat(chunks));
}
