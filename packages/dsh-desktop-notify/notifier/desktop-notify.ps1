<#
.SYNOPSIS
  Desktop notification cards for DeepSeek Harness.

.DESCRIPTION
  Watches a spool directory for JSON payloads written by the
  @local/dsh-desktop-notify Host plugin and shows each one as an
  always-on-top card in the bottom-right corner of the primary screen.

  One card per Session: a newer card for the same Session replaces the older
  one instead of stacking a tower of duplicates. Completion cards fade away
  after -DoneSeconds; cards that need an answer stay until dismissed. Clicking
  a card records the click, raises the Harness window and closes the card; the
  browser half picks the click up over the Host's /desktop-notify/click route.

  The process is a singleton guarded by a named mutex, every handler is
  guarded so one bad card cannot kill the rest, and it exits after IdleMinutes
  without cards.
#>
param(
  [Parameter(Mandatory = $true)][string]$QueueDir,
  [int]$Width = 380,
  [int]$CardHeight = 82,
  [int]$Gap = 10,
  [int]$Margin = 18,
  [int]$IdleMinutes = 20,
  [int]$MaxCards = 6,
  [int]$DoneSeconds = 10,
  [switch]$Mute,
  [switch]$FocusTest,
  [switch]$ClickTest
)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName PresentationFramework
Add-Type -AssemblyName PresentationCore
Add-Type -AssemblyName WindowsBase

Add-Type -TypeDefinition @"
using System;
using System.Text;
using System.Runtime.InteropServices;

public static class DshNotifyInterop
{
    public delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);

    [DllImport("user32.dll")]
    public static extern bool EnumWindows(EnumWindowsProc callback, IntPtr lParam);

    [DllImport("user32.dll")]
    public static extern bool IsWindowVisible(IntPtr hWnd);

    [DllImport("user32.dll")]
    public static extern bool IsIconic(IntPtr hWnd);

    [DllImport("user32.dll", CharSet = CharSet.Unicode)]
    public static extern int GetWindowText(IntPtr hWnd, StringBuilder text, int maxCount);

    [DllImport("user32.dll")]
    public static extern bool ShowWindowAsync(IntPtr hWnd, int command);

    [DllImport("user32.dll")]
    public static extern bool SetForegroundWindow(IntPtr hWnd);

    [DllImport("user32.dll")]
    public static extern bool SwitchToThisWindow(IntPtr hWnd, bool altTab);

    [DllImport("user32.dll")]
    public static extern bool BringWindowToTop(IntPtr hWnd);

    [DllImport("user32.dll")]
    public static extern bool AttachThreadInput(uint idAttach, uint idAttachTo, bool attach);

    [DllImport("user32.dll")]
    public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint processId);

    [DllImport("kernel32.dll")]
    public static extern uint GetCurrentThreadId();

    [DllImport("user32.dll")]
    public static extern IntPtr GetForegroundWindow();

    [DllImport("user32.dll")]
    public static extern void keybd_event(byte virtualKey, byte scanCode, uint flags, UIntPtr extraInfo);

    public static IntPtr FindHarnessWindow()
    {
        IntPtr visible = IntPtr.Zero;
        IntPtr hidden = IntPtr.Zero;
        EnumWindows((hWnd, lParam) =>
        {
            StringBuilder text = new StringBuilder(512);
            if (GetWindowText(hWnd, text, text.Capacity) <= 0) return true;
            if (text.ToString().IndexOf("DeepSeek Harness", StringComparison.OrdinalIgnoreCase) < 0) return true;
            if (IsWindowVisible(hWnd))
            {
                if (visible == IntPtr.Zero) visible = hWnd;
            }
            else if (hidden == IntPtr.Zero)
            {
                hidden = hWnd;
            }
            return true;
        }, IntPtr.Zero);
        return visible != IntPtr.Zero ? visible : hidden;
    }

    public static bool FocusWindow(IntPtr hWnd)
    {
        if (hWnd == IntPtr.Zero) return false;
        ShowWindowAsync(hWnd, IsIconic(hWnd) ? 9 : 5);
        uint owner;
        uint target = GetWindowThreadProcessId(hWnd, out owner);
        uint current = GetCurrentThreadId();
        bool attached = target != 0 && target != current && AttachThreadInput(current, target, true);
        try
        {
            BringWindowToTop(hWnd);
            // The foreground lock refuses SetForegroundWindow from a background
            // process; a synthetic Alt press releases it for this call.
            keybd_event(0x12, 0, 0, UIntPtr.Zero);
            keybd_event(0x12, 0, 2, UIntPtr.Zero);
            if (SetForegroundWindow(hWnd)) return true;
            SwitchToThisWindow(hWnd, true);
            return GetForegroundWindow() == hWnd;
        }
        finally
        {
            if (attached) AttachThreadInput(current, target, false);
        }
    }
}
"@

