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

  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8
  ihdr[9] = 6 // RGBA
  ihdr[10] = 0
  ihdr[11] = 0
  ihdr[12] = 0

  const ihdrChunk = Buffer.alloc(4 + 4 + 13 + 4)
  ihdrChunk.writeUInt32BE(13, 0)
  ihdrChunk.write('IHDR', 4)
  ihdr.copy(ihdrChunk, 8)
  ihdrChunk.writeUInt32BE(crc32(ihdrChunk.subarray(4, 21)), 21)

  const lineLength = width * 4 + 1
  const rawData = Buffer.alloc(lineLength * height)

  for (let y = 0; y < height; y++) {
    const rawOffset = y * lineLength
    rawData[rawOffset] = 0
    rgbaBuffer.copy(rawData, rawOffset + 1, y * width * 4, (y + 1) * width * 4)
  }

  const compressed = zlib.deflateSync(rawData, { level: 9 })
  const idatChunk = Buffer.alloc(4 + 4 + compressed.length + 4)
  idatChunk.writeUInt32BE(compressed.length, 0)
  idatChunk.write('IDAT', 4)
  compressed.copy(idatChunk, 8)
  idatChunk.writeUInt32BE(crc32(idatChunk.subarray(4, 8 + compressed.length)), 8 + compressed.length)

  const iendChunk = Buffer.alloc(12)
  iendChunk.writeUInt32BE(0, 0)
  iendChunk.write('IEND', 4)
  iendChunk.writeUInt32BE(crc32(iendChunk.subarray(4, 8)), 8)

  return Buffer.concat([signature, ihdrChunk, idatChunk, iendChunk])
}

function sdRoundedBox(px, py, bx, by, r) {
  const qx = Math.abs(px) - bx + r
  const qy = Math.abs(py) - by + r
  const len = Math.hypot(Math.max(qx, 0), Math.max(qy, 0))
  return len + Math.min(Math.max(qx, qy), 0) - r
}

