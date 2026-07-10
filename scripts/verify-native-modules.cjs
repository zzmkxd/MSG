// 第 2 层验证：5 个关键原生模块加载
const modules = ['koffi', 'fzstd', 'jieba-wasm', 'silk-wasm', 'ffmpeg-static'];

let pass = 0;
let fail = 0;

for (const name of modules) {
  try {
    const mod = require(name);
    if (name === 'ffmpeg-static') {
      console.log(`  [PASS] ${name} → ${mod}`);
    } else {
      const keys = Object.keys(mod).slice(0, 5);
      console.log(`  [PASS] ${name} (exports: ${keys.join(', ')}...)`);
    }
    pass++;
  } catch (e) {
    console.log(`  [FAIL] ${name}: ${e.message}`);
    fail++;
  }
}

console.log(`\n${pass}/${modules.length} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
