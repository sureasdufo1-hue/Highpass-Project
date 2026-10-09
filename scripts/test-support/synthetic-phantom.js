// Mathematical demonstration phantom: no patient images, trained model or clinical inference.
export const PHANTOM_VERSION = 'highpass-geometric-phantom-v1';
export const PHANTOM_UID_ROOT = '1.2.826.0.1.3680043.10.5432.20261009';
const SIZE = 256;

function element(group, tag, vr, value) {
  const raw = Buffer.isBuffer(value) ? value : Buffer.from(String(value), 'ascii');
  const data = raw.length % 2 ? Buffer.concat([raw, Buffer.from([vr === 'UI' ? 0 : 32])]) : raw;
  const header = Buffer.alloc(['OB', 'OW'].includes(vr) ? 12 : 8);
  header.writeUInt16LE(group, 0); header.writeUInt16LE(tag, 2); header.write(vr, 4);
  if (header.length === 12) header.writeUInt32LE(data.length, 8);
  else header.writeUInt16LE(data.length, 6);
  return Buffer.concat([header, data]);
}
const us = value => { const buffer = Buffer.alloc(2); buffer.writeUInt16LE(value); return buffer; };

export function phantomPixels(modality, slice) {
  if (!['CT', 'MR'].includes(modality) || !Number.isInteger(slice) || slice < 1 || slice > 12) throw new Error('PHANTOM_INPUT_INVALID');
  const pixels = Buffer.alloc(SIZE * SIZE);
  const scale = 0.72 + 0.28 * Math.sin(Math.PI * slice / 13);
  for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) {
    const dx = (x - 128) / (93 * scale), dy = (y - 132) / (101 * scale);
    const radius = dx * dx + dy * dy;
    let value = 0;
    if (radius < 1) {
      value = modality === 'CT' ? 135 : 80;
      if (radius > 0.88) value = modality === 'CT' ? 240 : 200;
      const left = ((dx + 0.39) / 0.28) ** 2 + (dy / 0.66) ** 2;
      const right = ((dx - 0.39) / 0.28) ** 2 + (dy / 0.66) ** 2;
      if (left < 1 || right < 1) value = modality === 'CT' ? 35 : 145;
      if ((dx / 0.17) ** 2 + ((dy - 0.18) / 0.23) ** 2 < 1) value = modality === 'CT' ? 185 : 230;
      // Deterministic geometric contrast, not scanner noise or clinical anatomy.
      value = Math.min(255, value + ((x * 7 + y * 3 + slice * 11) % 13));
    }
    pixels[y * SIZE + x] = value;
  }
  const glyphs = ['1111100100001000010000100', '1111110000111101000011111', '1111110000111110000111111', '1111100100001000010000100']; // TEST, 5x5
  for (let letter = 0; letter < glyphs.length; letter++) for (let y = 0; y < 5; y++) for (let x = 0; x < 5; x++) {
    if (glyphs[letter][y * 5 + x] === '1') for (let yy = 0; yy < 2; yy++) for (let xx = 0; xx < 2; xx++) pixels[(8 + y * 2 + yy) * SIZE + 8 + letter * 12 + x * 2 + xx] = 255;
  }
  return pixels;
}

export function createPhantomInstance(modality, slice) {
  const pixels = phantomPixels(modality, slice);
  const number = modality === 'CT' ? 1 : 2;
  const studyUid = `${PHANTOM_UID_ROOT}.${number}`, seriesUid = `${studyUid}.1`, sopUid = `${seriesUid}.${slice}`;
  const sopClass = '1.2.840.10008.5.1.4.1.1.7'; // Secondary Capture, NOT diagnostic CT/MR SOP class.
  const meta = Buffer.concat([
    element(2, 1, 'OB', Buffer.from([0, 1])), element(2, 2, 'UI', sopClass), element(2, 3, 'UI', sopUid),
    element(2, 0x10, 'UI', '1.2.840.10008.1.2.1'), element(2, 0x12, 'UI', '1.2.826.0.1.3680043.10.5432'),
    element(2, 0x13, 'SH', 'HP_PHANTOM_V1'),
  ]);
  const length = Buffer.alloc(4); length.writeUInt32LE(meta.length);
  const data = [
    element(8, 8, 'CS', 'DERIVED\\SECONDARY'), element(8, 0x16, 'UI', sopClass), element(8, 0x18, 'UI', sopUid),
    element(8, 0x20, 'DA', '20261009'), element(8, 0x60, 'CS', modality), element(8, 0x64, 'CS', 'WSD'),
    element(8, 0x1030, 'LO', `SYNTHETIC ${modality} GEOMETRIC PHANTOM - NOT DIAGNOSTIC`),
    element(8, 0x103e, 'LO', 'SYNTHETIC DEMO 12 SLICES'),
    element(0x10, 0x10, 'PN', 'HIGHPass^SYNTHETIC^PHANTOM'), element(0x10, 0x20, 'LO', 'HP-TEST-PHANTOM-001'),
    element(0x18, 0x50, 'DS', '2'),
    element(0x20, 0x0d, 'UI', studyUid), element(0x20, 0x0e, 'UI', seriesUid),
    element(0x20, 0x11, 'IS', '1'), element(0x20, 0x13, 'IS', slice),
    element(0x20, 0x32, 'DS', `0\\0\\${slice * 2}`), element(0x20, 0x37, 'DS', '1\\0\\0\\0\\1\\0'),
    element(0x28, 2, 'US', us(1)), element(0x28, 4, 'CS', 'MONOCHROME2'),
    element(0x28, 0x10, 'US', us(SIZE)), element(0x28, 0x11, 'US', us(SIZE)), element(0x28, 0x30, 'DS', '1\\1'),
    element(0x28, 0x100, 'US', us(8)), element(0x28, 0x101, 'US', us(8)), element(0x28, 0x102, 'US', us(7)),
    element(0x28, 0x103, 'US', us(0)), element(0x28, 0x301, 'CS', 'YES'), // TEST pixel annotation
    element(0x28, 0x1050, 'DS', '128'), element(0x28, 0x1051, 'DS', '256'), element(0x7fe0, 0x10, 'OB', pixels),
  ];
  return { modality, slice, studyUid, seriesUid, sopUid, rows: SIZE, columns: SIZE,
    dicom: Buffer.concat([Buffer.alloc(128), Buffer.from('DICM'), element(2, 0, 'UL', length), meta, ...data]) };
}