// Draw the open book icon on a pixel (px, py in [-1, 1])
function getBookColor(px, py, pixelStep, baseR, baseG, baseB) {
  const absX = Math.abs(px)
  let r = baseR, g = baseG, b = baseB

  // Page dimensions: absX in [0.035, 0.48], py in [-0.38, 0.38]
  if (absX >= 0.035 && absX <= 0.48 && py >= -0.38 && py <= 0.38) {
    const u = (absX - 0.035) / (0.48 - 0.035)
    const wave = Math.sin(u * Math.PI) * 0.05
    const topEdge = -0.34 + wave
    const bottomEdge = 0.34 + wave

    if (py >= topEdge && py <= bottomEdge) {
      let bookAlpha = 1.0
      if (py < topEdge + pixelStep) bookAlpha = (py - topEdge) / pixelStep
      if (py > bottomEdge - pixelStep) bookAlpha = (bottomEdge - py) / pixelStep
      if (absX < 0.035 + pixelStep) bookAlpha *= (absX - 0.035) / pixelStep
      if (absX > 0.48 - pixelStep) bookAlpha *= (0.48 - absX) / pixelStep
      bookAlpha = Math.min(Math.max(bookAlpha, 0), 1)

      const isLine1 = py >= topEdge + 0.16 && py <= topEdge + 0.20 && u >= 0.15 && u <= 0.85
      const isLine2 = py >= topEdge + 0.28 && py <= topEdge + 0.32 && u >= 0.15 && u <= 0.85
      const isLine3 = py >= topEdge + 0.40 && py <= topEdge + 0.44 && u >= 0.15 && u <= 0.70

      if (isLine1 || isLine2 || isLine3) {
        // Soft green lines inside ledger pages
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

  // Central spine ribbon
  if (Math.abs(px) <= 0.025 && py >= -0.42 && py <= 0.22) {
    const ribbonAlpha = Math.min(Math.max(0.5 - (Math.abs(px) - 0.02) / pixelStep, 0), 1)
    if (ribbonAlpha > 0) {
      r = Math.round(r * (1 - ribbonAlpha) + 245 * ribbonAlpha)
      g = Math.round(g * (1 - ribbonAlpha) + 158 * ribbonAlpha)
      b = Math.round(b * (1 - ribbonAlpha) + 11 * ribbonAlpha)
    }
  }

  return { r, g, b }
}

function renderFullIcon(size, isRound = false) {
  const buf = Buffer.alloc(size * size * 4)
  const pixelStep = 2.0 / size

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const px = ((x + 0.5) / size) * 2.0 - 1.0
      const py = ((y + 0.5) / size) * 2.0 - 1.0

      const dist = isRound
        ? Math.hypot(px, py) - 0.90
        : sdRoundedBox(px, py, 0.88, 0.88, 0.38)
      const alphaBg = Math.min(Math.max(0.5 - dist / pixelStep, 0), 1)

      let r = 0, g = 0, b = 0, a = 0

      if (alphaBg > 0) {
        const t = (py + 1.0) / 2.0
        r = Math.round(16 * (1 - t) + 4 * t)
        g = Math.round(185 * (1 - t) + 120 * t)
        b = Math.round(129 * (1 - t) + 87 * t)
        a = Math.round(alphaBg * 255)

        const book = getBookColor(px, py, pixelStep, r, g, b)
        r = book.r
        g = book.g
        b = book.b
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

// Render Adaptive Foreground (centered icon in inner 55% with transparent background)
function renderAdaptiveForeground(size) {
  const buf = Buffer.alloc(size * size * 4)
  const pixelStep = 2.0 / size
  const scale = 0.60 // Scale to fit safe zone of 108dp

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const px = (((x + 0.5) / size) * 2.0 - 1.0) / scale
      const py = (((y + 0.5) / size) * 2.0 - 1.0) / scale

      let r = 0, g = 0, b = 0, a = 0

      const absX = Math.abs(px)
      if (absX >= 0.035 && absX <= 0.48 && py >= -0.38 && py <= 0.38) {
        const u = (absX - 0.035) / (0.48 - 0.035)
        const wave = Math.sin(u * Math.PI) * 0.05
        const topEdge = -0.34 + wave
        const bottomEdge = 0.34 + wave

        if (py >= topEdge && py <= bottomEdge) {
          let alpha = 1.0
          const localStep = pixelStep / scale
          if (py < topEdge + localStep) alpha = (py - topEdge) / localStep
          if (py > bottomEdge - localStep) alpha = (bottomEdge - py) / localStep
          if (absX < 0.035 + localStep) alpha *= (absX - 0.035) / localStep
          if (absX > 0.48 - localStep) alpha *= (0.48 - absX) / localStep
          alpha = Math.min(Math.max(alpha, 0), 1)

          const isLine1 = py >= topEdge + 0.16 && py <= topEdge + 0.20 && u >= 0.15 && u <= 0.85
          const isLine2 = py >= topEdge + 0.28 && py <= topEdge + 0.32 && u >= 0.15 && u <= 0.85
          const isLine3 = py >= topEdge + 0.40 && py <= topEdge + 0.44 && u >= 0.15 && u <= 0.70

          if (isLine1 || isLine2 || isLine3) {
            // Cutout transparent or emerald green lines
            r = 16
            g = 185
            b = 129
            a = Math.round(alpha * 220)
          } else {
            // Crisp White Book Page
            r = 255
            g = 255
            b = 255
            a = Math.round(alpha * 255)
          }
        }
      }

      // Central spine ribbon
      if (Math.abs(px) <= 0.025 && py >= -0.42 && py <= 0.22) {
        const localStep = pixelStep / scale
        const ribbonAlpha = Math.min(Math.max(0.5 - (Math.abs(px) - 0.02) / localStep, 0), 1)
        if (ribbonAlpha > 0) {
          r = 245
          g = 158
          b = 11
          a = Math.max(a, Math.round(ribbonAlpha * 255))
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
  { dir: 'mipmap-mdpi', size: 48, fgSize: 108 },
  { dir: 'mipmap-hdpi', size: 72, fgSize: 162 },
  { dir: 'mipmap-xhdpi', size: 96, fgSize: 216 },
  { dir: 'mipmap-xxhdpi', size: 144, fgSize: 324 },
  { dir: 'mipmap-xxxhdpi', size: 192, fgSize: 432 },
]

const baseResDir = path.resolve('apk/android/app/src/main/res')

for (const { dir, size, fgSize } of densities) {
  const targetDir = path.join(baseResDir, dir)
  if (!fs.existsSync(targetDir)) fs.mkdirSync(targetDir, { recursive: true })

  // 1. Regular launcher icon
  const iconBuf = renderFullIcon(size, false)
  fs.writeFileSync(path.join(targetDir, 'ic_launcher.png'), iconBuf)

  // 2. Round launcher icon
  const roundBuf = renderFullIcon(size, true)
  fs.writeFileSync(path.join(targetDir, 'ic_launcher_round.png'), roundBuf)

  // 3. Adaptive foreground icon
  const fgBuf = renderAdaptiveForeground(fgSize)
  fs.writeFileSync(path.join(targetDir, 'ic_launcher_foreground.png'), fgBuf)

  console.log(`Generated ${dir}: ic_launcher (${size}x${size}), ic_launcher_round, ic_launcher_foreground (${fgSize}x${fgSize})`)
}

// 4. Create Android Adaptive Icon XML (res/mipmap-anydpi-v26)
const anydpiDir = path.join(baseResDir, 'mipmap-anydpi-v26')
if (!fs.existsSync(anydpiDir)) fs.mkdirSync(anydpiDir, { recursive: true })

const adaptiveXml = `<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@color/ic_launcher_background"/>
    <foreground android:drawable="@mipmap/ic_launcher_foreground"/>
</adaptive-icon>
`
fs.writeFileSync(path.join(anydpiDir, 'ic_launcher.xml'), adaptiveXml)
fs.writeFileSync(path.join(anydpiDir, 'ic_launcher_round.xml'), adaptiveXml)

// 5. Create colors.xml with #059669
const valuesDir = path.join(baseResDir, 'values')
if (!fs.existsSync(valuesDir)) fs.mkdirSync(valuesDir, { recursive: true })
const colorsXml = `<?xml version="1.0" encoding="utf-8"?>
<resources>
    <color name="ic_launcher_background">#059669</color>
</resources>
`
fs.writeFileSync(path.join(valuesDir, 'colors.xml'), colorsXml)

// 6. Master 512x512
const assetsDir = path.resolve('apk/assets')
if (!fs.existsSync(assetsDir)) fs.mkdirSync(assetsDir, { recursive: true })
const master512 = renderFullIcon(512, false)
fs.writeFileSync(path.join(assetsDir, 'app_icon.png'), master512)
console.log('Finished generating all icons, adaptive resources, and assets!')