$stateDir = Split-Path -Parent $QueueDir
if (-not (Test-Path -LiteralPath $stateDir)) {
  New-Item -ItemType Directory -Path $stateDir -Force | Out-Null
}
if (-not (Test-Path -LiteralPath $QueueDir)) {
  New-Item -ItemType Directory -Path $QueueDir -Force | Out-Null
}

function Write-Log {
  param([string]$Message)
  try {
    Add-Content -LiteralPath (Join-Path $stateDir 'notifier.log') -Value ("{0} {1}" -f (Get-Date -Format 's'), $Message) -Encoding utf8
  } catch {
  }
}

function Focus-Harness {
  $handle = [DshNotifyInterop]::FindHarnessWindow()
  if ($handle -eq [IntPtr]::Zero) {
    Write-Log 'focus: harness window not found'
    return $false
  }
  for ($attempt = 1; $attempt -le 3; $attempt++) {
    if ([DshNotifyInterop]::FocusWindow($handle)) {
      Write-Log ("focus: ok (attempt " + $attempt + ")")
      return $true
    }
    Start-Sleep -Milliseconds 120
  }
  Write-Log 'focus: refused by the foreground lock'
  return $false
}

function Save-Click {
  param([string]$SessionId)
  if ([string]::IsNullOrEmpty($SessionId)) { return }
  try {
    $clickPath = Join-Path $stateDir 'click.json'
    $items = @()
    if (Test-Path -LiteralPath $clickPath) {
      try {
        $existing = Get-Content -LiteralPath $clickPath -Raw -Encoding UTF8 | ConvertFrom-Json
        if ($null -ne $existing -and $null -ne $existing.items) { $items = @($existing.items) }
      } catch {
        $items = @()
      }
    }
    $items += @{ sessionId = $SessionId }
    @{ items = $items } | ConvertTo-Json -Compress -Depth 4 |
      Set-Content -LiteralPath $clickPath -Encoding utf8
    Write-Log ("click: " + $SessionId)
  } catch {
    Write-Log ("click save failed: " + $_.Exception.Message)
  }
}

# --- sound ---------------------------------------------------------------

function New-ChimeWave {
  param(
    [string]$Path,
    [double[]]$Frequencies
  )

  $rate = 44100
  $samples = New-Object 'System.Collections.Generic.List[System.Int16]'
  foreach ($frequency in $Frequencies) {
    $count = [int]($rate * 0.16)
    for ($index = 0; $index -lt $count; $index++) {
      $time = $index / $rate
      $envelope = [Math]::Sin([Math]::PI * $index / $count)
      $value = [Math]::Sin(2 * [Math]::PI * $frequency * $time) * 0.28 * $envelope
      $samples.Add([System.Int16]($value * 32767))
    }
    $silence = [int]($rate * 0.03)
    for ($index = 0; $index -lt $silence; $index++) {
      $samples.Add([System.Int16]0)
    }
  }

  $data = $samples.ToArray()
  $stream = New-Object System.IO.MemoryStream
  $writer = [System.IO.BinaryWriter]::new($stream)
  $writer.Write([System.Text.Encoding]::ASCII.GetBytes('RIFF'))
  $writer.Write([int](36 + $data.Length * 2))
  $writer.Write([System.Text.Encoding]::ASCII.GetBytes('WAVE'))
  $writer.Write([System.Text.Encoding]::ASCII.GetBytes('fmt '))
  $writer.Write([int]16)
  $writer.Write([int16]1)
  $writer.Write([int16]1)
  $writer.Write([int]$rate)
  $writer.Write([int]($rate * 2))
  $writer.Write([int16]2)
  $writer.Write([int16]16)
  $writer.Write([System.Text.Encoding]::ASCII.GetBytes('data'))
  $writer.Write([int]($data.Length * 2))
  foreach ($sample in $data) {
    $writer.Write($sample)
  }
  $writer.Flush()
  [System.IO.File]::WriteAllBytes($Path, $stream.ToArray())
  $writer.Close()
  $stream.Close()
}

