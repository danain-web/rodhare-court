# สร้างสลิปตัวอย่าง (DEMO) สำหรับทดสอบระบบตรวจสลิปอัตโนมัติ
# ตัวอย่าง:
#   .\make_slip.ps1 -Amount 210                    -> เลขอ้างอิงสุ่มใหม่ (ไม่ซ้ำ)
#   .\make_slip.ps1 -Amount 210 -Ref DEMO0001      -> กำหนดเลขอ้างอิงเอง
#   .\make_slip.ps1 -Amount 210 -Unclear           -> ภาพเล็ก/ไม่ชัด (ระบบจะส่งให้พนักงานตรวจ)
param(
  [Parameter(Mandatory = $true)][decimal]$Amount,
  [string]$Ref = ("DEMO" + (Get-Date -Format "yyMMddHHmmss")),
  [switch]$Unclear
)

$dir = $PSScriptRoot
$edgePaths = @(
  "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
  "C:\Program Files\Microsoft\Edge\Application\msedge.exe",
  "C:\Program Files\Google\Chrome\Application\chrome.exe"
)
$browser = $edgePaths | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $browser) { Write-Error "ไม่พบ Microsoft Edge หรือ Google Chrome"; exit 1 }

$thaiMonths = @('ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.')
$now = Get-Date
$when = "{0} {1} {2} &nbsp; {3} น." -f $now.Day, $thaiMonths[$now.Month - 1], ($now.Year + 543), $now.ToString("HH:mm")

$html = [IO.File]::ReadAllText((Join-Path $dir "slip_template.html"), [Text.Encoding]::UTF8)
$html = $html.Replace("{{AMOUNT}}", $Amount.ToString("N2")).Replace("{{REF}}", $Ref).Replace("{{WHEN}}", $when)
$tmpHtml = Join-Path $env:TEMP "barbie_slip_render.html"
[IO.File]::WriteAllText($tmpHtml, $html, (New-Object Text.UTF8Encoding($false)))

$suffix = if ($Unclear) { "_unclear" } else { "" }
$out = Join-Path $dir ("slip_{0}_{1}{2}.png" -f $Amount.ToString("0"), $Ref, $suffix)
$scale = if ($Unclear) { "0.3" } else { "1" }
$profile = Join-Path $env:TEMP "barbie-slip-browser"

& $browser --headless=new --disable-gpu --hide-scrollbars --user-data-dir="$profile" --window-size=540,960 `
  --force-device-scale-factor=$scale --screenshot="$out" ("file:///" + $tmpHtml.Replace('\', '/')) 2>$null | Out-Null
Start-Sleep -Milliseconds 800
Remove-Item $tmpHtml -ErrorAction SilentlyContinue

if (Test-Path $out) {
  Write-Host "สร้างสลิปแล้ว: $out"
  Write-Host ("ตอนอัปโหลด กรอก  ยอดเงิน = {0}   เลขอ้างอิง = {1}" -f $Amount.ToString("N2"), $Ref)
} else {
  Write-Error "สร้างสลิปไม่สำเร็จ"
}
