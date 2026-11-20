# STM32 Quick Tools

Windows 本地预览版。用 VS Code 打开 CubeMX 的 Makefile 工程，底部状态栏会显示芯片、下载器、串口，以及编译、烧录、监视、调试按钮。

## 使用

- **芯片**：从项目根目录的 `.ioc` 读取完整型号。首版支持 STM32F103C8T6、STM32F407ZGT6 和 STM32F407VGT6；点芯片名可刷新。
- **下载器**：识别 CMSIS-DAP / ST-LINK。一个就自动选；多个时点状态栏选择。ST-LINK 需要支持 OpenOCD 的 `dapdirect_swd`。
- **编译**：保存文件并运行 `make -j4`。需要 GNU Make 和 `arm-none-eabi-gcc` 在 `PATH`。
- **烧录**：编译后用 OpenOCD 读芯片系列 ID 和 Flash 容量；不匹配就停止，不写 Flash。匹配后烧录、校验并复位运行。两种 F407 封装须手动确认。
- **串口监视**：优先找下载器自带的 COM 口，使用 `.ioc` 中首个显式设置的 USART 波特率，未设置时用 115200；固定 8N1。独立串口或其他波特率点状态栏设置。输出见「STM32 串口」，再次点击监视可关闭；先退出占用该端口的串口助手。
- **调试**：复用现有 Cortex-Debug/OpenOCD 配置的工具路径，用自动选出的探针附加到板上正在运行的固件。先烧录一次，避免板上固件与 ELF 的符号不一致。

扩展不改项目里的 `tasks.json`、`launch.json` 或 `openocd.cfg`，也不会在插上板子时自动烧录。
