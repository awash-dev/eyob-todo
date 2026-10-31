import zlib from 'node:zlib'
import fs from 'node:fs'
import path from 'node:path'

function crc32(buf) {
  let c = 0xffffffff
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i]
    for (let j = 0; j < 8; j++) {
      c = (c >>> 1) ^ (-(c & 1) & 0xedb88320)
    }
  }
  return (c ^ 0xffffffff) >>> 0
}

function createPng(width, height, rgbaBuffer) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])

  // IHDR
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 6 // color type RGBA
  ihdr[10] = 0 // compression
  ihdr[11] = 0 // filter
  ihdr[12] = 0 // interlace

  const ihdrChunk = Buffer.alloc(4 + 4 + 13 + 4)
  ihdrChunk.writeUInt32BE(13, 0)
  ihdrChunk.write('IHDR', 4)
  ihdr.copy(ihdrChunk, 8)
  ihdrChunk.writeUInt32BE(crc32(ihdrChunk.subarray(4, 21)), 21)

  // IDAT (filter 0 for each line)
  const lineLength = width * 4 + 1
  const rawData = Buffer.alloc(lineLength * height)

  for (let y = 0; y < height; y++) {
    const rawOffset = y * lineLength
    rawData[rawOffset] = 0 // no filter
    rgbaBuffer.copy(rawData, rawOffset + 1, y * width * 4, (y + 1) * width * 4)
  }

  const compressed = zlib.deflateSync(rawData, { level: 9 })
  const idatChunk = Buffer.alloc(4 + 4 + compressed.length + 4)
  idatChunk.writeUInt32BE(compressed.length, 0)
  idatChunk.write('IDAT', 4)
  compressed.copy(idatChunk, 8)
  idatChunk.writeUInt32BE(crc32(idatChunk.subarray(4, 8 + compressed.length)), 8 + compressed.length)

  // IEND
  const iendChunk = Buffer.alloc(12)
  iendChunk.writeUInt32BE(0, 0)
  iendChunk.write('IEND', 4)
  iendChunk.writeUInt32BE(crc32(iendChunk.subarray(4, 8)), 8)

  return Buffer.concat([signature, ihdrChunk, idatChunk, iendChunk])
}

// Signed Distance Function for Rounded Box
function sdRoundedBox(px, py, bx, by, r) {
  const qx = Math.abs(px) - bx + r
  const qy = Math.abs(py) - by + r
  const len = Math.hypot(Math.max(qx, 0), Math.max(qy, 0))
  return len + Math.min(Math.max(qx, qy), 0) - r
}

