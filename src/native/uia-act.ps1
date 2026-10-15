param([int64]$Hwnd, [string]$Mode, [string]$RuntimeId, [string]$Value = "", [string]$Action = "")

Add-Type -AssemblyName UIAutomationClient, UIAutomationTypes -ErrorAction Stop

$want = @()
try { $want = @((($RuntimeId | ConvertFrom-Json) | ForEach-Object { [int]$_ })) } catch { Write-Error "BAD_RUNTIMEID"; exit 2 }

$root = [System.Windows.Automation.AutomationElement]::FromHandle([IntPtr]$Hwnd)
if ($null -eq $root) { Write-Error "NO_ELEMENT"; exit 3 }
$walker = [System.Windows.Automation.TreeWalker]::ControlViewWalker
$script:found = $null

function SameId($a, $b) {
  if ($a.Count -ne $b.Count) { return $false }
  for ($i = 0; $i -lt $a.Count; $i++) { if ([int]$a[$i] -ne [int]$b[$i]) { return $false } }
  return $true
}
function Find($node) {
  if ($script:found -ne $null) { return }
  try { $rid = @($node.GetRuntimeId()) } catch { $rid = @() }
  if (SameId $rid $want) { $script:found = $node; return }
  try { $child = $walker.GetFirstChild($node) } catch { return }
  while ($null -ne $child -and $script:found -eq $null) {
    Find $child
    try { $child = $walker.GetNextSibling($child) } catch { break }
  }
}
Find $root
if ($null -eq $script:found) { Write-Error "ELEMENT_NOT_FOUND"; exit 4 }
$el = $script:found
try { $el.SetFocus() } catch {}
Start-Sleep -Milliseconds 150

switch ($Mode) {
  "invoke" {
    $p = $el.GetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern)
    if ($null -eq $p) { Write-Error "NO_INVOKE_PATTERN"; exit 5 }
    $p.Invoke()
    Write-Output "OK invoke"
  }
  "setvalue" {
    $p = $el.GetCurrentPattern([System.Windows.Automation.ValuePattern]::Pattern)
    if ($null -eq $p) { Write-Error "NO_VALUE_PATTERN"; exit 5 }
    if ($p.Current.IsReadOnly) { Write-Error "READONLY"; exit 6 }
    $p.SetValue($Value)
    Write-Output "OK setvalue"
  }
  "secondary" {
    $a = $Action.ToLower()
    if ($a -in @("expand")) {
      $p = $el.GetCurrentPattern([System.Windows.Automation.ExpandCollapsePattern]::Pattern)
      $p.Expand(); Write-Output "OK expand"
    } elseif ($a -in @("collapse")) {
      $p = $el.GetCurrentPattern([System.Windows.Automation.ExpandCollapsePattern]::Pattern)
      $p.Collapse(); Write-Output "OK collapse"
    } elseif ($a -in @("raise","select")) {
      $p = $el.GetCurrentPattern([System.Windows.Automation.SelectionItemPattern]::Pattern)
      $p.Select(); Write-Output "OK select"
    } elseif ($a -like "scroll*") {
      Write-Error "USE_SCROLL_TOOL"; exit 7
    } else {
      # fallback: tenta Invoke
      $p = $el.GetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern)
      if ($null -eq $p) { Write-Error "NO_PATTERN_FOR_ACTION"; exit 5 }
      $p.Invoke(); Write-Output "OK invoke-fallback"
    }
  }
  default { Write-Error "BAD_MODE"; exit 2 }
}
