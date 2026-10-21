param([long]$WindowHandle,[string]$Path)
[IO.File]::WriteAllText($Path+'.capture-status.txt','ASSEMBLY_LOAD')
# Screenshot only: captures the existing console HWND; no focus or input injection.
Add-Type -AssemblyName System.Drawing
Add-Type @'
using System;
using System.Runtime.InteropServices;
public static class EvidenceCapture {
 [StructLayout(LayoutKind.Sequential)] public struct RECT {public int Left,Top,Right,Bottom;}
 [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out RECT r);
 [DllImport("user32.dll")] public static extern bool PrintWindow(IntPtr h,IntPtr dc,uint flags);
}
'@
[IO.File]::WriteAllText($Path+'.capture-status.txt','TYPE_READY')
$r=New-Object EvidenceCapture+RECT
if(-not [EvidenceCapture]::GetWindowRect([IntPtr]$WindowHandle,[ref]$r)){throw 'Window unavailable'}
$b=New-Object Drawing.Bitmap(($r.Right-$r.Left),($r.Bottom-$r.Top))
$g=[Drawing.Graphics]::FromImage($b)
$dc=$g.GetHdc()
[IO.File]::WriteAllText($Path+'.capture-status.txt','PRINT_WINDOW')
try {if(-not [EvidenceCapture]::PrintWindow([IntPtr]$WindowHandle,$dc,2)){throw 'Capture failed'}}finally{$g.ReleaseHdc($dc)}
[IO.File]::WriteAllText($Path+'.capture-status.txt','SAVE_PNG')
try{$b.Save($Path,[Drawing.Imaging.ImageFormat]::Png)}finally{$g.Dispose();$b.Dispose()}
Write-Output $Path
[IO.File]::WriteAllText($Path+'.capture-status.txt','COMPLETE')
