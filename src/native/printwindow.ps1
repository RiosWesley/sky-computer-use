param([int64]$Hwnd, [string]$Out)

Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
public static class SkyPrint {
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out RECT r);
  [DllImport("user32.dll")] public static extern bool PrintWindow(IntPtr h, IntPtr hdc, uint flags);
  [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr h);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr h);
  public struct RECT { public int Left, Top, Right, Bottom; }
  public const uint PW_RENDERFULLCONTENT = 0x00000002;
}
"@ -ErrorAction Stop
Add-Type -AssemblyName System.Drawing -ErrorAction Stop

$h = [IntPtr]$Hwnd
if ([SkyPrint]::IsIconic($h)) { Write-Error "MINIMIZED"; exit 2 }
$r = New-Object SkyPrint+RECT
[SkyPrint]::GetWindowRect($h, [ref]$r) | Out-Null
$w = $r.Right - $r.Left; $hgt = $r.Bottom - $r.Top
if ($w -le 0 -or $hgt -le 0) { Write-Error "EMPTY_RECT"; exit 3 }

$bmp = New-Object System.Drawing.Bitmap([int]$w, [int]$hgt)
$g = [System.Drawing.Graphics]::FromImage($bmp)
try {
  $hdc = $g.GetHdc()
  try {
    $ok = [SkyPrint]::PrintWindow($h, $hdc, [SkyPrint]::PW_RENDERFULLCONTENT)
    if (-not $ok) { Write-Error "PRINTWINDOW_FAILED"; exit 4 }
  } finally { $g.ReleaseHdc($hdc) }
} finally { $g.Dispose() }

# Detecta bitmap vazio (janela não renderizou, ex. minimizada/UWP protegida)
$blank = $true
for ($x = 0; $x -lt $w; $x += [Math]::Max(1, [int]($w / 20))) {
  for ($y = 0; $y -lt $hgt; $y += [Math]::Max(1, [int]($hgt / 20))) {
    if ($bmp.GetPixel($x, $y).ToArgb() -ne [System.Drawing.Color]::Black.ToArgb()) { $blank = $false; break }
  }
  if (-not $blank) { break }
}
$bmp.Save($Out, [System.Drawing.Imaging.ImageFormat]::Png)
$bmp.Dispose()
if ($blank) { Write-Error "BLANK"; exit 5 }
Write-Output "OK $w $hgt"