$donePath = Join-Path $stateDir 'chime-done.wav'
$waitPath = Join-Path $stateDir 'chime-wait.wav'
if (-not (Test-Path -LiteralPath $donePath)) {
  New-ChimeWave -Path $donePath -Frequencies @(659.25, 987.77)
}
if (-not (Test-Path -LiteralPath $waitPath)) {
  New-ChimeWave -Path $waitPath -Frequencies @(523.25, 659.25, 783.99)
}
$donePlayer = $null
$waitPlayer = $null
if (-not $Mute) {
  try {
    $donePlayer = [System.Media.SoundPlayer]::new($donePath)
    $waitPlayer = [System.Media.SoundPlayer]::new($waitPath)
  } catch {
    Write-Log ("sound unavailable: " + $_.Exception.Message)
  }
}

# --- one-shot diagnostics ------------------------------------------------

if ($FocusTest) {
  if (Focus-Harness) { exit 0 } else { exit 1 }
}

if ($ClickTest) {
  Save-Click -SessionId 'click-test'
  if (Focus-Harness) { exit 0 } else { exit 1 }
}

# --- singleton -----------------------------------------------------------

# Several notifiers sharing one spool render each payload more than once and
# fight over the card slots, so only the first process may draw. A second one
# exits immediately; the Host keeps its child reference either way.
$mutex = $null
try {
  $mutex = New-Object System.Threading.Mutex($false, 'Global\dsh-desktop-notify')
  if (-not $mutex.WaitOne(0)) {
    Write-Log 'another notifier owns the cards; exiting'
    exit 0
  }
} catch {
  Write-Log ("mutex unavailable: " + $_.Exception.Message)
  $mutex = $null
}

# --- cards ---------------------------------------------------------------

$app = New-Object System.Windows.Application
$app.ShutdownMode = [System.Windows.ShutdownMode]::OnExplicitShutdown

# A stale exception in one handler used to take the whole notifier down; keep
# the dispatcher alive and leave a line in the log instead.
$app.Add_DispatcherUnhandledException({
  try {
    $failure = $args[1]
    Write-Log ("unhandled: " + $failure.Exception.Message)
    $failure.Handled = $true
  } catch {
  }
})

# Oldest first. Closed cards remove themselves, so this list never holds a
# dead window.
$script:cards = New-Object System.Collections.ArrayList
# Session id -> its card, so a new event replaces that Session's card.
$script:bySession = @{}
# Card window -> the moment it fades away; empty for persistent cards.
$script:deadlines = @{}
$script:lastActivity = [DateTime]::UtcNow
# Card windows turned away while a full-screen app owns the screen.
$script:deferred = New-Object System.Collections.ArrayList

function Update-Positions {
  try {
    $work = [System.Windows.SystemParameters]::WorkArea
    $left = $work.Right - $Width - $Margin
    $top = $work.Bottom - $Margin - $CardHeight
    for ($index = $script:cards.Count - 1; $index -ge 0; $index--) {
      $card = $script:cards[$index]
      if ($null -eq $card) { continue }
      $card.Left = $left
      $card.Top = $top
      $top = $top - $CardHeight - $Gap
    }
  } catch {
    Write-Log ("position failed: " + $_.Exception.Message)
  }
}

