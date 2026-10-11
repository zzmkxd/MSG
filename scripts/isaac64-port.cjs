// Isaac64 纯 JS 移植（与 electron/services/isaac64.ts 等价）
class Isaac64 {
  constructor(seed) {
    this.mm = new BigUint64Array(256)
    this.aa = 0n
    this.bb = 0n
    this.cc = 0n
    this.randrsl = new BigUint64Array(256)
    this.randcnt = 0
    const MASK = 0xffffffffffffffffn
    this.MASK = MASK
    this.randrsl.fill(0n)
    this.randrsl[0] = BigInt(seed)
    this.init(true)
  }
  init(flag) {
    const MASK = this.MASK
    let a, b, c, d, e, f, g, h
    a = b = c = d = e = f = g = h = 0x9e3779b97f4a7c15n
    const mix = () => {
      a = (a - e) & MASK; f ^= (h >> 9n); h = (h + a) & MASK
      b = (b - f) & MASK; g ^= (a << 9n) & MASK; a = (a + b) & MASK
      c = (c - g) & MASK; h ^= (b >> 23n); b = (b + c) & MASK
      d = (d - h) & MASK; a ^= (c << 15n) & MASK; c = (c + d) & MASK
      e = (e - a) & MASK; b ^= (d >> 14n); d = (d + e) & MASK
      f = (f - b) & MASK; c ^= (e << 20n) & MASK; e = (e + f) & MASK
      g = (g - c) & MASK; d ^= (f >> 17n); f = (f + g) & MASK
      h = (h - d) & MASK; e ^= (g << 14n) & MASK; g = (g + h) & MASK
    }
    for (let i = 0; i < 4; i++) mix()
    for (let i = 0; i < 256; i += 8) {
      if (flag) {
        a = (a + this.randrsl[i]) & MASK
        b = (b + this.randrsl[i + 1]) & MASK
        c = (c + this.randrsl[i + 2]) & MASK
        d = (d + this.randrsl[i + 3]) & MASK
        e = (e + this.randrsl[i + 4]) & MASK
        f = (f + this.randrsl[i + 5]) & MASK
        g = (g + this.randrsl[i + 6]) & MASK
        h = (h + this.randrsl[i + 7]) & MASK
      }
      mix()
      this.mm[i] = a; this.mm[i + 1] = b; this.mm[i + 2] = c; this.mm[i + 3] = d
      this.mm[i + 4] = e; this.mm[i + 5] = f; this.mm[i + 6] = g; this.mm[i + 7] = h
    }
    if (flag) {
      for (let i = 0; i < 256; i += 8) {
        a = (a + this.mm[i]) & MASK
        b = (b + this.mm[i + 1]) & MASK
        c = (c + this.mm[i + 2]) & MASK
        d = (d + this.mm[i + 3]) & MASK
        e = (e + this.mm[i + 4]) & MASK
        f = (f + this.mm[i + 5]) & MASK
        g = (g + this.mm[i + 6]) & MASK
        h = (h + this.mm[i + 7]) & MASK
        mix()
        this.mm[i] = a; this.mm[i + 1] = b; this.mm[i + 2] = c; this.mm[i + 3] = d
        this.mm[i + 4] = e; this.mm[i + 5] = f; this.mm[i + 6] = g; this.mm[i + 7] = h
      }
    }
    this.isaac64()
    this.randcnt = 256
  }
  isaac64() {
    const MASK = this.MASK
    this.cc = (this.cc + 1n) & MASK
    this.bb = (this.bb + this.cc) & MASK
    for (let i = 0; i < 256; i++) {
      let x = this.mm[i]
      switch (i & 3) {
        case 0: this.aa = (this.aa ^ (((this.aa << 21n) & MASK) ^ MASK)) & MASK; break
        case 1: this.aa = (this.aa ^ (this.aa >> 5n)) & MASK; break
        case 2: this.aa = (this.aa ^ ((this.aa << 12n) & MASK)) & MASK; break
        case 3: this.aa = (this.aa ^ (this.aa >> 33n)) & MASK; break
      }
      this.aa = (this.mm[(i + 128) & 255] + this.aa) & MASK
      const y = (this.mm[Number(x >> 3n) & 255] + this.aa + this.bb) & MASK
      this.mm[i] = y
      this.bb = (this.mm[Number(y >> 11n) & 255] + x) & MASK
      this.randrsl[i] = this.bb
    }
  }
  getNext() {
    if (this.randcnt === 0) {
      this.isaac64()
      this.randcnt = 256
    }
    return this.randrsl[--this.randcnt]
  }
}
module.exports = { Isaac64 }
