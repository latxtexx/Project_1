# AntiGrav Static File Server
# Usage:  powershell -ExecutionPolicy Bypass -File server.ps1 [-Port 8080]
# Or:     double-click start-server.bat

param(
    [int]$Port = 8080
)

# ---------------------------------------------------------------------------
# Base directory = wherever this script lives
# ---------------------------------------------------------------------------
$baseDir = $PSScriptRoot
if (-not $baseDir) { $baseDir = (Get-Location).Path }

# ---------------------------------------------------------------------------
# MIME type lookup
# ---------------------------------------------------------------------------
function Get-ContentType([string]$filePath) {
    switch ([IO.Path]::GetExtension($filePath).ToLower()) {
        '.html' { 'text/html; charset=utf-8' }
        '.htm'  { 'text/html; charset=utf-8' }
        '.css'  { 'text/css; charset=utf-8' }
        '.js'   { 'application/javascript; charset=utf-8' }
        '.json' { 'application/json; charset=utf-8' }
        '.png'  { 'image/png' }
        '.jpg'  { 'image/jpeg' }
        '.jpeg' { 'image/jpeg' }
        '.gif'  { 'image/gif' }
        '.svg'  { 'image/svg+xml' }
        '.ico'  { 'image/x-icon' }
        '.woff' { 'font/woff' }
        '.woff2'{ 'font/woff2' }
        '.ttf'  { 'font/ttf' }
        '.mp3'  { 'audio/mpeg' }
        '.wav'  { 'audio/wav' }
        '.webp' { 'image/webp' }
        '.md'   { 'text/markdown; charset=utf-8' }
        default { 'application/octet-stream' }
    }
}

function Send-HttpResponse(
    [System.IO.Stream]$stream,
    [string]$status,
    [string]$contentType,
    [string]$body
) {
    $bodyBytes = [System.Text.Encoding]::UTF8.GetBytes($body)
    $header = "HTTP/1.1 $status`r`nContent-Type: $contentType`r`nContent-Length: $($bodyBytes.Length)`r`nConnection: close`r`n`r`n"
    $headerBytes = [System.Text.Encoding]::ASCII.GetBytes($header)
    $stream.Write($headerBytes, 0, $headerBytes.Length)
    $stream.Write($bodyBytes, 0, $bodyBytes.Length)
}

# ---------------------------------------------------------------------------
# Detect a LAN IP for display
# ---------------------------------------------------------------------------
$lanIP = $null
try {
    $lanIP = (Get-NetIPAddress -AddressFamily IPv4 -InterfaceAlias '*Wi-Fi*' -ErrorAction SilentlyContinue |
              Select-Object -First 1).IPAddress
} catch {}
if (-not $lanIP) {
    try {
        $lanIP = (Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
                  Where-Object { $_.IPAddress -ne '127.0.0.1' -and $_.IPAddress -notlike '169.254.*' } |
                  Select-Object -First 1).IPAddress
    } catch {}
}
if (-not $lanIP) { $lanIP = '(unknown)' }

# ---------------------------------------------------------------------------
# Start TCP Listener
# ---------------------------------------------------------------------------
$listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Any, $Port)
$listener.Start()

Write-Host ''
Write-Host '  ============================================' -ForegroundColor Cyan
Write-Host '    AntiGrav Cyber HUD  -  Static Server' -ForegroundColor Cyan
Write-Host '  ============================================' -ForegroundColor Cyan
Write-Host ''
Write-Host "  PC  :  http://localhost:${Port}/" -ForegroundColor Green
Write-Host "  LAN :  http://${lanIP}:${Port}/" -ForegroundColor Green
Write-Host ''
Write-Host '  Press Ctrl+C to stop.' -ForegroundColor Yellow
Write-Host ''

