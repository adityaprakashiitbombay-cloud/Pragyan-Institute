Add-Type -AssemblyName System.Drawing

function Optimize-Jpg($file, $quality) {
    if (-not (Test-Path $file)) { return }
    $img = [System.Drawing.Image]::FromFile($file)
    $encoder = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() | Where-Object { $_.FormatDescription -eq 'JPEG' }
    $encoderParams = New-Object System.Drawing.Imaging.EncoderParameters(1)
    $encoderParams.Param[0] = New-Object System.Drawing.Imaging.EncoderParameter([System.Drawing.Imaging.Encoder]::Quality, [long]$quality)
    $tempPath = $file + '.tmp'
    $img.Save($tempPath, $encoder, $encoderParams)
    $img.Dispose()
    
    $origSize = (Get-Item $file).Length
    $newSize = (Get-Item $tempPath).Length
    Write-Host "Optimized $file : $([math]::Round($origSize/1KB, 1)) KB -> $([math]::Round($newSize/1KB, 1)) KB"
    Remove-Item $file
    Move-Item $tempPath $file
}

# 1. teacher_ravi.png (3.16 MB)
Optimize-Jpg "assets/images/teacher_ravi.png" 85

# 2. 1b331f47-c412-4edd-a848-12b7b7a41b7e.jpg (3.16 MB)
Optimize-Jpg "assets/images/1b331f47-c412-4edd-a848-12b7b7a41b7e.jpg" 85

# 3. Optimize gallery images over 150 KB
Get-ChildItem "assets/images/gallery_*.jpeg" | ForEach-Object {
    Optimize-Jpg $_.FullName 82
}

# 4. Optimize hero slides
Get-ChildItem "assets/images/hero_slide_*.jpg" | ForEach-Object {
    Optimize-Jpg $_.FullName 85
}
