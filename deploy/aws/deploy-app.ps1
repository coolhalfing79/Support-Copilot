param(
    [Parameter(Mandatory = $true)]
    [string]$PublicIp,

    [Parameter(Mandatory = $true)]
    [string]$KeyPath,

    [string]$SshUser = "ubuntu",
    [int]$SshPort = 443,
    [string]$OpenAIApiKey = $env:OPENAI_API_KEY,
    [string]$SecretKey = $env:SECRET_KEY,
    [string]$PostgresPassword = $env:POSTGRES_PASSWORD
)

$ErrorActionPreference = "Stop"

function Read-SecretValue {
    param([string]$Prompt)
    $secure = Read-Host -Prompt $Prompt -AsSecureString
    $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
    try {
        [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr)
    } finally {
        [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)
    }
}

$RepoRoot = Resolve-Path (Join-Path $PSScriptRoot "..\..")
$SshExe = "C:\Windows\System32\OpenSSH\ssh.exe"
$ScpExe = "C:\Windows\System32\OpenSSH\scp.exe"
if (-not (Test-Path $SshExe)) { throw "OpenSSH ssh.exe not found at $SshExe" }
if (-not (Test-Path $ScpExe)) { throw "OpenSSH scp.exe not found at $ScpExe" }

Write-Host "Checking SSH connectivity to ${PublicIp}:${SshPort}..."
$TcpClient = [System.Net.Sockets.TcpClient]::new()
try {
    $ConnectTask = $TcpClient.ConnectAsync($PublicIp, $SshPort)
    if (-not $ConnectTask.Wait(10000) -or -not $TcpClient.Connected) {
        throw "Cannot connect to ${PublicIp}:${SshPort}. Check your network/VPN and the EC2 security group SSH CIDR before entering OPENAI_API_KEY."
    }
} finally {
    $TcpClient.Dispose()
}

if (-not $OpenAIApiKey) {
    $OpenAIApiKey = Read-SecretValue "Enter OPENAI_API_KEY"
}
if (-not $SecretKey) {
    $SecretKey = [Guid]::NewGuid().ToString("N") + [Guid]::NewGuid().ToString("N")
}
if (-not $PostgresPassword) {
    $PostgresPassword = [Guid]::NewGuid().ToString("N")
}
$JiraProjectKey = if ($env:JIRA_PROJECT_KEY) { $env:JIRA_PROJECT_KEY } else { "SUP" }

function Invoke-Native {
    param(
        [Parameter(Mandatory = $true)]
        [string]$FilePath,
        [Parameter(ValueFromRemainingArguments = $true)]
        [string[]]$Arguments
    )
    & $FilePath @Arguments
    if ($LASTEXITCODE -ne 0) {
        throw "Command failed with exit code ${LASTEXITCODE}: $FilePath $($Arguments -join ' ')"
    }
}

$WorkDir = Join-Path $env:TEMP ("support-copilot-deploy-" + [Guid]::NewGuid().ToString("N"))
New-Item -ItemType Directory -Path $WorkDir | Out-Null

$Archive = Join-Path $WorkDir "support-copilot.tgz"
$RootEnv = Join-Path $WorkDir ".env"
$BackendEnv = Join-Path $WorkDir "backend.env"
$PushedLocation = $false

try {
    Push-Location $RepoRoot
    $PushedLocation = $true
    tar -czf $Archive `
        --exclude ".git" `
        --exclude "*.pem" `
        --exclude "deploy/aws/*.pem" `
        --exclude "frontend/node_modules" `
        --exclude "frontend/dist" `
        --exclude "backend/.venv" `
        --exclude "node_modules" `
        .
    if ($LASTEXITCODE -ne 0) {
        throw "Failed to create deployment archive."
    }
    Pop-Location
    $PushedLocation = $false

    @"
POSTGRES_DB=copilot
POSTGRES_USER=postgres
POSTGRES_PASSWORD=$PostgresPassword
PUBLIC_HOST=$PublicIp
"@ | Set-Content -Path $RootEnv -NoNewline

    @"
APP_NAME=AI L2 Support Copilot
APP_VERSION=1.0.0
DEBUG=false
SECRET_KEY=$SecretKey
OPENAI_API_KEY=$OpenAIApiKey
OPENAI_MODEL=gpt-4o-mini
OPENAI_MAX_TOKENS=1024
JIRA_URL=$env:JIRA_URL
JIRA_EMAIL=$env:JIRA_EMAIL
JIRA_API_TOKEN=$env:JIRA_API_TOKEN
JIRA_PROJECT_KEY=$JiraProjectKey
"@ | Set-Content -Path $BackendEnv -NoNewline

    $Remote = "$SshUser@$PublicIp"
    $SshArgs = @("-i", $KeyPath, "-p", "$SshPort", "-o", "StrictHostKeyChecking=accept-new")
    $ScpArgs = @("-i", $KeyPath, "-P", "$SshPort", "-o", "StrictHostKeyChecking=accept-new")

    Invoke-Native $SshExe @SshArgs $Remote "mkdir -p /opt/support-copilot"
    Invoke-Native $ScpExe @ScpArgs $Archive "$Remote`:/tmp/support-copilot.tgz"
    Invoke-Native $ScpExe @ScpArgs $RootEnv "$Remote`:/tmp/support-copilot.env"
    Invoke-Native $ScpExe @ScpArgs $BackendEnv "$Remote`:/tmp/support-copilot.backend.env"

    $RemoteCommand = @'
set -eux
if ! command -v docker >/dev/null 2>&1; then
  sudo apt-get update
  sudo apt-get install -y docker.io
fi
sudo systemctl enable docker
sudo systemctl start docker

if [ ! -f /swapfile ]; then
  sudo fallocate -l 2G /swapfile || sudo dd if=/dev/zero of=/swapfile bs=1M count=2048
  sudo chmod 600 /swapfile
  sudo mkswap /swapfile
  sudo swapon /swapfile
  echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab >/dev/null
elif ! swapon --show | grep -q /swapfile; then
  sudo swapon /swapfile
fi

if sudo docker compose version >/dev/null 2>&1; then
  COMPOSE="sudo docker compose"
else
  if ! command -v docker-compose >/dev/null 2>&1; then
    sudo apt-get update
    sudo apt-get install -y docker-compose
  fi
  COMPOSE="sudo docker-compose"
fi

sudo rm -rf /opt/support-copilot/app
sudo mkdir -p /opt/support-copilot/app
sudo tar -xzf /tmp/support-copilot.tgz -C /opt/support-copilot/app
sudo mv /tmp/support-copilot.env /opt/support-copilot/app/.env
sudo mv /tmp/support-copilot.backend.env /opt/support-copilot/app/backend/.env
sudo chown -R ubuntu:ubuntu /opt/support-copilot/app
cd /opt/support-copilot/app
$COMPOSE -f docker-compose.yml -f deploy/aws/docker-compose.aws.yml up -d --build
$COMPOSE -f docker-compose.yml -f deploy/aws/docker-compose.aws.yml ps
'@

    Invoke-Native $SshExe @SshArgs $Remote $RemoteCommand

    Write-Host ""
    Write-Host "Deployment command completed."
    Write-Host "Frontend: http://$PublicIp"
    Write-Host "Backend:  http://$PublicIp:8000/health"
} finally {
    if ($PushedLocation) {
        Pop-Location -ErrorAction SilentlyContinue
    }
    Remove-Item -Recurse -Force $WorkDir -ErrorAction SilentlyContinue
}