function renderAppIcon(size) {
  const buf = Buffer.alloc(size * size * 4)
  const pixelStep = 2.0 / size

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      // Coordinate space [-1.0, 1.0]
      const px = ((x + 0.5) / size) * 2.0 - 1.0
      const py = ((y + 0.5) / size) * 2.0 - 1.0

      // 1. Squircle background (width 0.88, radius 0.38)
      const distBg = sdRoundedBox(px, py, 0.88, 0.88, 0.38)
      const alphaBg = Math.min(Math.max(0.5 - distBg / pixelStep, 0), 1)

      let r = 0, g = 0, b = 0, a = 0

      if (alphaBg > 0) {
        // Vertical gradient: Top (#10B981) to Bottom (#047857)
        const t = (py + 1.0) / 2.0 // 0 at top, 1 at bottom
        r = Math.round(16 * (1 - t) + 4 * t)
        g = Math.round(185 * (1 - t) + 120 * t)
        b = Math.round(129 * (1 - t) + 87 * t)
        a = Math.round(alphaBg * 255)

        // Subtle top highlight border
        const distInner = sdRoundedBox(px, py, 0.84, 0.84, 0.34)
        if (distBg <= 0 && distInner > 0 && py < 0) {
          const highlight = (1 - distInner / 0.04) * 0.25 * (1 - (py + 1))
          r = Math.min(255, Math.round(r + 255 * highlight))
          g = Math.min(255, Math.round(g + 255 * highlight))
          b = Math.min(255, Math.round(b + 255 * highlight))
        }

        // 2. Open Book / Ledger Icon in Center (White)
        // Book bounding box: x in [-0.50, 0.50], y in [-0.40, 0.40]
        const absX = Math.abs(px)

        // Left/Right Page geometry
        // Gap in spine: absX in [0.03, 0.48]
        if (absX >= 0.035 && absX <= 0.48 && py >= -0.38 && py <= 0.38) {
          const u = (absX - 0.035) / (0.48 - 0.035) // 0 at spine, 1 at outer edge
          // Curved wave for open page top/bottom
          const wave = Math.sin(u * Math.PI) * 0.05
          const topEdge = -0.34 + wave
          const bottomEdge = 0.34 + wave
          const thick = 0.045

          // Page borders or solid fill
          const inPageY = py >= topEdge && py <= bottomEdge
          if (inPageY) {
            // Fill page with white
            let bookAlpha = 1.0
            // Smooth edges
            if (py < topEdge + pixelStep) bookAlpha = (py - topEdge) / pixelStep
            if (py > bottomEdge - pixelStep) bookAlpha = (bottomEdge - py) / pixelStep
            if (absX < 0.035 + pixelStep) bookAlpha *= (absX - 0.035) / pixelStep
            if (absX > 0.48 - pixelStep) bookAlpha *= (0.48 - absX) / pixelStep
            bookAlpha = Math.min(Math.max(bookAlpha, 0), 1)

            // Inner ledger line slots (cutout into green for realistic ledger feel)
            const isLine1 = py >= topEdge + 0.16 && py <= topEdge + 0.20 && u >= 0.15 && u <= 0.85
            const isLine2 = py >= topEdge + 0.28 && py <= topEdge + 0.32 && u >= 0.15 && u <= 0.85
            const isLine3 = py >= topEdge + 0.40 && py <= topEdge + 0.44 && u >= 0.15 && u <= 0.70

            if (isLine1 || isLine2 || isLine3) {
              // Soft green tint for ledger grid lines
              r = Math.round(r * (1 - bookAlpha * 0.8) + 16 * bookAlpha * 0.8)
              g = Math.round(g * (1 - bookAlpha * 0.8) + 185 * bookAlpha * 0.8)
              b = Math.round(b * (1 - bookAlpha * 0.8) + 129 * bookAlpha * 0.8)
            } else {
              // Crisp White Book Page
              r = Math.round(r * (1 - bookAlpha) + 255 * bookAlpha)
              g = Math.round(g * (1 - bookAlpha) + 255 * bookAlpha)
              b = Math.round(b * (1 - bookAlpha) + 255 * bookAlpha)
            }
          }
        }

        // Central spine ribbon / marker bookmark
        if (Math.abs(px) <= 0.025 && py >= -0.42 && py <= 0.22) {
          const ribbonAlpha = Math.min(Math.max(0.5 - (Math.abs(px) - 0.02) / pixelStep, 0), 1)
          if (ribbonAlpha > 0) {
            // Gold / Emerald ribbon (#F59E0B)
            r = Math.round(r * (1 - ribbonAlpha) + 245 * ribbonAlpha)
            g = Math.round(g * (1 - ribbonAlpha) + 158 * ribbonAlpha)
            b = Math.round(b * (1 - ribbonAlpha) + 11 * ribbonAlpha)
          }
        }
      }

      const offset = (y * size + x) * 4
      buf[offset] = r
      buf[offset + 1] = g
      buf[offset + 2] = b
      buf[offset + 3] = a
    }
  }

  return createPng(size, size, buf)
}

const densities = [
  { dir: 'mipmap-mdpi', size: 48 },
  { dir: 'mipmap-hdpi', size: 72 },
  { dir: 'mipmap-xhdpi', size: 96 },
  { dir: 'mipmap-xxhdpi', size: 144 },
  { dir: 'mipmap-xxxhdpi', size: 192 },
]

const baseResDir = path.resolve('apk/android/app/src/main/res')

for (const { dir, size } of densities) {
  const targetDir = path.join(baseResDir, dir)
  if (!fs.existsSync(targetDir)) fs.mkdirSync(targetDir, { recursive: true })
  const pngBuf = renderAppIcon(size)
  const targetFile = path.join(targetDir, 'ic_launcher.png')
  fs.writeFileSync(targetFile, pngBuf)
  console.log(`Generated ${targetFile} (${size}x${size}, ${pngBuf.length} bytes)`)
}

// Also save 512x512 master icon in apk/assets/icon.png
const assetsDir = path.resolve('apk/assets')
if (!fs.existsSync(assetsDir)) fs.mkdirSync(assetsDir, { recursive: true })
const master512 = renderAppIcon(512)
fs.writeFileSync(path.join(assetsDir, 'app_icon.png'), master512)
console.log(`Generated apk/assets/app_icon.png (512x512, ${master512.length} bytes)`)