function Show-Card {
  param($Item)

  $sessionId = [string]$Item.sessionId
  $kind = [string]$Item.kind
  $isWait = $kind -eq 'wait'
  $accentHex = if ($isWait) { '#D29922' } else { '#3FB950' }

  # One card per Session: replace the previous one instead of stacking.
  if ($sessionId -ne '' -and $script:bySession.ContainsKey($sessionId)) {
    $previous = $script:bySession[$sessionId]
    try {
      if ($null -ne $previous) { $previous.Close() }
    } catch {
    }
    $script:bySession.Remove($sessionId)
  }

  $window = New-Object System.Windows.Window
  $window.WindowStyle = 'None'
  $window.AllowsTransparency = $true
  $window.Background = [System.Windows.Media.Brushes]::Transparent
  $window.Topmost = $true
  $window.ShowInTaskbar = $false
  $window.ShowActivated = $false
  $window.ResizeMode = 'NoResize'
  $window.Width = $Width
  $window.Height = $CardHeight
  $window.WindowStartupLocation = 'Manual'
  $window.Title = 'DSH Notify'

  $border = New-Object System.Windows.Controls.Border
  $border.CornerRadius = [System.Windows.CornerRadius]::new(12)
  $border.Background = (New-Object System.Windows.Media.BrushConverter).ConvertFromString('#F21E222A')
  $border.BorderThickness = [System.Windows.Thickness]::new(1)
  $border.BorderBrush = (New-Object System.Windows.Media.BrushConverter).ConvertFromString('#33FFFFFF')
  $border.Padding = [System.Windows.Thickness]::new(12, 10, 8, 10)
  $border.Cursor = [System.Windows.Input.Cursors]::Hand

  $shadow = New-Object System.Windows.Media.Effects.DropShadowEffect
  $shadow.BlurRadius = 24
  $shadow.ShadowDepth = 5
  $shadow.Opacity = 0.55
  $shadow.Color = [System.Windows.Media.Colors]::Black
  $border.Effect = $shadow

  $grid = New-Object System.Windows.Controls.Grid
  foreach ($columnWidth in @(3, 26, 0, 22)) {
    $column = New-Object System.Windows.Controls.ColumnDefinition
    if ($columnWidth -eq 0) { $column.Width = [System.Windows.GridLength]::new(1, [System.Windows.GridUnitType]::Star) }
    else { $column.Width = [System.Windows.GridLength]::new($columnWidth) }
    [void]$grid.ColumnDefinitions.Add($column)
  }

  $accent = New-Object System.Windows.Shapes.Rectangle
  $accent.Width = 3
  $accent.RadiusX = 1.5
  $accent.RadiusY = 1.5
  $accent.Fill = (New-Object System.Windows.Media.BrushConverter).ConvertFromString($accentHex)
  $accent.VerticalAlignment = 'Stretch'
  [void][System.Windows.Controls.Grid]::SetColumn($accent, 0)

  $iconGrid = New-Object System.Windows.Controls.Grid
  $iconGrid.Width = 20
  $iconGrid.Height = 20
  $iconGrid.VerticalAlignment = 'Top'
  $iconGrid.Margin = [System.Windows.Thickness]::new(8, 2, 0, 0)

  $ellipse = New-Object System.Windows.Shapes.Ellipse
  $ellipse.Width = 18
  $ellipse.Height = 18
  $ellipse.HorizontalAlignment = 'Center'
  $ellipse.VerticalAlignment = 'Center'
  $ellipse.Fill = (New-Object System.Windows.Media.BrushConverter).ConvertFromString($accentHex)

  $glyph = New-Object System.Windows.Controls.TextBlock
  if ($isWait) { $glyph.Text = '!' } else { $glyph.Text = '✓' }
  $glyph.FontSize = 11
  $glyph.FontWeight = [System.Windows.FontWeights]::Bold
  $glyph.Foreground = [System.Windows.Media.Brushes]::White
  $glyph.HorizontalAlignment = 'Center'
  $glyph.VerticalAlignment = 'Center'
  [void]$iconGrid.Children.Add($ellipse)
  [void]$iconGrid.Children.Add($glyph)

  $textPanel = New-Object System.Windows.Controls.StackPanel
  $textPanel.Margin = [System.Windows.Thickness]::new(8, 0, 6, 0)
  $textPanel.VerticalAlignment = 'Center'

  $title = New-Object System.Windows.Controls.TextBlock
  $title.Text = [string]$Item.title
  $title.FontSize = 13
  $title.FontWeight = [System.Windows.FontWeights]::SemiBold
  $title.Foreground = (New-Object System.Windows.Media.BrushConverter).ConvertFromString('#F5F7FA')
  $title.TextTrimming = 'CharacterEllipsis'

  $body = New-Object System.Windows.Controls.TextBlock
  $body.Text = [string]$Item.body
  $body.FontSize = 12
  $body.Foreground = (New-Object System.Windows.Media.BrushConverter).ConvertFromString('#A9B2C0')
  $body.Margin = [System.Windows.Thickness]::new(0, 3, 0, 0)
  $body.TextWrapping = 'Wrap'
  $body.MaxHeight = 32
  $body.TextTrimming = 'CharacterEllipsis'

  [void]$textPanel.Children.Add($title)
  [void]$textPanel.Children.Add($body)

  $close = New-Object System.Windows.Controls.Button
  $close.Content = '×'
  $close.Width = 20
  $close.Height = 20
  $close.Padding = [System.Windows.Thickness]::new(0)
  $close.BorderThickness = [System.Windows.Thickness]::new(0)
  $close.Background = [System.Windows.Media.Brushes]::Transparent
  $close.Foreground = (New-Object System.Windows.Media.BrushConverter).ConvertFromString('#8B93A1')
  $close.FontSize = 14
  $close.Cursor = [System.Windows.Input.Cursors]::Hand
  $close.HorizontalAlignment = 'Right'
  $close.VerticalAlignment = 'Top'
  $close.ToolTip = '关闭'

  [void][System.Windows.Controls.Grid]::SetColumn($iconGrid, 1)
  [void][System.Windows.Controls.Grid]::SetColumn($textPanel, 2)
  [void][System.Windows.Controls.Grid]::SetColumn($close, 3)
  [void]$grid.Children.Add($accent)
  [void]$grid.Children.Add($iconGrid)
  [void]$grid.Children.Add($textPanel)
  [void]$grid.Children.Add($close)

  $border.Child = $grid
  $window.Content = $border
  # Event handlers carry the window and the Session id on Tag: a closure over
  # `$window`/`$Item` is already null when a handler runs, and calling a method
  # on it terminates the whole notifier (ErrorActionPreference = Stop).
  $window.Tag = $sessionId
  $border.Tag = $window
  $close.Tag = $window

  $transform = New-Object System.Windows.Media.TranslateTransform
  $transform.Y = 12
  $border.RenderTransform = $transform

  $border.Add_MouseEnter({
    try { $this.Background = (New-Object System.Windows.Media.BrushConverter).ConvertFromString('#FF262B34') } catch { }
  })
  $border.Add_MouseLeave({
    try { $this.Background = (New-Object System.Windows.Media.BrushConverter).ConvertFromString('#F21E222A') } catch { }
  })

  $close.Add_Click({
    try {
      $card = $this.Tag
      if ($card -is [System.Windows.Window]) { $card.Close() }
    } catch {
      Write-Log ("close failed: " + $_.Exception.Message)
    }
  })
  $border.Add_MouseLeftButtonUp({
    try {
      $card = $this.Tag
      if (-not ($card -is [System.Windows.Window])) { return }
      $card.Hide()
      Save-Click -SessionId ([string]$card.Tag)
      [void](Focus-Harness)
      $card.Close()
    } catch {
      Write-Log ("click failed: " + $_.Exception.Message)
    }
  })

  $window.Add_Closed({
    try {
      $closed = $this
      $script:lastActivity = [DateTime]::UtcNow
      $script:deadlines.Remove($closed)
      foreach ($key in @($script:bySession.Keys)) {
        if ($script:bySession[$key] -eq $closed) { $script:bySession.Remove($key) }
      }
      [void]$script:cards.Remove($closed)
      Update-Positions
    } catch {
      Write-Log ("closed handler failed: " + $_.Exception.Message)
    }
  })

  Write-Log ("show card: " + [string]$Item.title)
  $window.Show()
  [void]$script:cards.Add($window)
  if ($sessionId -ne '') { $script:bySession[$sessionId] = $window }
  if (-not $isWait -and $DoneSeconds -gt 0) {
    $script:deadlines[$window] = [DateTime]::UtcNow.AddSeconds($DoneSeconds)
  }
  Update-Positions

  $fade = New-Object System.Windows.Media.Animation.DoubleAnimation
  $fade.From = 0.0
  $fade.To = 1.0
  $fade.Duration = [System.Windows.Duration]::new([TimeSpan]::FromMilliseconds(180))
  [void]$window.BeginAnimation([System.Windows.UIElement]::OpacityProperty, $fade)

  $slide = New-Object System.Windows.Media.Animation.DoubleAnimation
  $slide.From = 12.0
  $slide.To = 0.0
  $slide.Duration = [System.Windows.Duration]::new([TimeSpan]::FromMilliseconds(200))
  [void]$transform.BeginAnimation([System.Windows.Media.TranslateTransform]::YProperty, $slide)
}

