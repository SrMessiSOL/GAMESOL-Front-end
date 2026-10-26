param([string]$Directory = 'docs/test-runs/original-hull-visuals-2026-10-26')
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
$directoryPath = (Resolve-Path -LiteralPath $Directory).Path
$rows = Get-Content -LiteralPath (Join-Path $directoryPath 'layout.json') -Raw | ConvertFrom-Json
$results = @()
foreach ($mode in @('desktop', 'mobile', 'mobile-compact')) {
  $sheet = [System.Drawing.Bitmap]::new(1000, 800)
  $graphics = [System.Drawing.Graphics]::FromImage($sheet)
  $graphics.Clear([System.Drawing.Color]::FromArgb(8, 14, 19))
  $font = [System.Drawing.Font]::new('Arial', 12)
  $index = 0
  $layoutMode = if ($mode -eq 'mobile-compact') { 'mobile' } else { $mode }
  foreach ($row in @($rows | Where-Object mode -eq $layoutMode)) {
    $file = Join-Path $directoryPath ($mode + '-' + $row.ship + '.png')
    $bitmap = [System.Drawing.Bitmap]::new($file)
    try {
      $rect = $row.canvas[0].rect
      $source = [System.Drawing.Rectangle]::new([int]$rect.x, [int]$rect.y, [int][math]::Floor($rect.width), [int][math]::Floor($rect.height))
      $x = ($index % 4) * 250
      $y = [math]::Floor($index / 4) * 200
      $graphics.DrawImage($bitmap, [System.Drawing.Rectangle]::new($x, $y, 250, 175), $source, [System.Drawing.GraphicsUnit]::Pixel)
      $graphics.DrawString($row.ship, $font, [System.Drawing.Brushes]::White, [single]($x + 8), [single]($y + 178))
      $hits = 0; $minX = $source.Width; $minY = $source.Height; $maxX = 0; $maxY = 0
      for ($py = 0; $py -lt $source.Height; $py += 2) {
        for ($px = 0; $px -lt $source.Width; $px += 2) {
          $color = $bitmap.GetPixel($source.X + $px, $source.Y + $py)
          $maximum = [math]::Max($color.R, [math]::Max($color.G, $color.B))
          $minimum = [math]::Min($color.R, [math]::Min($color.G, $color.B))
          if ($minimum -gt 40 -and $maximum -gt 55 -and ($maximum - $minimum) -lt 45) {
            $hits++; $minX = [math]::Min($minX, $px); $maxX = [math]::Max($maxX, $px)
            $minY = [math]::Min($minY, $py); $maxY = [math]::Max($maxY, $py)
          }
        }
      }
      $nonblank = $hits -gt 30
      $framed = $minX -gt 2 -and $minY -gt 2 -and $maxX -lt ($source.Width - 3) -and $maxY -lt ($source.Height - 3)
      $results += [pscustomobject]@{mode=$mode;ship=$row.ship;sampledHullPixels=$hits;nonblank=$nonblank;framed=$framed;bounds=@($minX,$minY,$maxX,$maxY);viewportWidth=$row.width;overflow=$row.overflow;referenceLoaded=$row.reference}
      $index++
    } finally { $bitmap.Dispose() }
  }
  $sheet.Save((Join-Path $directoryPath ($mode + '-contact.png')), [System.Drawing.Imaging.ImageFormat]::Png)
  $font.Dispose(); $graphics.Dispose(); $sheet.Dispose()
}
$results | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath (Join-Path $directoryPath 'pixel-audit.json')
$results | Format-Table mode,ship,sampledHullPixels,nonblank,framed
if (@($results | Where-Object { -not $_.nonblank -or -not $_.framed -or $_.overflow -or -not $_.referenceLoaded }).Count) { throw 'One or more rendered screenshot checks failed.' }
$first = [System.Drawing.Bitmap]::new((Join-Path $directoryPath 'mobile-motion-a.png'))
$second = [System.Drawing.Bitmap]::new((Join-Path $directoryPath 'mobile-motion-b.png'))
try {
  $rect = @($rows | Where-Object { $_.mode -eq 'mobile' -and $_.ship -eq 'colonyShip' })[0].canvas[0].rect
  $changed = 0
  for ($y = [int]$rect.y; $y -lt [int]($rect.y + $rect.height); $y += 2) {
    for ($x = [int]$rect.x; $x -lt [int]($rect.x + $rect.width); $x += 2) {
      $a = $first.GetPixel($x,$y); $b = $second.GetPixel($x,$y)
      if (([math]::Abs([int]$a.R - $b.R) + [math]::Abs([int]$a.G - $b.G) + [math]::Abs([int]$a.B - $b.B)) -gt 30) { $changed++ }
    }
  }
  @{sampledChangedPixels=$changed;passed=($changed -gt 20);scope='Rendered mobile canvas screenshot region; not direct GPU readback'} | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $directoryPath 'motion-audit.json')
  if ($changed -le 20) { throw 'The two rotating model captures did not show sufficient movement.' }
  Write-Output "Moving-model changed pixel samples: $changed"
} finally { $first.Dispose(); $second.Dispose() }
