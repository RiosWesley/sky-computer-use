import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

function ps(script) {
  return execFileAsync("powershell", ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", script], {
    timeout: 15000,
    maxBuffer: 16 * 1024 * 1024,
    windowsHide: true,
  });
}

const ENUM_PRELUDE = `
Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
using System.Text;
public static class SkyWin {
  public delegate bool EnumProc(IntPtr hWnd, IntPtr lParam);
  [DllImport("user32.dll")] public static extern bool EnumWindows(EnumProc e, IntPtr l);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr h);
  [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr h);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern int GetWindowText(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint procIdOut);
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out RECT r);
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h, int cmd);
  [DllImport("user32.dll")] public static extern bool IsWindow(IntPtr h);
  public struct RECT { public int Left, Top, Right, Bottom; }
}
"@
`;

function escWinTitle(s) {
  return String(s ?? "").replace(/`/g, "``").replace(/\$/g, "`$").replace(/"/g, '`"');
}

export async function listWindowsRaw() {
  const script = ENUM_PRELUDE + `
$wins = New-Object System.Collections.ArrayList
$cb = [SkyWin+EnumProc]{
  param($h,$l)
  if ([SkyWin]::IsWindowVisible($h)) {
    $sb = New-Object Text.StringBuilder 512
    [SkyWin]::GetWindowText($h,$sb,512) | Out-Null
    $t=$sb.ToString()
    if ($t.Length -gt 0) {
      $procIdOut=0
      [SkyWin]::GetWindowThreadProcessId($h,[ref]$procIdOut) | Out-Null
      $r=New-Object SkyWin+RECT
      [SkyWin]::GetWindowRect($h,[ref]$r) | Out-Null
      $w=$r.Right-$r.Left; $hgt=$r.Bottom-$r.Top
      if ($w -gt 0 -and $hgt -gt 0) {
        $null = $wins.Add([pscustomobject]@{hwnd=[int64]$h; title=$t; pid=$procIdOut; left=$r.Left; top=$r.Top; right=$r.Right; bottom=$r.Bottom})
      }
    }
  }
  return $true
}
[SkyWin]::EnumWindows($cb, [IntPtr]::Zero) | Out-Null
foreach ($w in $wins) {
  try {
    $p = Get-Process -Id $w.pid -ErrorAction Stop
    $w | Add-Member -NotePropertyName exe -NotePropertyValue $p.Path -Force
    $w | Add-Member -NotePropertyName pname -NotePropertyValue $p.ProcessName -Force
  } catch {
    $w | Add-Member -NotePropertyName exe -NotePropertyValue "" -Force
    $w | Add-Member -NotePropertyName pname -NotePropertyValue "" -Force
  }
}
$wins | ConvertTo-Json -Depth 3 -Compress
`;
  const { stdout } = await ps(script);
  const text = stdout.trim();
  if (!text) return [];
  const parsed = JSON.parse(text);
  return Array.isArray(parsed) ? parsed : [parsed];
}

export function toWindowObject(raw) {
  const exe = raw.exe || raw.pname || "unknown";
  return {
    app: `process:${exe}`,
    id: Number(raw.hwnd),
    title: raw.title,
    _rect: { left: raw.left, top: raw.top, right: raw.right, bottom: raw.bottom },
    _pid: raw.pid,
    _exe: exe,
  };
}

export async function listWindows() {
  const raw = await listWindowsRaw();
  return raw.map(toWindowObject);
}

export async function getWindow(id, app) {
  const wins = await listWindows();
  const found = wins.find((w) => w.id === Number(id) && (app == null || w.app === app));
  if (!found) throw new Error(`window ${id} not found (it may have closed). Call list_windows again.`);
  return found;
}

export async function activateWindow(window) {
  const script = ENUM_PRELUDE + `
$h = [IntPtr]${Number(window.id)}
Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
public static class SkyFg {
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
  [DllImport("kernel32.dll")] public static extern uint GetCurrentThreadId();
  [DllImport("user32.dll")] public static extern bool AttachThreadInput(uint t1, uint t2, bool attach);
  [DllImport("user32.dll")] public static extern bool BringWindowToTop(IntPtr h);
  [DllImport("user32.dll")] public static extern bool SetActiveWindow(IntPtr h);
}
"@
[SkyWin]::ShowWindow($h, 9) | Out-Null
Start-Sleep -Milliseconds 200
[SkyWin]::SetForegroundWindow($h) | Out-Null
Start-Sleep -Milliseconds 300
if ([SkyFg]::GetForegroundWindow() -ne $h) {
  $fg = [SkyFg]::GetForegroundWindow()
  $fgTid = 0; $myTid = [SkyFg]::GetCurrentThreadId()
  [SkyFg]::GetWindowThreadProcessId($fg, [ref]$fgTid) | Out-Null
  [SkyFg]::AttachThreadInput($myTid, $fgTid, $true) | Out-Null
  [SkyWin]::ShowWindow($h, 9) | Out-Null
  [SkyFg]::BringWindowToTop($h) | Out-Null
  [SkyWin]::SetForegroundWindow($h) | Out-Null
  Start-Sleep -Milliseconds 300
  [SkyFg]::AttachThreadInput($myTid, $fgTid, $false) | Out-Null
}
@{foreground=([int64][SkyFg]::GetForegroundWindow()); target=${Number(window.id)}} | ConvertTo-Json -Compress
`;
  await ps(script);
  await new Promise((r) => setTimeout(r, 400));
}

export async function launchApp(app) {
  const target = String(app).trim().replace(/"/g, "");
  const script = `Start-Process -FilePath "${target.replace(/`/g, "``").replace(/\$/g, "`$")}"`;
  await ps(script);
}

export async function windowRect(id) {
  const script = ENUM_PRELUDE + `
$h = [IntPtr]${Number(id)}
$r=New-Object SkyWin+RECT
[SkyWin]::GetWindowRect($h,[ref]$r) | Out-Null
@{left=$r.Left; top=$r.Top; right=$r.Right; bottom=$r.Bottom} | ConvertTo-Json -Compress
`;
  const { stdout } = await ps(script);
  return JSON.parse(stdout.trim());
}
