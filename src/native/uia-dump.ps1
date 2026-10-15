param([int64]$Hwnd, [int]$MaxNodes = 600, [int]$MaxDepth = 7)

Add-Type -AssemblyName UIAutomationClient, UIAutomationTypes -ErrorAction Stop

$el = [System.Windows.Automation.AutomationElement]::FromHandle([IntPtr]$Hwnd)
if ($null -eq $el) { Write-Error "NO_ELEMENT"; exit 2 }

$walker = [System.Windows.Automation.TreeWalker]::ControlViewWalker
$out = New-Object System.Collections.ArrayList
$script:n = 0

function Dump($node, $depth) {
  if ($script:n -ge $MaxNodes -or $depth -gt $MaxDepth) { return }
  try { $r = $node.Current.BoundingRectangle } catch { return }
  $pats = @()
  try {
    if ($node.GetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern) -ne $null) { $pats += "Invoke" }
  } catch {}
  try {
    $vp = $node.GetCurrentPattern([System.Windows.Automation.ValuePattern]::Pattern)
    if ($vp -ne $null) { $pats += "Value" }
  } catch {}
  try {
    if ($node.GetCurrentPattern([System.Windows.Automation.TogglePattern]::Pattern) -ne $null) { $pats += "Toggle" }
  } catch {}
  try {
    if ($node.GetCurrentPattern([System.Windows.Automation.ExpandCollapsePattern]::Pattern) -ne $null) { $pats += "ExpandCollapse" }
  } catch {}
  try {
    if ($node.GetCurrentPattern([System.Windows.Automation.ScrollPattern]::Pattern) -ne $null) { $pats += "Scroll" }
  } catch {}
  try {
    if ($node.GetCurrentPattern([System.Windows.Automation.SelectionItemPattern]::Pattern) -ne $null) { $pats += "Select" }
  } catch {}
  $rid = @()
  try { $rid = @($node.GetRuntimeId()) } catch {}
  $item = [pscustomobject]@{
    index = $script:n
    depth = $depth
    name = [string]$node.Current.Name
    type = [string]$node.Current.ControlType.ProgrammaticName
    x = [int]$r.X; y = [int]$r.Y; w = [int]$r.Width; h = [int]$r.Height
    patterns = $pats
    runtimeId = $rid
  }
  $null = $out.Add($item)
  $script:n++
  try { $child = $walker.GetFirstChild($node) } catch { return }
  while ($null -ne $child -and $script:n -lt $MaxNodes) {
    Dump $child ($depth + 1)
    try { $child = $walker.GetNextSibling($child) } catch { break }
  }
}

Dump $el 0
$focused = ""
try {
  $f = [System.Windows.Automation.AutomationElement]::FocusedElement
  if ($f -ne $null) { $focused = [string]$f.Current.Name }
} catch {}
@{ tree = $out; focused = $focused; count = $out.Count } | ConvertTo-Json -Depth 6 -Compress
