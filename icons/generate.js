const fs = require('fs');
const path = require('path');

const iconDir = __dirname;

function createPNG(width, height, color) {
  const png = Buffer.alloc(8 + 25 + 12 + 12 + width * height * 4 + 16);
  
  let offset = 0;
  
  const signature = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
  signature.copy(png, offset);
  offset += 8;
  
  function addChunk(type, data) {
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.length);
    length.copy(png, offset);
    offset += 4;
    
    const typeBuffer = Buffer.from(type);
    typeBuffer.copy(png, offset);
    offset += 4;
    
    data.copy(png, offset);
    offset += data.length;
    
    const crc = crc32(typeBuffer, data);
    const crcBuffer = Buffer.alloc(4);
    crcBuffer.writeUInt32BE(crc);
    crcBuffer.copy(png, offset);
    offset += 4;
  }
  
  function crc32(type, data) {
    let crc = 0xFFFFFFFF;
    const table = [];
    
    for (let i = 0; i < 256; i++) {
      let c = i;
      for (let j = 0; j < 8; j++) {
        c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      }
      table[i] = c;
    }
    
    for (let i = 0; i < type.length; i++) {
      crc = table[(crc ^ type[i]) & 0xFF] ^ (crc >>> 8);
    }
    for (let i = 0; i < data.length; i++) {
      crc = table[(crc ^ data[i]) & 0xFF] ^ (crc >>> 8);
    }
    
    return (crc ^ 0xFFFFFFFF) >>> 0;
  }
  
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  addChunk('IHDR', ihdr);
  
  const rawData = [];
  for (let y = 0; y < height; y++) {
    rawData.push(0);
    for (let x = 0; x < width; x++) {
      const dx = x - width / 2;
      const dy = y - height / 2;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const maxDist = Math.min(width, height) / 2 * 0.7;
      
      if (dist < maxDist) {
        rawData.push(color.r, color.g, color.b, 255);
      } else {
        rawData.push(0, 0, 0, 0);
      }
    }
  }
  
  const deflate = require('zlib').deflateSync(Buffer.from(rawData));
  addChunk('IDAT', deflate);
  
  addChunk('IEND', Buffer.alloc(0));
  
  return png.slice(0, offset);
}

const colors = {
  r: 102,
  g: 126,
  b: 234
};

const sizes = [16, 32, 48, 128];

sizes.forEach(size => {
  const png = createPNG(size, size, colors);
  fs.writeFileSync(path.join(iconDir, `icon${size}.png`), png);
  console.log(`Created icon${size}.png`);
});

console.log('All icons created successfully!');