function Read-Queue {
  if (-not (Test-Path -LiteralPath $QueueDir)) { return }
  $files = Get-ChildItem -LiteralPath $QueueDir -Filter '*.json' -File -ErrorAction SilentlyContinue | Sort-Object Name
  foreach ($file in $files) {
    $item = $null
    try {
      $raw = Get-Content -LiteralPath $file.FullName -Raw -Encoding UTF8
      $item = $raw | ConvertFrom-Json
    } catch {
      $item = $null
    }
    Remove-Item -LiteralPath $file.FullName -Force -ErrorAction SilentlyContinue
    if ($null -eq $item) { continue }
    $script:lastActivity = [DateTime]::UtcNow
    try {
      if ($script:cards.Count -ge $MaxCards) {
        $oldest = $script:cards[0]
        if ($null -ne $oldest) { $oldest.Close() }
      }
      Show-Card -Item $item
      if ($null -ne $donePlayer) {
        if ($item.kind -eq 'wait') {
          if ($null -ne $waitPlayer) { $waitPlayer.Play() }
        } else {
          $donePlayer.Play()
        }
      }
    } catch {
      Write-Log ("card failed: " + $_.Exception.Message)
    }
  }
}

$poll = New-Object System.Windows.Threading.DispatcherTimer
$poll.Interval = [TimeSpan]::FromMilliseconds(200)
$poll.Add_Tick({
  try {
    Read-Queue
  } catch {
    Write-Log ("poll failed: " + $_.Exception.Message)
  }
})
$poll.Start()

# Completion cards leave on their own; waiting cards stay until dismissed.
$sweep = New-Object System.Windows.Threading.DispatcherTimer
$sweep.Interval = [TimeSpan]::FromMilliseconds(500)
$sweep.Add_Tick({
  try {
    if ($script:deadlines.Count -eq 0) { return }
    $now = [DateTime]::UtcNow
    foreach ($card in @($script:deadlines.Keys)) {
      if ($script:deadlines[$card] -gt $now) { continue }
      $script:deadlines.Remove($card)
      try { $card.Close() } catch { }
    }
  } catch {
    Write-Log ("sweep failed: " + $_.Exception.Message)
  }
})
$sweep.Start()

$idle = New-Object System.Windows.Threading.DispatcherTimer
$idle.Interval = [TimeSpan]::FromSeconds(60)
$idle.Add_Tick({
  try {
    if ($script:cards.Count -eq 0 -and ([DateTime]::UtcNow - $script:lastActivity).TotalMinutes -ge $IdleMinutes) {
      $app.Shutdown()
    }
  } catch {
  }
})
$idle.Start()

$app.Run()
