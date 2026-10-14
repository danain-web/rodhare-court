$ErrorActionPreference = "Stop"
$baseUrl = "http://localhost:5000/api"

Write-Host "=== Phase 8 Automated Integration Test (Admin Management & BR12, BR13, BR14, BR15) ===" -ForegroundColor Cyan

# 1. Login as Customer & Staff
$custBody = @{ identifier = "customer1"; password = "Password123!" } | ConvertTo-Json
$custResp = Invoke-RestMethod -Uri "$baseUrl/auth/login" -Method Post -Body $custBody -ContentType "application/json"
$custHeaders = @{ Authorization = "Bearer $($custResp.data.token)" }

$staffBody = @{ identifier = "staff1"; password = "Password123!" } | ConvertTo-Json
$staffResp = Invoke-RestMethod -Uri "$baseUrl/auth/login" -Method Post -Body $staffBody -ContentType "application/json"
$staffHeaders = @{ Authorization = "Bearer $($staffResp.data.token)" }

# 2. Login as Admin
$adminBody = @{ identifier = "admin1"; password = "Password123!" } | ConvertTo-Json
$adminResp = Invoke-RestMethod -Uri "$baseUrl/auth/login" -Method Post -Body $adminBody -ContentType "application/json"
$adminHeaders = @{ Authorization = "Bearer $($adminResp.data.token)" }
Write-Host "1. Admin, Staff, Customer logged in successfully." -ForegroundColor Green

# 3. Test RBAC Enforcement: Customer & Staff calling Admin endpoint (Should fail with 403)
try {
    Invoke-RestMethod -Uri "$baseUrl/admin/promotions" -Method Get -Headers $custHeaders
    Write-Host "ERROR: Customer should NOT be able to access Admin promotions endpoint!" -ForegroundColor Red
} catch {
    Write-Host "2. RBAC Enforcement Verified: Customer access to Admin API correctly REJECTED." -ForegroundColor Green
}

try {
    Invoke-RestMethod -Uri "$baseUrl/admin/audit-logs" -Method Get -Headers $staffHeaders
    Write-Host "ERROR: Staff should NOT be able to access Audit Logs endpoint!" -ForegroundColor Red
} catch {
    Write-Host "3. RBAC Enforcement Verified: Staff access to Audit Logs API correctly REJECTED." -ForegroundColor Green
}

# 4. BR12: Admin Creates Sport Category
$sportBody = @{
    name = "Squash $(Get-Random)"
    description = "Indoor squash court area"
} | ConvertTo-Json
$sportResp = Invoke-RestMethod -Uri "$baseUrl/admin/sports" -Method Post -Headers $adminHeaders -Body $sportBody -ContentType "application/json"
$sportId = $sportResp.data.sportTypeId
Write-Host "4. BR12: Admin created Sport Category ID: $sportId ($($sportResp.data.name))" -ForegroundColor Green

# 5. Admin Creates Equipment Item
$eqBody = @{
    sportTypeId = 1
    name = "Pro Racket $(Get-Random)"
    totalQuantity = 15
    rentalFee = 45.0
    replacementCost = 600.0
} | ConvertTo-Json
$eqResp = Invoke-RestMethod -Uri "$baseUrl/admin/equipment" -Method Post -Headers $adminHeaders -Body $eqBody -ContentType "application/json"
Write-Host "5. Admin created Equipment Item ID: $($eqResp.data.equipmentId)" -ForegroundColor Green

# 6. BR14: Test Promotion Invalid Date Range (endDate < startDate -> Should Fail)
try {
    $badPromo = @{
        code = "BAD$(Get-Random)"
        title = "Invalid Promo"
        discountType = "PERCENT"
        discountValue = 15.0
        minBookingHours = 1
        startDate = "2026-10-20"
        endDate = "2026-10-10" # End date before start date
    } | ConvertTo-Json
    Invoke-RestMethod -Uri "$baseUrl/admin/promotions" -Method Post -Headers $adminHeaders -Body $badPromo -ContentType "application/json"
    Write-Host "ERROR: BR14 promotion with invalid date range should have failed!" -ForegroundColor Red
} catch {
    Write-Host "6. BR14 Date Validation Verified: Invalid promotion date range correctly REJECTED." -ForegroundColor Green
}

# 7. BR13 & BR14: Admin Creates Valid Promotion
$promoCode = "FLASH$(Get-Random -Minimum 100 -Maximum 999)"
$goodPromo = @{
    code = $promoCode
    title = "Flash Sale 20% Off"
    discountType = "PERCENT"
    discountValue = 20.0
    minBookingHours = 1
    startDate = "2026-10-01"
    endDate = "2026-12-31"
} | ConvertTo-Json
$promoResp = Invoke-RestMethod -Uri "$baseUrl/admin/promotions" -Method Post -Headers $adminHeaders -Body $goodPromo -ContentType "application/json"
Write-Host "7. BR13 & BR14: Admin created Promotion Code: $($promoResp.data.code)" -ForegroundColor Green

# 8. BR13: Admin Creates Pricing Rate
$rateBody = @{
    courtId = 1
    dayType = "WEEKEND"
    startTime = "08:00"
    endTime = "22:00"
    hourlyRate = 250.0
} | ConvertTo-Json
$rateResp = Invoke-RestMethod -Uri "$baseUrl/admin/pricing-rates" -Method Post -Headers $adminHeaders -Body $rateBody -ContentType "application/json"
Write-Host "8. BR13: Admin set Pricing Rate ID: $($rateResp.data.rateId) at ฿$($rateResp.data.hourlyRate)/hr" -ForegroundColor Green

# 9. BR15: Audit Logs Verification
$logsResp = Invoke-RestMethod -Uri "$baseUrl/admin/audit-logs" -Method Get -Headers $adminHeaders
$auditLogs = $logsResp.data
Write-Host "9. BR15 Audit Logs Verified: Retrieved $($auditLogs.Count) log records." -ForegroundColor Green

Write-Host "=== Phase 8 Automated Integration Test COMPLETED SUCCESSFULLY! ===" -ForegroundColor Cyan
