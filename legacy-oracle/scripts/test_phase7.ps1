$ErrorActionPreference = "Stop"
$baseUrl = "http://localhost:5000/api"

Write-Host "=== Phase 7 Automated Integration Test ===" -ForegroundColor Cyan

# 1. Login as Customer
$custBody = @{ identifier = "customer1"; password = "Password123!" } | ConvertTo-Json
$custResp = Invoke-RestMethod -Uri "$baseUrl/auth/login" -Method Post -Body $custBody -ContentType "application/json"
$custToken = $custResp.data.token
$custHeaders = @{ Authorization = "Bearer $custToken" }
Write-Host "1. Customer logged in successfully. Token acquired." -ForegroundColor Green

# 2. Login as Staff
$staffBody = @{ identifier = "staff1"; password = "Password123!" } | ConvertTo-Json
$staffResp = Invoke-RestMethod -Uri "$baseUrl/auth/login" -Method Post -Body $staffBody -ContentType "application/json"
$staffToken = $staffResp.data.token
$staffHeaders = @{ Authorization = "Bearer $staffToken" }
Write-Host "2. Staff logged in successfully. Token acquired." -ForegroundColor Green

# 3. Create a Booking 4 days in the future (>= 24 hours away)
$randomDay = Get-Random -Minimum 4 -Maximum 10
$futureDate = (Get-Date).AddDays($randomDay).ToString("yyyy-MM-dd")
$bookingBody = @{
    courtId = 2
    bookingDate = $futureDate
    startTime = "10:00"
    endTime = "12:00"
    equipmentItems = @(
        @{ equipmentId = 1; quantity = 2 }
    )
} | ConvertTo-Json -Depth 5

$bResp = Invoke-RestMethod -Uri "$baseUrl/bookings" -Method Post -Headers $custHeaders -Body $bookingBody -ContentType "application/json"
$bookingId = $bResp.data.bookingId
Write-Host "3. Created future booking ID: $bookingId for date: $futureDate (BR9 >= 24h eligible)" -ForegroundColor Green

# 4. Test BR9 Update Booking >= 24h (Should Succeed)
$updateBody = @{
    bookingDate = $futureDate
    startTime = "11:00"
    endTime = "13:00"
} | ConvertTo-Json

$upResp = Invoke-RestMethod -Uri "$baseUrl/bookings/$bookingId" -Method Put -Headers $custHeaders -Body $updateBody -ContentType "application/json"
Write-Host "4. BR9 Update >= 24h succeeded: $($upResp.message)" -ForegroundColor Green

# 5. Create a Booking Today (< 24 hours away) and attempt BR9 update (Should fail)
$todayDate = (Get-Date).ToString("yyyy-MM-dd")
$randomStartHour = Get-Random -Minimum 7 -Maximum 15
$startTimeStr = "{0:D2}:00" -f $randomStartHour
$endTimeStr = "{0:D2}:00" -f ($randomStartHour + 1)
$todayBookingBody = @{
    courtId = 3
    bookingDate = $todayDate
    startTime = $startTimeStr
    endTime = $endTimeStr
} | ConvertTo-Json

$todayBResp = Invoke-RestMethod -Uri "$baseUrl/bookings" -Method Post -Headers $custHeaders -Body $todayBookingBody -ContentType "application/json"
$todayBookingId = $todayBResp.data.bookingId

try {
    $failUpdate = @{ startTime = $startTimeStr; endTime = "{0:D2}:30" -f ($randomStartHour + 1) } | ConvertTo-Json
    Invoke-RestMethod -Uri "$baseUrl/bookings/$todayBookingId" -Method Put -Headers $custHeaders -Body $failUpdate -ContentType "application/json"
    Write-Host "ERROR: BR9 update < 24h should have failed!" -ForegroundColor Red
} catch {
    Write-Host "5. BR9 Update < 24h correctly REJECTED with message: $($_.Exception.Message)" -ForegroundColor Green
}

# 6. Test BR6 Refund Preview on Future Booking (>= 24h -> 80% refund)
$prevResp = Invoke-RestMethod -Uri "$baseUrl/bookings/$bookingId/cancel-preview" -Method Get -Headers $custHeaders
$preview = $prevResp.data
Write-Host "6. BR6 Preview: Total Price = ฿$($preview.totalPrice), Refund % = $($preview.refundPercentage)%, Refund Amount = ฿$($preview.refundAmount)" -ForegroundColor Green
if ($preview.refundPercentage -ne 80) {
    Write-Host "ERROR: Expected 80% refund percentage!" -ForegroundColor Red
}

# 7. Execute Cancel & Refund Request
$cancelBody = @{ reason = "User requested cancellation for schedule conflict" } | ConvertTo-Json
$cancelResp = Invoke-RestMethod -Uri "$baseUrl/bookings/$bookingId/cancel-refund" -Method Post -Headers $custHeaders -Body $cancelBody -ContentType "application/json"
Write-Host "7. Cancellation & refund request executed: $($cancelResp.message)" -ForegroundColor Green

# 8. Staff Views Pending Refunds & Approves
$pendingResp = Invoke-RestMethod -Uri "$baseUrl/staff/refunds/pending" -Method Get -Headers $staffHeaders
$refundList = $pendingResp.data
$myRefund = $refundList | Where-Object { $_.bookingId -eq $bookingId }

if ($null -ne $myRefund) {
    $rId = if ($myRefund.refundId) { $myRefund.refundId } else { $myRefund.id }
    $rAmt = if ($myRefund.requestedAmount) { $myRefund.requestedAmount } else { $myRefund.amount }
    Write-Host "8. Found pending refund ID: $rId for amount: ฿$rAmt. Approving..." -ForegroundColor Green
    $appResp = Invoke-RestMethod -Uri "$baseUrl/staff/refunds/$rId/approve" -Method Post -Headers $staffHeaders
    Write-Host "   Approval result: $($appResp.message)" -ForegroundColor Green
} else {
    Write-Host "ERROR: Pending refund request not found in staff list!" -ForegroundColor Red
}

Write-Host "=== Phase 7 Automated Integration Test COMPLETED SUCCESSFULLY! ===" -ForegroundColor Cyan
