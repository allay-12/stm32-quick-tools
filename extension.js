const vscode = require('vscode');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { spawn, execFile } = require('node:child_process');
const { promisify } = require('node:util');
const { loadProject, classifyDevices, configLines, checkScript } = require('./hardware');

const exec = promisify(execFile);
const prefix = 'stm32Quick.';
const windowsScript = ['-NoLogo', '-NoProfile', '-NonInteractive', '-File', path.join(__dirname, 'windows.ps1')];

function run(command, args, options, output) {
  return new Promise((resolve, reject) => {
    output.appendLine(`> ${command} ${args.map(arg => /\s/.test(arg) ? JSON.stringify(arg) : arg).join(' ')}`);
    const child = spawn(command, args, { ...options, windowsHide: true });
    child.stdout.setEncoding('utf8').on('data', chunk => output.append(chunk));
    child.stderr.setEncoding('utf8').on('data', chunk => output.append(chunk));
    child.once('error', reject);
    child.once('close', code => code === 0 ? resolve() : reject(new Error(`${command} 退出码：${code}，请查看 STM32 输出。`)));
  });
}

function activate(context) {
  if (process.platform !== 'win32' || vscode.env.remoteName || !vscode.workspace.isTrusted) return;
  const output = vscode.window.createOutputChannel('STM32 Quick Tools');
  const serialOutput = vscode.window.createOutputChannel('STM32 串口');
  const bars = {};
  const debugConfigs = new Map();
  let projects = [];
  let devices = { probes: [], ports: [] };
  let scan;
  let busy;
  let serial;
  let disposed = false;

  function bar(name, text, tooltip, command, priority) {
    const item = vscode.window.createStatusBarItem(prefix + name, vscode.StatusBarAlignment.Left, priority);
    item.name = `STM32: ${tooltip}`;
    item.text = text;
    item.tooltip = tooltip;
    item.command = prefix + command;
    bars[name] = item;
    context.subscriptions.push(item);
  }

  bar('chip', '$(circuit-board) STM32', '工程芯片 / 刷新设备', 'refresh', 94);
  bar('probe', '$(plug) 下载器', '选择下载器', 'probe', 93);
  bar('serial', '$(symbol-number) COM', '设置串口与波特率', 'serial', 92);
  bar('build', '$(tools) 编译', '编译 STM32 工程', 'build', 91);
  bar('flash', '$(zap) 烧录', '编译、校验并复位运行', 'flash', 90);
  bar('monitor', '$(terminal) 监视', '打开或关闭串口监视', 'monitor', 89);
  bar('debug', '$(debug-alt) 调试', '用 Cortex-Debug 附加到已烧录固件', 'debug', 88);

  function projectForEditor() {
    const active = vscode.window.activeTextEditor?.document.uri;
    const folder = active && vscode.workspace.getWorkspaceFolder(active);
    return projects.find(project => project.folder === folder || project.cwd === folder?.uri.fsPath)
      || (projects.length === 1 ? projects[0] : undefined);
  }

  function setting(name, project, fallback) {
    return context.workspaceState.get(`${name}:${project.cwd}`, fallback);
  }

  function selectedProbe(project) {
    const saved = setting('probe', project);
    return devices.probes.find(probe => probe.identity === saved || (saved && probe.container === saved))
      || (devices.probes.length === 1 ? devices.probes[0] : undefined);
  }

  function selectedPort(project, probe) {
    const saved = setting('port', project);
    const remembered = devices.ports.find(item => item.instance === saved);
    if (remembered) return remembered;
    const linked = probe ? devices.ports.filter(item => item.identity === probe.identity) : [];
    return linked.length === 1 ? linked[0] : undefined;
  }

  function redraw() {
    if (disposed) return;
    const project = projectForEditor();
    const probe = project && selectedProbe(project);
    const port = project && selectedPort(project, probe);
    bars.chip.text = `$(circuit-board) ${project?.model || 'STM32'}`;
    bars.probe.text = `$(plug) ${probe?.kind || (devices.probes.length ? '选择下载器' : '未检测到探针')}`;
    bars.serial.text = `$(symbol-number) ${serial?.port || port?.port || '选择串口'}${project ? ' · ' + (serial?.baud || setting('baud', project, project.baud)) : ''}`;
    bars.monitor.text = serial ? '$(primitive-square) 停止监视' : '$(terminal) 监视';
    bars.build.text = busy === '编译' ? '$(sync~spin) 编译' : '$(tools) 编译';
    bars.flash.text = busy === '烧录' ? '$(sync~spin) 烧录' : '$(zap) 烧录';
    bars.debug.text = busy === '调试' ? '$(sync~spin) 调试' : '$(debug-alt) 调试';
    for (const item of Object.values(bars)) {
      if (projects.length) item.show();
      else item.hide();
    }
  }

  async function refresh(show = false, detect = true) {
    const found = [];
    for (const folder of vscode.workspace.workspaceFolders || []) {
      if (folder.uri.scheme !== 'file') continue;
      try {
        const project = await loadProject(folder);
        if (project) found.push(project);
      } catch (error) {
        if (show) output.appendLine(error.message);
      }
    }
    projects = found;
    if (detect && projects.length) {
      scan ||= exec('powershell.exe', windowsScript, {
        encoding: 'utf8', windowsHide: true, timeout: 10000,
        env: { ...process.env, STM32_QUICK_MODE: 'devices' }
      }).then(({ stdout }) => {
        devices = classifyDevices(JSON.parse(stdout));
      }).finally(() => { scan = undefined; });
      try { await scan; }
      catch (error) {
        devices = { probes: [], ports: [] };
        if (show) throw new Error(`Windows 设备识别失败：${error.message}`);
      } finally { redraw(); }
    }
    redraw();
    if (show) {
      output.appendLine(`工程：${projects.map(project => project.model).join('、') || '未找到支持的工程'}；探针：${devices.probes.length}；串口：${devices.ports.map(port => port.port).join('、') || '无'}`);
      output.show(true);
    }
  }

  async function chooseProject() {
    const current = projectForEditor();
    if (current) return current;
    if (!projects.length) throw new Error('请打开包含 .ioc 和 Makefile 的工程文件夹（首版支持 F103C8T6 / F407ZGT6 / F407VGT6）。');
    return (await vscode.window.showQuickPick(projects.map(project => ({
      label: project.folder.name, description: project.model, project
    })), { placeHolder: '选择 STM32 工程' }))?.project;
  }

  async function chooseProbe(project, force = false) {
    if (!force && selectedProbe(project)) return selectedProbe(project);
    if (!devices.probes.length) throw new Error('未检测到 CMSIS-DAP / ST-LINK。请接好 USB，再点刷新。');
    const choice = await vscode.window.showQuickPick(devices.probes.map(probe => ({
      label: probe.kind, description: probe.serial || probe.name,
      detail: probe.serial ? probe.name : probe.identity, probe
    })), { placeHolder: '选择下载器' });
    if (!choice) return;
    await context.workspaceState.update(`probe:${project.cwd}`, choice.probe.identity);
    redraw();
    return choice.probe;
  }

  async function probeForAction(project) {
    const probe = await chooseProbe(project);
    if (probe && devices.probes.filter(item => item.kind === probe.kind).length > 1 &&
        (!probe.serial || devices.probes.filter(item => item.kind === probe.kind && item.serial === probe.serial).length !== 1)) {
      throw new Error('同类下载器的序列号缺失或重复。请暂时只连接要使用的那一支。');
    }
    return probe;
  }

  async function pickPort(project) {
    if (!devices.ports.length) throw new Error('Windows 未找到可选串口。');
    const port = (await vscode.window.showQuickPick(devices.ports.map(item => ({
      label: item.port, description: item.name, port: item
    })), { placeHolder: '选择串口（DAP 的串口或独立 USB 转串口）' }))?.port;
    if (!port) return;
    const baud = await vscode.window.showInputBox({
      prompt: '波特率（固定 8N1，无流控）',
      value: String(setting('baud', project, project.baud)),
      validateInput: value => /^\d{3,7}$/.test(value) && Number(value) >= 100 ? undefined : '请输入有效波特率。'
    });
    if (!baud) return;
    await context.workspaceState.update(`port:${project.cwd}`, port.instance);
    await context.workspaceState.update(`baud:${project.cwd}`, Number(baud));
    redraw();
    return port;
  }

  async function withProject(label, detect, callback) {
    if (busy) throw new Error(`正在${busy}，请稍等。`);
    busy = label;
    redraw();
    try {
      await refresh(false, detect);
      const project = await chooseProject();
      if (project) await callback(project);
    } finally {
      busy = undefined;
      redraw();
    }
  }

  async function build(project) {
    if (!(await vscode.workspace.saveAll(false))) throw new Error('没有保存完所有文件，已取消。');
    output.show(true);
    await run('make', ['-j4'], { cwd: project.cwd }, output);
    await fs.access(path.join(project.cwd, project.elf));
  }

  function assertDebuggerIdle() {
    if (vscode.debug.activeDebugSession) throw new Error('请先结束当前调试会话，再使用下载器。');
  }

  function openocd(project, probe, command) {
    const args = ['-c', 'gdb port disabled; tcl port disabled; telnet port disabled'];
    for (const line of configLines(probe, project.chip)) args.push('-c', line);
    args.push('-c', command);
    return run('openocd', args, { cwd: project.cwd }, output);
  }

  async function flash(project) {
    assertDebuggerIdle();
    const probe = await probeForAction(project);
    if (!probe) return;
    if (project.chip.config === 'stm32f4x') {
      const proceed = await vscode.window.showWarningMessage(
        `请确认实际接的是 ${project.model}。SWD 无法区分这两种 F407 封装。`,
        { modal: true }, '确认烧录');
      if (proceed !== '确认烧录') return;
    }
    await build(project);
    assertDebuggerIdle();
    await openocd(project, probe, `${checkScript(project)}; program {${project.elf}} verify reset exit`);
    vscode.window.setStatusBarMessage('STM32 烧录校验通过，已复位运行。', 4000);
  }

  async function debug(project) {
    assertDebuggerIdle();
    const configurations = vscode.workspace.getConfiguration('launch', project.folder.uri).get('configurations', []);
    const config = configurations.find(item => item.type === 'cortex-debug' && item.servertype === 'openocd');
    if (!config || !vscode.extensions.getExtension('marus25.cortex-debug')) {
      throw new Error('调试需要 Cortex-Debug 和工作区里的 OpenOCD 调试配置。');
    }
    const probe = await probeForAction(project);
    if (!probe) return;
    await fs.access(path.join(project.cwd, project.elf));
    await openocd(project, probe, `${checkScript(project)}; shutdown`);
    const scratch = await fs.mkdtemp(path.join(os.tmpdir(), 'stm32-quick-'));
    const cfg = path.join(scratch, 'openocd.cfg');
    const name = `STM32 附加 (${project.folder.name})`;
    debugConfigs.set(name, scratch);
    try {
      await fs.writeFile(cfg, configLines(probe, project.chip).join('\n') + '\n');
      const ok = await vscode.debug.startDebugging(project.folder, {
        name, type: 'cortex-debug', request: 'attach', servertype: 'openocd',
        gdbPath: config.gdbPath, objdumpPath: config.objdumpPath,
        armToolchainPath: config.armToolchainPath, toolchainPrefix: config.toolchainPrefix,
        serverpath: config.serverpath,
        cwd: project.cwd, executable: path.join(project.cwd, project.elf), configFiles: [cfg]
      });
      if (!ok) throw new Error('未能启动 Cortex-Debug。');
    } catch (error) {
      debugConfigs.delete(name);
      await removeConfig(scratch);
      throw error;
    }
  }

  async function removeConfig(dir) {
    await fs.unlink(path.join(dir, 'openocd.cfg')).catch(() => {});
    await fs.rmdir(dir).catch(() => {});
  }

  async function monitor() {
    if (serial) {
      serial.child.kill();
      return;
    }
    await withProject('打开监视', true, async project => {
      const port = selectedPort(project, selectedProbe(project)) || await pickPort(project);
      if (!port) return;
      const baud = setting('baud', project, project.baud);
      serialOutput.show(true);
      serialOutput.appendLine(`打开 ${port.port} · ${baud} · 8N1`);
      const child = spawn('powershell.exe', windowsScript, {
        windowsHide: true,
        env: { ...process.env, STM32_QUICK_MODE: 'monitor', STM32_QUICK_PORT: port.port, STM32_QUICK_BAUD: String(baud) }
      });
      const current = { child, port: port.port, baud };
      serial = current;
      redraw();
      child.stdout.setEncoding('utf8').on('data', chunk => serialOutput.append(chunk));
      child.stderr.setEncoding('utf8').on('data', chunk => {
        serialOutput.append(chunk.replace('STM32_QUICK_SERIAL_READY', '串口已连接'));
      });
      child.once('error', error => serialOutput.appendLine(error.message));
      child.once('close', code => {
        if (disposed) return;
        if (serial === current) serial = undefined;
        serialOutput.appendLine(`\n串口已关闭${code ? `（退出码 ${code}，请检查端口是否被占用）` : ''}。`);
        redraw();
      });
    });
  }

  function command(name, handler) {
    context.subscriptions.push(vscode.commands.registerCommand(prefix + name, async () => {
      try { await handler(); }
      catch (error) {
        output.appendLine(error.message);
        vscode.window.showErrorMessage(`STM32: ${error.message}`);
      }
    }));
  }

  command('refresh', () => refresh(true));
  command('probe', () => withProject('选择下载器', true, project => chooseProbe(project, true)));
  command('serial', () => withProject('设置串口', true, pickPort));
  command('build', () => withProject('编译', false, build));
  command('flash', () => withProject('烧录', true, flash));
  command('monitor', monitor);
  command('debug', () => withProject('调试', true, debug));
  context.subscriptions.push(
    output, serialOutput,
    vscode.window.onDidChangeActiveTextEditor(redraw),
    vscode.workspace.onDidChangeWorkspaceFolders(() => { void refresh(); }),
    vscode.debug.onDidTerminateDebugSession(session => {
      const dir = debugConfigs.get(session.name);
      if (!dir) return;
      debugConfigs.delete(session.name);
      void removeConfig(dir);
    }),
    { dispose() {
      disposed = true;
      serial?.child.kill();
      clearInterval(timer);
      for (const dir of debugConfigs.values()) void removeConfig(dir);
    } }
  );
  const timer = setInterval(() => { if (vscode.window.state.focused && !busy && !scan) void refresh(); }, 12000);
  void refresh();
}

module.exports = { activate };
