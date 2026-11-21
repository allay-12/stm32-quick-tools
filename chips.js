const flashKiB = { 3: 8, 4: 16, 6: 32, 8: 64, B: 128, C: 256, D: 384, E: 512, F: 768, G: 1024, H: 1536, I: 2048, J: 4096, Z: 192 };
const cortexDebugId = '0xe0042000';
const lowPowerDebugId = '0x40015800';
const h7DebugId = '0x5c001000';

const families = [
  ['stm32c0x', lowPowerDebugId, '0x1fff75a0', [
    ['C011', '46', 0x443], ['C031', '46', 0x453], ['C051', '68', 0x44c],
    ['C071', '8B', 0x493], ['C091 C092', 'BC', 0x44d]
  ]],
  ['stm32f0x', lowPowerDebugId, '0x1ffff7cc', [
    ['F030 F031', '46', 0x444], ['F030', '8', 0x440], ['F030', 'C', 0x442],
    ['F042', '46', 0x445], ['F051', '468', 0x440], ['F070', '6', 0x445],
    ['F070', 'B', 0x448], ['F071 F072', '8B', 0x448], ['F091', 'BC', 0x442], ['F098', 'C', 0x442]
  ]],
  ['stm32f1x', cortexDebugId, '0x1ffff7e0', [
    ['F100', '468B', 0x420], ['F100', 'CDE', 0x428],
    ['F101 F102 F103', '46', 0x412], ['F101 F102 F103', '8B', 0x410],
    ['F101 F103', 'CDE', 0x414], ['F105', '8BC', 0x418], ['F107', 'BC', 0x418]
  ]],
  ['stm32xl', cortexDebugId, '0x1ffff7e0', [
    ['F101 F103', 'FG', 0x430]
  ]],
  ['stm32f2x', cortexDebugId, '0x1fff7a22', [
    ['F205', 'BCEFG', 0x411], ['F207', 'CEFG', 0x411], ['F215 F217', 'EG', 0x411]
  ]],
  ['stm32f3x', cortexDebugId, '0x1ffff7cc', [
    ['F301 F302', '68', 0x439, 0x1000], ['F303', '68', 0x438, 0x1000], ['F334', '468', 0x438, 0x1000],
    ['F302 F303', 'BC', 0x422], ['F302 F303', 'DE', 0x446], ['F373', '8BC', 0x432]
  ]],
  ['stm32f4x', cortexDebugId, '0x1fff7a22', [
    ['F401', 'BC', 0x423], ['F401', 'DE', 0x433], ['F405 F407 F417', 'EG', 0x413], ['F415', 'G', 0x413],
    ['F410', '8B', 0x458, 0x4000], ['F411', 'CE', 0x431], ['F412', 'EG', 0x441],
    ['F413', 'GH', 0x463], ['F423', 'H', 0x463], ['F427 F437 F439', 'GI', 0x419], ['F429', 'EGI', 0x419],
    ['F446', 'CE', 0x421], ['F469', 'EGI', 0x434], ['F479', 'GI', 0x434]
  ]],
  ['stm32f7x', cortexDebugId, '0x1ff07a22', [
    ['F722 F723', 'CE', 0x452], ['F732 F733', 'E', 0x452], ['F730', '8', 0x452]
  ]],
  ['stm32f7x', cortexDebugId, '0x1ff0f442', [
    ['F745 F746', 'EG', 0x449], ['F750', '8', 0x449], ['F756', 'G', 0x449],
    ['F765 F767 F769', 'GI', 0x451], ['F777 F779', 'I', 0x451]
  ]],
  ['stm32g0x', lowPowerDebugId, '0x1fff75e0', [
    ['G030 G041', '68', 0x466], ['G031', '468', 0x466], ['G050 G051 G061', '68', 0x456],
    ['G070 G081', 'B', 0x460], ['G071', '68B', 0x460],
    ['G0B0', 'E', 0x467], ['G0B1', 'BCE', 0x467], ['G0C1', 'CE', 0x467]
  ]],
  ['stm32g4x', cortexDebugId, '0x1fff75e0', [
    ['G431', '68B', 0x468], ['G441', 'B', 0x468], ['G471', 'CE', 0x469],
    ['G473 G474', 'BCE', 0x469], ['G483 G484', 'E', 0x469],
    ['G491', 'CE', 0x479], ['G4A1', 'E', 0x479]
  ]],
  ['stm32h7x', h7DebugId, '0x1ff1e880', [
    ['H723 H725', 'EG', 0x483], ['H730', 'B', 0x483], ['H733 H735', 'G', 0x483], ['H750', 'B', 0x450]
  ]],
  ['stm32h7x_dual_bank', h7DebugId, '0x1ff1e880', [
    ['H742 H743', 'GI', 0x450], ['H753', 'I', 0x450]
  ]],
  ['stm32h7x', h7DebugId, '0x08fff80c', [
    ['H7B0', 'B', 0x480]
  ]],
  ['stm32h7x_dual_bank', h7DebugId, '0x08fff80c', [
    ['H7A3', 'GI', 0x480], ['H7B3', 'I', 0x480]
  ]],
  ['stm32l0', lowPowerDebugId, '0x1ff8007c', [
    ['L011', '34', 0x457], ['L021', '4', 0x457], ['L031 L041', '46', 0x425],
    ['L051 L052 L053', '68', 0x417], ['L062 L063', '8', 0x417], ['L071 L072 L073 L083', '8', 0x447]
  ]],
  ['stm32l0_dual_bank', lowPowerDebugId, '0x1ff8007c', [
    ['L071 L072 L073 L081 L082 L083', 'BZ', 0x447]
  ]],
  ['stm32l4x', cortexDebugId, '0x1fff75e0', [
    ['L412', '8B', 0x464], ['L422', 'B', 0x464], ['L431 L432 L433', 'BC', 0x435], ['L442 L443', 'C', 0x435],
    ['L451 L452', 'CE', 0x462], ['L462', 'E', 0x462], ['L471', 'EG', 0x415],
    ['L475 L476', 'CEG', 0x415], ['L485', 'CE', 0x415], ['L486', 'G', 0x415],
    ['L496', 'EG', 0x461], ['L4A6', 'G', 0x461], ['L4P5', 'EG', 0x471], ['L4Q5', 'G', 0x471],
    ['L4R5 L4R9', 'GI', 0x470], ['L4R7 L4S5 L4S7 L4S9', 'I', 0x470]
  ]],
  ['stm32u0x', lowPowerDebugId, '0x1fff3ea0', [
    ['U031', '468', 0x459]
  ]],
  ['stm32u0x', lowPowerDebugId, '0x1fff6ea0', [
    ['U073', '8BC', 0x489], ['U083', 'C', 0x489]
  ]],
  ['stm32u5x', '0xe0044000', '0x0bfa07a0', [
    ['U535', 'BCE', 0x455], ['U545', 'E', 0x455], ['U575', 'GI', 0x482], ['U585', 'I', 0x482],
    ['U595 U599 U5A5', 'IJ', 0x481], ['U5A9', 'J', 0x481]
  ]],
  ['stm32wlx', cortexDebugId, '0x1fff75e0', [
    ['WLE4 WLE5', '8BC', 0x497, 0x1000, '0x20000000']
  ]]
];

const chips = new Map();
for (const [config, idAddress, flashAddress, groups] of families) {
  for (const [series, densities, id, workAreaSize, workAreaAddress] of groups) {
    for (const line of series.split(' ')) {
      for (const density of densities) {
        const key = line + density;
        if (chips.has(key)) throw new Error(`重复的 STM32 型号规则：${key}`);
        chips.set(key, { config, idAddress, flashAddress, id, kib: flashKiB[density], workAreaSize, workAreaAddress });
      }
    }
  }
}

function resolveChip(model) {
  const parts = /^STM32([A-Z0-9]{4})[A-Z]([3468B-JZ])(?:[A-Z][0-9X][A-Z0-9]*)?$/i.exec(model || '');
  return parts ? chips.get((parts[1] + parts[2]).toUpperCase()) : undefined;
}

module.exports = { resolveChip };
