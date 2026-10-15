Add-Type -AssemblyName PresentationFramework, PresentationCore, WindowsBase

Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
public static class SkyCursor {
  [DllImport("user32.dll")] public static extern bool GetCursorPos(out POINT p);
  [DllImport("user32.dll")] public static extern short GetAsyncKeyState(int vKey);
  public struct POINT { public int X, Y; }
}
"@

$VK_ESCAPE = 0x1B

[xml]$xaml = @"
<Window xmlns="http://schemas.microsoft.com/winfx/2006/xaml/presentation"
        WindowStyle="None" AllowsTransparency="True" Background="#01000000"
        Topmost="True" ShowInTaskbar="False" ShowActivated="False"
        Title="sky-computer-use">
  <Canvas Name="root">
    <Border Name="banner" Background="#CC1A1A1A" CornerRadius="10" Padding="14,8">
      <TextBlock Foreground="White" FontSize="14" FontWeight="SemiBold"
        Text="●  sky — IA está usando seu computador   •   Esc para parar"/>
    </Border>
    <Ellipse Name="ring" Width="38" Height="38" Stroke="#FF4FA3FF" StrokeThickness="3" Opacity="0.95"/>
    <Ellipse Name="dot" Width="6" Height="6" Fill="#FF4FA3FF"/>
  </Canvas>
</Window>
"@

$reader = New-Object System.Xml.XmlNodeReader $xaml
$win = [Windows.Markup.XamlReader]::Load($reader)
$root = $win.FindName("root")
$banner = $win.FindName("banner")
$ring = $win.FindName("ring")
$dot = $win.FindName("dot")

# Cobre a área virtual (todos os monitores)
$vx = [System.Windows.SystemParameters]::VirtualScreenLeft
$vy = [System.Windows.SystemParameters]::VirtualScreenTop
$vw = [System.Windows.SystemParameters]::VirtualScreenWidth
$vh = [System.Windows.SystemParameters]::VirtualScreenHeight
$win.Left = $vx; $win.Top = $vy; $win.Width = $vw; $win.Height = $vh
$root.Width = $vw; $root.Height = $vh

# Banner centralizado no topo do monitor primário
$banner.Measure([System.Windows.Size]::new([double]::PositiveInfinity, [double]::PositiveInfinity))
$bs = $banner.DesiredSize
[System.Windows.Controls.Canvas]::SetLeft($banner, ($vw - $bs.Width) / 2)
[System.Windows.Controls.Canvas]::SetTop($banner, 12)

# Click-through: WS_EX_TRANSPARENT | WS_EX_LAYERED | WS_EX_NOACTIVATE
Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
public static class SkyEx {
  [DllImport("user32.dll")] public static extern int GetWindowLong(IntPtr h, int n);
  [DllImport("user32.dll")] public static extern int SetWindowLong(IntPtr h, int n, int v);
}
"@
$src = $null
$win.add_SourceInitialized({
  $src = [System.Windows.Interop.HwndSource]::FromVisual($win)
  $h = $src.Handle
  $ex = [SkyEx]::GetWindowLong($h, -20)
  [SkyEx]::SetWindowLong($h, -20, ($ex -bor 0x80000 -bor 0x20 -bor 0x08000000)) | Out-Null
})

$escDown = $false
$timer = New-Object System.Windows.Threading.DispatcherTimer
$timer.Interval = [TimeSpan]::FromMilliseconds(30)
$timer.add_Tick({
  $p = New-Object SkyCursor+POINT
  [SkyCursor]::GetCursorPos([ref]$p) | Out-Null
  $lx = $p.X - $vx; $ly = $p.Y - $vy
  [System.Windows.Controls.Canvas]::SetLeft($ring, ($lx - 19))
  [System.Windows.Controls.Canvas]::SetTop($ring, ($ly - 19))
  [System.Windows.Controls.Canvas]::SetLeft($dot, ($lx - 3))
  [System.Windows.Controls.Canvas]::SetTop($dot, ($ly - 3))
  $st = [SkyCursor]::GetAsyncKeyState($VK_ESCAPE)
  $down = ($st -band 0x8000) -ne 0
  if ($down -and -not $escDown) {
    [Console]::Out.WriteLine("STOP")
    [Console]::Out.Flush()
    $timer.Stop()
    $win.Close()
  }
  $escDown = $down
})
$timer.Start()

# Auto-hide por inatividade: o Node mata o processo após idle; aqui só garantimos saída limpa
$win.add_Closed({ $timer.Stop() })
[Console]::Out.WriteLine("READY")
[Console]::Out.Flush()
$null = $win.Dispatcher.InvokeAsync({ $win.Show() })
[System.Windows.Threading.Dispatcher]::Run()