# ---------------------------------------------------------------------------
# Request loop
# ---------------------------------------------------------------------------
try {
    while ($true) {
        $client = $null
        $stream = $null
        $urlPath = $null
        $responseSent = $false
        try {
            $client = $listener.AcceptTcpClient()
            $stream = $client.GetStream()
            $stream.ReadTimeout = 5000   # 5-second timeout to avoid infinite hangs

            # Read headers without buffering any request-body bytes.
            $headerBytes = [System.Collections.Generic.List[byte]]::new()
            $oneByte = New-Object byte[] 1
            $headersComplete = $false
            while ($headerBytes.Count -lt 16384) {
                if ($stream.Read($oneByte, 0, 1) -eq 0) { break }
                $headerBytes.Add($oneByte[0])
                $count = $headerBytes.Count
                if ($count -ge 4 -and
                    $headerBytes[$count - 4] -eq 13 -and
                    $headerBytes[$count - 3] -eq 10 -and
                    $headerBytes[$count - 2] -eq 13 -and
                    $headerBytes[$count - 1] -eq 10) {
                    $headersComplete = $true
                    break
                }
            }
            if (-not $headersComplete) { throw 'Invalid or oversized HTTP headers.' }

            $headerLines = [System.Text.Encoding]::ASCII.GetString($headerBytes.ToArray()) -split "`r`n"
            $requestLine = $headerLines[0]
            $requestParts = $requestLine -split '\s+'
            if ($requestParts.Length -lt 2) { throw 'Invalid HTTP request line.' }
            $method = $requestParts[0].ToUpperInvariant()
            $rawPath = $requestParts[1]

            $headers = @{}
            for ($i = 1; $i -lt $headerLines.Length; $i++) {
                if ($headerLines[$i] -match '^([^:]+):\s*(.*)$') {
                    $headers[$matches[1].Trim().ToLowerInvariant()] = $matches[2].Trim()
                }
            }

            # Strip query string and decode
            $urlPath = $rawPath.Split('?')[0]
            $urlPath = [Uri]::UnescapeDataString($urlPath)

            # Default document
            if ($urlPath -eq '/') { $urlPath = '/index.html' }

            if ($urlPath -eq '/api/finance') {
                $financeFolderName = -join [char[]](0x0E23, 0x0E32, 0x0E22, 0x0E23, 0x0E31, 0x0E1A, 0x0E23, 0x0E32, 0x0E22, 0x0E08, 0x0E48, 0x0E32, 0x0E22)
                $financeDirectory = Join-Path (Join-Path $baseDir 'Brain') $financeFolderName
                $financeDataPath = Join-Path $financeDirectory 'finance-data.json'

                if ($method -eq 'GET') {
                    if (Test-Path $financeDataPath -PathType Leaf) {
                        $financeJson = [System.IO.File]::ReadAllText($financeDataPath, [System.Text.Encoding]::UTF8)
                    } else {
                        $financeJson = '{"accounts":[],"transactions":[]}'
                    }
                    Send-HttpResponse $stream '200 OK' 'application/json; charset=utf-8' $financeJson
                    $responseSent = $true
                    Write-Host '  200 /api/finance' -ForegroundColor DarkGreen
                    continue
                }

                if ($method -eq 'POST') {
                    $contentLength = 0
                    if (-not $headers.ContainsKey('content-length') -or
                        -not [int]::TryParse($headers['content-length'], [ref]$contentLength) -or
                        $contentLength -le 0) {
                        Send-HttpResponse $stream '400 Bad Request' 'application/json; charset=utf-8' '{"error":"A valid Content-Length is required."}'
                        $responseSent = $true
                        continue
                    }
                    if ($contentLength -gt 1048576) {
                        Send-HttpResponse $stream '413 Payload Too Large' 'application/json; charset=utf-8' '{"error":"Finance data exceeds the 1 MB limit."}'
                        $responseSent = $true
                        continue
                    }

                    $bodyBytes = New-Object byte[] $contentLength
                    $bodyOffset = 0
                    while ($bodyOffset -lt $contentLength) {
                        $bytesRead = $stream.Read($bodyBytes, $bodyOffset, $contentLength - $bodyOffset)
                        if ($bytesRead -eq 0) { throw 'Incomplete finance request body.' }
                        $bodyOffset += $bytesRead
                    }
                    $financeJson = [System.Text.Encoding]::UTF8.GetString($bodyBytes)
                    $financeData = ConvertFrom-Json -InputObject $financeJson -ErrorAction Stop
                    if ($null -eq $financeData.accounts -or $financeData.accounts -isnot [System.Array] -or
                        $null -eq $financeData.transactions -or $financeData.transactions -isnot [System.Array] -or
                        $financeData.accounts.Length -gt 100 -or $financeData.transactions.Length -gt 10000) {
                        Send-HttpResponse $stream '400 Bad Request' 'application/json; charset=utf-8' '{"error":"Invalid finance data structure."}'
                        $responseSent = $true
                        continue
                    }

                    [System.IO.Directory]::CreateDirectory($financeDirectory) | Out-Null
                    $temporaryPath = "$financeDataPath.tmp"
                    [System.IO.File]::WriteAllText($temporaryPath, $financeJson, [System.Text.UTF8Encoding]::new($false))
                    if (Test-Path $financeDataPath -PathType Leaf) {
                        [System.IO.File]::Replace($temporaryPath, $financeDataPath, $null)
                    } else {
                        [System.IO.File]::Move($temporaryPath, $financeDataPath)
                    }

                    Send-HttpResponse $stream '200 OK' 'application/json; charset=utf-8' '{"saved":true}'
                    $responseSent = $true
                    Write-Host "  200 /api/finance -> $financeDataPath" -ForegroundColor DarkGreen
                    continue
                }

                Send-HttpResponse $stream '405 Method Not Allowed' 'application/json; charset=utf-8' '{"error":"Method not allowed."}'
                $responseSent = $true
                continue
            }

            # Security: prevent path traversal
            $urlPath = $urlPath.Replace('/', '\')
            $filePath = Join-Path $baseDir $urlPath.TrimStart('\')
            $fullBase = [IO.Path]::GetFullPath($baseDir)
            $fullFile = [IO.Path]::GetFullPath($filePath)
            if (-not $fullFile.StartsWith($fullBase)) {
                # Attempted directory traversal – return 403
                $body = [System.Text.Encoding]::UTF8.GetBytes('<h1>403 Forbidden</h1>')
                $hdr  = "HTTP/1.1 403 Forbidden`r`nContent-Type: text/html`r`nContent-Length: $($body.Length)`r`nConnection: close`r`n`r`n"
                $hdrB = [System.Text.Encoding]::ASCII.GetBytes($hdr)
                $stream.Write($hdrB, 0, $hdrB.Length)
                $stream.Write($body, 0, $body.Length)
                $responseSent = $true
                $stream.Close(); $client.Close(); continue
            }

            # --- Serve the file or return 404 ---
            if ((Test-Path $fullFile -PathType Leaf) -and $method -eq 'GET') {
                $bytes       = [System.IO.File]::ReadAllBytes($fullFile)
                $contentType = Get-ContentType $fullFile
                $hdr  = "HTTP/1.1 200 OK`r`nContent-Type: $contentType`r`nContent-Length: $($bytes.Length)`r`nConnection: close`r`nAccess-Control-Allow-Origin: *`r`n`r`n"
                $hdrB = [System.Text.Encoding]::ASCII.GetBytes($hdr)
                $stream.Write($hdrB, 0, $hdrB.Length)
                $stream.Write($bytes, 0, $bytes.Length)
                $responseSent = $true
                Write-Host "  200 $urlPath" -ForegroundColor DarkGreen
            } else {
                $body = [System.Text.Encoding]::UTF8.GetBytes('<h1>404 Not Found</h1>')
                $hdr  = "HTTP/1.1 404 Not Found`r`nContent-Type: text/html`r`nContent-Length: $($body.Length)`r`nConnection: close`r`n`r`n"
                $hdrB = [System.Text.Encoding]::ASCII.GetBytes($hdr)
                $stream.Write($hdrB, 0, $hdrB.Length)
                $stream.Write($body, 0, $body.Length)
                $responseSent = $true
                Write-Host "  404 $urlPath" -ForegroundColor DarkYellow
            }
        } catch {
            Write-Host "  ERR $_" -ForegroundColor Red
            if ($stream -and -not $responseSent) {
                try {
                    $errorBody = '{"error":"Request could not be processed."}'
                    Send-HttpResponse $stream '500 Internal Server Error' 'application/json; charset=utf-8' $errorBody
                } catch {}
            }
        } finally {
            if ($stream) { try { $stream.Close() } catch {} }
            if ($client) { try { $client.Close() } catch {} }
        }
    }
} finally {
    $listener.Stop()
    Write-Host "`n  Server stopped." -ForegroundColor Yellow
}
