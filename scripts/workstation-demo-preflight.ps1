param()
$ErrorActionPreference = 'Stop'
$checks = [System.Collections.Generic.List[object]]::new()
function Add-Check([string]$Name, [string]$Status, [string]$Reason) {
  $checks.Add([pscustomobject]@{name=$Name; status=$Status; reason=$Reason})
}
$computer = Get-CimInstance Win32_ComputerSystem
$cpu = Get-CimInstance Win32_Processor | Select-Object -First 1
$ramGiB = [math]::Round($computer.TotalPhysicalMemory / 1GB, 1)
$disk = Get-PSDrive -Name C
$freeGiB = [math]::Round($disk.Free / 1GB, 1)
Add-Check 'host-memory' $(if ($ramGiB -ge 32) {'PASS'} else {'FAIL'}) 'TWO_8GIB_GUESTS_PLUS_HOST_BUDGET'
Add-Check 'disk-headroom' $(if ($freeGiB -ge 160) {'PASS'} else {'FAIL'}) 'TWO_64GIB_SPARSE_DISKS_PLUS_IMAGE_RESERVE'
$vmrun = @('C:/Program Files (x86)/VMware/VMware Workstation/vmrun.exe','C:/Program Files/VMware/VMware Workstation/vmrun.exe') | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
$runningCount = $null
if ($vmrun) {
  $process = [System.Diagnostics.Process]::new()
  $process.StartInfo = [System.Diagnostics.ProcessStartInfo]::new()
  $process.StartInfo.FileName = $vmrun
  $process.StartInfo.Arguments = '-T ws list'
  $process.StartInfo.UseShellExecute = $false
  $process.StartInfo.CreateNoWindow = $true
  $process.StartInfo.RedirectStandardOutput = $true
  $process.StartInfo.RedirectStandardError = $true
  try {
    [void]$process.Start()
    $stdout = $process.StandardOutput.ReadToEndAsync()
    $stderr = $process.StandardError.ReadToEndAsync()
    if (-not $process.WaitForExit(15000)) {
      $process.Kill()
      Add-Check 'vmware-cli' 'NOT VERIFIED' 'OWNED_READ_COMMAND_TIMEOUT'
    } elseif ($process.ExitCode -eq 0 -and $stdout.Result -match 'Total running VMs:\s*(\d+)') {
      $runningCount = [int]$Matches[1]
      Add-Check 'vmware-cli' 'PASS' 'VMRUN_READ_ONLY_LIST_SUCCEEDED'
    } else { Add-Check 'vmware-cli' 'NOT VERIFIED' 'VMRUN_READ_FAILED' }
  } finally { $process.Dispose() }
} else { Add-Check 'vmware-cli' 'NOT VERIFIED' 'WORKSTATION_NOT_FOUND' }
# Hyper-V/WHP may hide the firmware flag. Do NOT disable Hyper-V/WSL/Docker.
Add-Check 'virtualization-runtime' 'NOT VERIFIED' $(if ($computer.HypervisorPresent) {'HYPERVISOR_PRESENT_ACTUAL_GUEST_BOOT_REQUIRED'} elseif ($cpu.VirtualizationFirmwareEnabled) {'FIRMWARE_FLAG_ONLY_ACTUAL_GUEST_BOOT_REQUIRED'} else {'FIRMWARE_OR_HYPERVISOR_REVIEW_REQUIRED'})
$interfaces = @(Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue | Where-Object { $_.InterfaceAlias -like '*VMware*' } | ForEach-Object { [pscustomobject]@{name=$_.InterfaceAlias; prefixLength=$_.PrefixLength} })
Add-Check 'dedicated-hospital-networks' 'NOT VERIFIED' 'NEW_VMNET20_VMNET21_MUST_BE_CREATED_AND_CONFLICT_CHECKED'
Add-Check 'guest-os-and-docker' 'NOT VERIFIED' 'NEW_DEDICATED_UBUNTU_GUESTS_NOT_INSTALLED'
Add-Check 'azure-private-connectivity' 'NOT VERIFIED' 'OVERLAY_OR_VPN_PRIVATE_ENDPOINT_AND_DNS_REQUIRED'
$result = [pscustomobject]@{
  scope='WORKSTATION CAPSTONE HOST PREFLIGHT ONLY'; reviewStatus='DRAFT / UNASSIGNED'
  status=$(if (@($checks | Where-Object status -eq 'FAIL').Count) {'FAIL'} else {'NOT VERIFIED'})
  host=[pscustomobject]@{ramGiB=$ramGiB; logicalProcessors=$computer.NumberOfLogicalProcessors; freeCGiB=$freeGiB; runningVmCount=$runningCount}
  vmwareInterfaces=$interfaces; checks=$checks
  mutationsPerformed=$false
}
$result | ConvertTo-Json -Depth 6
if ($result.status -eq 'FAIL') { exit 1 } else { exit 2 }
