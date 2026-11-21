# STM32 Quick Tools

STM32 Quick Tools 是一个面向 Windows 的 VS Code 扩展，目前处于预览阶段。打开 STM32CubeMX 生成的 Makefile 工程后，VS Code 底部状态栏会显示芯片、下载器和串口，并提供编译、烧录、串口监视和调试入口。

## 为什么做这个扩展

我们希望降低 STM32 的上手难度和日常使用门槛：第一次点灯时，可以先把代码烧进板子、看到串口输出，不必先学会配置每个工具。平时改完代码，点击「烧录」即可编译、校验并复位运行；换成受支持的芯片或下载器时，扩展会选择相应的 OpenOCD 配置，不用反复修改 VS Code 的 JSON 文件。

## 工具链

| 工具 | 作用 |
| --- | --- |
| STM32CubeMX | 选择芯片、配置引脚和外设，生成 `.ioc`、初始化代码和 `Makefile`。 |
| VS Code + STM32 Quick Tools | 编辑代码，在状态栏选择设备并启动常用操作。 |
| Arm GNU Toolchain + GNU Make | 由 `make` 调用 `arm-none-eabi-gcc` 等工具，把整个工程编译、链接成 ARM 固件。 |
| OpenOCD | 通过下载器的 SWD 接口检查芯片、烧录和校验固件，并提供调试服务。 |
| Cortex-Debug + Arm GDB（可选） | 需要断点、单步或查看变量时，连接 OpenOCD 调试。 |

扩展复用已安装的工具链。编译和烧录前，请确保 VS Code 能在 `PATH` 中找到 `make`、`arm-none-eabi-gcc` 和 `openocd`。串口监视使用 Windows 识别的 COM 口。

## 当前支持的硬件

| 系列 | 代表型号 | OpenOCD 目标配置 |
| --- | --- | --- |
| C0 | C011、C031、C071 | `stm32c0x.cfg` |
| F0 / F1 / F2 / F3 | F030、F072；F103、F107；F205、F207；F303、F334 | `stm32f0x.cfg`、`stm32f1x.cfg`（XL 容量用 `stm32xl.cfg`）、`stm32f2x.cfg`、`stm32f3x.cfg` |
| F4 / F7 | F401、F407、F411、F429、F446；F746、F767 | `stm32f4x.cfg`、`stm32f7x.cfg` |
| G0 / G4 | G031、G071、G0B1；G431、G474 | `stm32g0x.cfg`、`stm32g4x.cfg` |
| H7（单核） | H723、H743、H750、H753、H7A3 | `stm32h7x.cfg` 或 `stm32h7x_dual_bank.cfg` |
| L0 / L4 | L031、L072；L432、L476、L496 | `stm32l0.cfg` 或 `stm32l0_dual_bank.cfg`、`stm32l4x.cfg` |
| U0 / U5 | U031、U083；U535、U575、U585 | `stm32u0x.cfg`、`stm32u5x.cfg` |
| WL（单核） | WLE4、WLE5 | `stm32wlx.cfg` |

表内是代表型号，不等于支持整个系列。完整规则见 [chips.js](chips.js)。`STM32F103C8T6 + DAPLink` 已实测 SWD 连接；示例工程已通过底层工具链烧录并输出串口日志。其他型号已核对配置，尚未逐款实板烧录。当前烧录流程面向普通内部 Flash 工程，不覆盖双核、TrustZone 分区和外部 Flash 工作流。

| 下载器 | OpenOCD 接口配置 | 验证情况 |
| --- | --- | --- |
| CMSIS-DAP（含 DAPLink） | `interface/cmsis-dap.cfg` | 已实测一款 DAPLink 的探针识别、SWD 连接和虚拟串口配对。 |
| ST-LINK 系列 | `interface/stlink.cfg` | 已配置支持；需要探针固件与 OpenOCD 支持 `dapdirect_swd`，尚未实测各型号。 |

扩展优先读取 `.ioc` 的 `Mcu.CPN`，旧版工程可回退到 `Mcu.UserName`。烧录前通过 SWD 核对芯片组 ID 和 Flash 容量；这两项不能验证封装或完整料号，请确认板上丝印与工程一致。未收录的型号不会套用相近配置。OpenOCD 需包含该型号对应的目标脚本和 Flash 驱动，建议使用 xPack OpenOCD 0.12.0-7 或兼容版本。

## 快速上手

1. 在 Windows 上准备 VS Code 1.90 或更新版本，以及 STM32CubeMX、Arm GNU Toolchain、GNU Make 和 OpenOCD。打开新的 VS Code 终端，运行以下命令确认工具能找到：

   ```powershell
   arm-none-eabi-gcc --version
   make --version
   openocd --version
   ```

2. 从 [GitHub Releases](https://github.com/allay-12/stm32-quick-tools/releases) 的 **Assets** 下载所需版本的 `.vsix`。在 VS Code 按 `Ctrl+Shift+P`，运行 **Extensions: Install from VSIX...** 并选择该文件。
3. 在 STM32CubeMX 选择支持的 MCU，启用 `SYS → Debug → Serial Wire`，在 `Project Manager` 里将工具链设为 `Makefile`，然后生成代码。用 VS Code 打开同时包含 `.ioc` 和 `Makefile` 的工程根目录，并在确认来源可信后信任该工作区。
4. 连接下载器和目标板的 `SWDIO`、`SWCLK`、`GND`，给目标板正常供电。确认状态栏显示正确的芯片和下载器，点击 **烧录**。校验通过后目标板会复位并运行，无需按 `F5`。
5. 如果固件已配置 UART 日志，把开发板的 UART TX 接到下载器或 USB 转串口模块的 RX，并共地。确认状态栏的 COM 口和波特率后，点击 **监视**，在「STM32 串口」输出面板查看日志。

若底部没有按钮，先确认打开的是工程文件夹而不是单个源码文件，再运行 `Developer: Reload Window`。如果终端仍找不到刚加入 `PATH` 的工具，完全退出并重开 VS Code。

## 状态栏操作

- **设备选择**：打开包含 `.ioc` 和 `Makefile` 的工程根目录。点击芯片名可刷新设备；只检测到一支下载器时自动选择，多支时在状态栏手动选择。
- **编译**：保存文件并运行 `make -j4`。
- **烧录**：先编译再检查芯片；不匹配就停止，不写入 Flash。检查通过后烧录、校验并复位运行，无需先添加 `make flash` 规则。烧录前请先结束正在运行的调试会话。
- **串口监视**：优先找下载器自带的 COM 口，使用 `.ioc` 中首个显式设置的 USART 波特率，未设置时用 115200；固定 8N1。独立串口或其他波特率点状态栏设置。输出见「STM32 串口」，再次点击监视可关闭；先退出占用该端口的串口助手。
- **调试**：复用现有 Cortex-Debug/OpenOCD 配置的工具路径，用自动选出的探针附加到板上正在运行的固件。先烧录一次，避免板上固件与 ELF 的符号不一致。

扩展不改项目里的 `tasks.json`、`launch.json` 或 `openocd.cfg`，也不会在插上板子时自动烧录。
