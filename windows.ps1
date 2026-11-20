$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [Text.UTF8Encoding]::new($false)

if ($env:STM32_QUICK_MODE -eq 'devices') {
    $devices = @(Get-PnpDevice -PresentOnly | Where-Object {
        $_.InstanceId -match '^(USB|HID)\\VID_' -or $_.Class -eq 'Ports'
    })
    $keys = @{}
    $parents = @{}
    if ($devices.Count) {
        Get-PnpDeviceProperty -InstanceId $devices.InstanceId -KeyName @('DEVPKEY_Device_ContainerId', 'DEVPKEY_Device_Parent') -ErrorAction SilentlyContinue |
            ForEach-Object {
                if ($_.KeyName -eq 'DEVPKEY_Device_Parent') {
                    $parents[$_.InstanceId] = [string]$_.Data
                } else {
                    $container = ([string]$_.Data).Trim('{}')
                    if ($container -and $container -ne '00000000-0000-0000-ffff-ffffffffffff' -and
                        $container -ne '00000000-0000-0000-0000-000000000000') {
                        $keys[$_.InstanceId] = $container
                    }
                }
            }
    }
    $result = @($devices | ForEach-Object {
        @{ id = $_.InstanceId; name = $_.FriendlyName; container = $keys[$_.InstanceId]; parent = $parents[$_.InstanceId] }
    })
    [Console]::WriteLine((ConvertTo-Json -InputObject $result -Compress -Depth 3))
    exit
}

if ($env:STM32_QUICK_MODE -ne 'monitor' -or $env:STM32_QUICK_PORT -notmatch '^COM\d+$' -or
    $env:STM32_QUICK_BAUD -notmatch '^\d{3,7}$') { throw 'Invalid serial configuration.' }
$port = [IO.Ports.SerialPort]::new($env:STM32_QUICK_PORT, [int]$env:STM32_QUICK_BAUD, 'None', 8, 'One')
$port.Handshake = 'None'
$port.Encoding = [Text.Encoding]::UTF8
$port.DtrEnable = $true
try {
    $port.Open()
    [Console]::Error.WriteLine('STM32_QUICK_SERIAL_READY')
    while ($port.IsOpen) {
        $data = $port.ReadExisting()
        if ($data.Length) { [Console]::Write($data); [Console]::Out.Flush() }
        Start-Sleep -Milliseconds 30
    }
} finally {
    $port.Dispose()
}
