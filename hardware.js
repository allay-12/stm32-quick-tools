const fs = require('node:fs/promises');
const path = require('node:path');
const { resolveChip } = require('./chips');

async function loadProject(folder) {
  const cwd = folder.uri.fsPath;
  const files = (await fs.readdir(cwd)).filter(file => /\.ioc$/i.test(file));
  if (!files.length) return;
  if (files.length !== 1) throw new Error('项目根目录下有多个 .ioc，请单独打开要操作的工程。');
  const ioc = await fs.readFile(path.join(cwd, files[0]), 'utf8');
  const configuredModel = /^Mcu\.CPN[ \t]*=([^\r\n]*)/m.exec(ioc)?.[1].trim()
    || /^Mcu\.UserName[ \t]*=([^\r\n]*)/m.exec(ioc)?.[1].trim();
  const model = configuredModel?.toUpperCase();
  const chip = resolveChip(model);
  if (!chip) {
    throw new Error(`暂不支持 ${model || '未声明芯片型号和 Flash 容量的工程'}。请查看支持列表。`);
  }
  const makefile = await fs.readFile(path.join(cwd, 'Makefile'), 'utf8');
  const target = /^TARGET[ \t]*[?:]?=[ \t]*([\w.-]+)[ \t]*\r?$/m.exec(makefile)?.[1];
  const buildDir = /^BUILD_DIR[ \t]*[?:]?=[ \t]*([\w./-]+)[ \t]*\r?$/m.exec(makefile)?.[1];
  if (!target || !buildDir || buildDir.startsWith('/') || buildDir.split('/').includes('..')) {
    throw new Error('未找到受支持的 CubeMX Makefile TARGET / BUILD_DIR。');
  }
  const baud = Number(/^USART\d+\.BaudRate[ \t]*=[ \t]*(\d{3,7})[ \t]*\r?$/m.exec(ioc)?.[1]);
  return { folder, cwd, model, chip, elf: `${buildDir}/${target}.elf`, baud: baud >= 100 ? baud : 115200 };
}

function classifyDevices(entries) {
  const byId = new Map(entries.filter(entry => entry.id).map(entry => [entry.id.toUpperCase(), entry]));
  const usbRootPattern = /^USB\\VID_[\da-f]{4}&PID_[\da-f]{4}\\[^\\]+$/i;
  const parentSpelling = new Map(entries.filter(entry => usbRootPattern.test(entry.parent || ''))
    .map(entry => [entry.parent.toUpperCase(), entry.parent]));
  const rootsByContainer = new Map();
  for (const entry of entries) {
    if (!entry.container || !usbRootPattern.test(entry.id || '')) continue;
    const roots = rootsByContainer.get(entry.container) || [];
    roots.push(entry);
    rootsByContainer.set(entry.container, roots);
  }
  function usbRoot(entry) {
    const visited = new Set();
    const devicePrefix = /^(?:USB|HID)\\(VID_[\da-f]{4}&PID_[\da-f]{4})/i.exec(entry.id)?.[1]?.toUpperCase();
    while (entry && devicePrefix && !visited.has(entry.id.toUpperCase())) {
      visited.add(entry.id.toUpperCase());
      if (usbRootPattern.test(entry.id) && entry.id.toUpperCase().startsWith('USB\\' + devicePrefix + '\\')) {
        return entry;
      }
      const parent = entry.parent;
      if (!parent) return;
      entry = byId.get(parent.toUpperCase()) || { id: parent };
    }
  }

  const groups = new Map();
  const ports = [];
  for (const entry of entries) {
    const id = entry.id;
    if (!id) continue;
    const containerRoots = rootsByContainer.get(entry.container) || [];
    const deviceCode = /^(?:USB|HID)\\(VID_[\da-f]{4}&PID_[\da-f]{4})/i.exec(id)?.[1]?.toUpperCase();
    const matchingRoots = containerRoots.filter(root => root.id.toUpperCase().startsWith('USB\\' + deviceCode + '\\'));
    const root = usbRoot(entry) || (matchingRoots.length === 1 ? matchingRoots[0] : undefined);
    const identity = (root?.id || entry.container || id).toUpperCase();
    const usb = /^(?:USB|HID)\\VID_([\da-f]{4})&PID_([\da-f]{4})/i.exec(id);
    const name = entry.name || '';
    const port = /\((COM\d+)\)\s*$/i.exec(name)?.[1]?.toUpperCase();
    if (port) ports.push({ port, identity, name, instance: id });
    if (!usb || (!root && !entry.container)) continue;
    const kind = /CMSIS[ -]?DAP|DAP[ -]?LINK/i.test(name) || /^0d28:0204$/i.test(`${usb[1]}:${usb[2]}`)
      ? 'CMSIS-DAP' : /ST[ -]?LINK/i.test(name) || (usb[1].toLowerCase() === '0483' &&
        /^(3744|3748|374b|374d|374e|374f|3752|3753|3754|3755|3757)$/i.test(usb[2])) ? 'ST-LINK' : undefined;
    if (!kind) continue;
    const serial = /^USB\\VID_[\da-f]{4}&PID_[\da-f]{4}\\([\w-]{6,100})$/i.exec(parentSpelling.get(identity) || root?.id || '')?.[1];
    const previous = groups.get(identity);
    groups.set(identity, {
      identity, kind, serial: serial || previous?.serial,
      container: root?.container || entry.container || previous?.container,
      name: /CMSIS|DAPLINK|ST.LINK/i.test(name) ? name : previous?.name || kind
    });
  }
  return { probes: [...groups.values()], ports };
}

function configLines(probe, chip) {
  const interfaceName = probe.kind === 'CMSIS-DAP' ? 'cmsis-dap' : 'stlink';
  const transport = probe.kind === 'CMSIS-DAP' ? 'swd' : 'dapdirect_swd';
  if (probe.serial && !/^[\w-]{6,100}$/.test(probe.serial)) throw new Error('无效的探针序列号。');
  return [
    'bindto 127.0.0.1',
    `source [find interface/${interfaceName}.cfg]`,
    ...(probe.serial ? [`adapter serial ${probe.serial}`] : []),
    `transport select ${transport}`,
    ...(chip.workAreaSize ? [`set WORKAREASIZE ${chip.workAreaSize}`] : []),
    `source [find target/${chip.config}.cfg]`,
    ...(chip.workAreaAddress ? [`[target current] configure -work-area-phys ${chip.workAreaAddress}`] : []),
    'adapter speed 1000'
  ];
}

function checkScript({ chip, model }) {
  return [
    'init',
    `set deviceId [expr {[lindex [read_memory ${chip.idAddress} 32 1] 0] & 0xfff}]`,
    `if {$deviceId != ${chip.id}} { error [format {STM32 mismatch: expected ${model} DEV_ID=0x${chip.id.toString(16)}, detected 0x%03x. No flash was written.} $deviceId] }`,
    `set flashKiB [lindex [read_memory ${chip.flashAddress} 16 1] 0]`,
    'echo [format {STM32 detected: DEV_ID=0x%03x Flash=%d KiB} $deviceId $flashKiB]',
    `if {$flashKiB != ${chip.kib}} { error {STM32 mismatch: expected ${model}, Flash=${chip.kib} KiB. No flash was written.} }`
  ].join('; ');
}

module.exports = { loadProject, classifyDevices, configLines, checkScript };
