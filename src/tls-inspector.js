import { createHash } from "node:crypto";

/**
 * GREASE (RFC 8701) reservation values that must be filtered out for JA3 calculation.
 */
const GREASE_VALUES = new Set([
  0x0a0a, 0x1a1a, 0x2a2a, 0x3a3a, 0x4a4a, 0x5a5a, 0x6a6a, 0x7a7a,
  0x8a8a, 0x9a9a, 0xaaaa, 0xbaba, 0xcaca, 0xdada, 0xeaea, 0xfafa,
]);

function isGrease(val) {
  return GREASE_VALUES.has(val);
}

/**
 * Parses raw TLS ClientHello packet buffer and computes Salesforce JA3 fingerprint.
 *
 * JA3 Specification:
 * SSLVersion,CipherSuites,Extensions,EllipticCurves,EllipticCurvePointFormats
 *
 * @param {Buffer} buffer - Raw TLS packet buffer (or handshake record)
 * @returns {{ ja3String: string, ja3Fingerprint: string, clientVersion: number } | null}
 */
export function extractJa3FromClientHello(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 44) {
    return null;
  }

  try {
    let offset = 0;

    // Check if buffer starts with TLS Record layer (0x16 = Handshake)
    if (buffer[offset] === 0x16) {
      // Record header: ContentType (1B) + Version (2B) + Length (2B)
      offset += 5;
    }

    // Check Handshake Type: 0x01 = Client Hello
    if (buffer[offset] !== 0x01) {
      return null;
    }

    // Skip Handshake Type (1B) + Handshake Length (3B)
    offset += 4;

    // Client Hello Version (2B)
    const clientVersion = buffer.readUInt16BE(offset);
    offset += 2;

    // Skip Random (32B)
    offset += 32;

    // Session ID Length (1B)
    if (offset >= buffer.length) return null;
    const sessionIdLen = buffer.readUInt8(offset);
    offset += 1 + sessionIdLen;

    // Cipher Suites Length (2B)
    if (offset + 2 > buffer.length) return null;
    const cipherSuitesLen = buffer.readUInt16BE(offset);
    offset += 2;

    const cipherSuites = [];
    const cipherEnd = offset + cipherSuitesLen;
    if (cipherEnd > buffer.length) return null;

    while (offset < cipherEnd) {
      const cipher = buffer.readUInt16BE(offset);
      offset += 2;
      if (!isGrease(cipher)) {
        cipherSuites.push(cipher);
      }
    }

    // Compression Methods Length (1B)
    if (offset >= buffer.length) return null;
    const compressionMethodsLen = buffer.readUInt8(offset);
    offset += 1 + compressionMethodsLen;

    // Extensions Length (2B)
    if (offset + 2 > buffer.length) {
      // No extensions present
      const ja3String = `${clientVersion},${cipherSuites.join("-")},,,`;
      const ja3Fingerprint = createHash("md5").update(ja3String).digest("hex");
      return { ja3String, ja3Fingerprint, clientVersion };
    }

    const extensionsLen = buffer.readUInt16BE(offset);
    offset += 2;

    const extensionsEnd = Math.min(offset + extensionsLen, buffer.length);
    const extensions = [];
    const supportedGroups = [];
    const ecPointFormats = [];

    while (offset + 4 <= extensionsEnd) {
      const extType = buffer.readUInt16BE(offset);
      const extLen = buffer.readUInt16BE(offset + 2);
      offset += 4;

      if (!isGrease(extType)) {
        extensions.push(extType);
      }

      const extDataEnd = offset + extLen;
      if (extDataEnd > buffer.length) break;

      // 0x000a = Supported Groups (Elliptic Curves)
      if (extType === 0x000a && extLen >= 2) {
        const groupsLen = buffer.readUInt16BE(offset);
        let groupOffset = offset + 2;
        const groupEnd = Math.min(groupOffset + groupsLen, extDataEnd);
        while (groupOffset + 2 <= groupEnd) {
          const group = buffer.readUInt16BE(groupOffset);
          groupOffset += 2;
          if (!isGrease(group)) {
            supportedGroups.push(group);
          }
        }
      }

      // 0x000b = EC Point Formats
      if (extType === 0x000b && extLen >= 1) {
        const pointLen = buffer.readUInt8(offset);
        let pointOffset = offset + 1;
        const pointEnd = Math.min(pointOffset + pointLen, extDataEnd);
        while (pointOffset < pointEnd) {
          ecPointFormats.push(buffer.readUInt8(pointOffset));
          pointOffset += 1;
        }
      }

      offset = extDataEnd;
    }

    // Compose JA3 String
    const ja3String = [
      clientVersion,
      cipherSuites.join("-"),
      extensions.join("-"),
      supportedGroups.join("-"),
      ecPointFormats.join("-"),
    ].join(",");

    const ja3Fingerprint = createHash("md5").update(ja3String).digest("hex");

    return {
      ja3String,
      ja3Fingerprint,
      clientVersion,
      cipherCount: cipherSuites.length,
      extensionCount: extensions.length,
    };
  } catch {
    return null;
  }
}
