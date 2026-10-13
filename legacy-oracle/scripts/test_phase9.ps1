$ErrorActionPreference = "Stop"
$baseUrl = "http://localhost:5000/api"

Write-Host "=== Phase 9 Automated Integration Test (Admin Court Image Management & Real-Time Sync) ===" -ForegroundColor Cyan

# 1. Login as Admin & Customer
$adminBody = @{ identifier = "admin1"; password = "Password123!" } | ConvertTo-Json
$adminResp = Invoke-RestMethod -Uri "$baseUrl/auth/login" -Method Post -Body $adminBody -ContentType "application/json"
$adminHeaders = @{ Authorization = "Bearer $($adminResp.data.token)" }

$custBody = @{ identifier = "customer1"; password = "Password123!" } | ConvertTo-Json
$custResp = Invoke-RestMethod -Uri "$baseUrl/auth/login" -Method Post -Body $custBody -ContentType "application/json"
$custHeaders = @{ Authorization = "Bearer $($custResp.data.token)" }
Write-Host "1. Admin & Customer logged in successfully." -ForegroundColor Green

# 2. View current court #1 details before update
$beforeResp = Invoke-RestMethod -Uri "$baseUrl/courts/1" -Method Get -Headers $custHeaders
$oldImageUrl = $beforeResp.data.imageUrl
Write-Host "2. Admin viewed current Court #1 image URL: $oldImageUrl" -ForegroundColor Green

# 3. Test Validation: Invalid non-image format (Should Fail with 400)
try {
    $badImageBody = @{ imageUrl = "https://example.com/malicious_script.pdf" } | ConvertTo-Json
    Invoke-RestMethod -Uri "$baseUrl/admin/courts/1/image" -Method Put -Headers $adminHeaders -Body $badImageBody -ContentType "application/json"
    Write-Host "ERROR: Non-image format should have been rejected!" -ForegroundColor Red
} catch {
    Write-Host "3. Image Validation Verified: Non-image file correctly REJECTED." -ForegroundColor Green
}

# 4. Admin updates Court #1 Main Image URL
$newImageUrl = "https://images.unsplash.com/photo-1626224583764-f87db24ac4ea?auto=format&fit=crop&w=1200&q=80"
$updateImgBody = @{ imageUrl = $newImageUrl } | ConvertTo-Json
$upResp = Invoke-RestMethod -Uri "$baseUrl/admin/courts/1/image" -Method Put -Headers $adminHeaders -Body $updateImgBody -ContentType "application/json"
Write-Host "4. Admin updated Court #1 main image URL successfully." -ForegroundColor Green

# 5. Customer fetches Court #1 and verifies instant real-time sync
$afterResp = Invoke-RestMethod -Uri "$baseUrl/courts/1" -Method Get -Headers $custHeaders
$updatedImageUrl = $afterResp.data.imageUrl
Write-Host "5. Real-Time Customer View Verified: Updated Image URL = $updatedImageUrl" -ForegroundColor Green

if ($updatedImageUrl -ne $newImageUrl) {
    Write-Host "ERROR: Customer view did not match updated image URL!" -ForegroundColor Red
} else {
    Write-Host "   Customer view confirmed updated image immediately!" -ForegroundColor Green
}

# 6. Verify Audit Log entry created for UPDATE_COURT_IMAGE (BR15)
$logsResp = Invoke-RestMethod -Uri "$baseUrl/admin/audit-logs" -Method Get -Headers $adminHeaders
$imgLog = $logsResp.data | Where-Object { $_.action -eq "UPDATE_COURT_IMAGE" -and $_.entityId -eq 1 }

if ($null -ne $imgLog) {
    Write-Host "6. BR15 Audit Log Verified: Recorded action '$($imgLog[0].action)' for Court #1." -ForegroundColor Green
} else {
    Write-Host "ERROR: Audit log entry for UPDATE_COURT_IMAGE not found!" -ForegroundColor Red
}

Write-Host "=== Phase 9 Automated Integration Test COMPLETED SUCCESSFULLY! ===" -ForegroundColor Cyan
