param(
    [string]$Region = $(if ($env:AWS_REGION) { $env:AWS_REGION } else { "us-east-1" }),
    [string]$Profile = $env:AWS_PROFILE,
    [string]$InstanceName = "support-copilot",
    [string]$InstanceType = "t3.micro",
    [string]$KeyName = "support-copilot-key",
    [string]$AmiId = "",
    [int]$RootVolumeSizeGb = 20,
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
$AwsCmd = $env:AWS_CMD
if (-not $AwsCmd) {
    $candidate = Join-Path $env:APPDATA "Python\Python314\Scripts\aws.cmd"
    if (Test-Path $candidate) {
        $AwsCmd = $candidate
    } else {
        $cmd = Get-Command aws -ErrorAction SilentlyContinue
        if ($cmd) { $AwsCmd = $cmd.Source }
    }
}
if (-not $AwsCmd) {
    throw "AWS CLI was not found. Set AWS_CMD or install/configure AWS CLI."
}

$BaseAwsArgs = @("--region", $Region)
if ($Profile) {
    $BaseAwsArgs += @("--profile", $Profile)
}

function Invoke-Aws {
    param([Parameter(ValueFromRemainingArguments = $true)][string[]]$Args)
    $previousErrorActionPreference = $ErrorActionPreference
    try {
        $ErrorActionPreference = "Continue"
        $output = & $AwsCmd @BaseAwsArgs @Args 2>&1
        $exitCode = $LASTEXITCODE
    } finally {
        $ErrorActionPreference = $previousErrorActionPreference
    }
    if ($exitCode -ne 0) {
        throw "aws command failed: aws $($BaseAwsArgs -join ' ') $($Args -join ' ')`n$($output -join [Environment]::NewLine)"
    }
    $output
}

function Test-FrontendPackageLock {
    $packageLockPath = Join-Path $RepoRoot "frontend\package-lock.json"
    if (-not (Test-Path $packageLockPath)) {
        throw "frontend/package-lock.json is missing. Docker uses npm ci, so deployment cannot continue without it."
    }

    $packageLock = Get-Content -Raw -Path $packageLockPath

    $requiredPackages = @(
        "node_modules/@emnapi/core",
        "node_modules/@emnapi/runtime"
    )
    $missingPackages = @(
        foreach ($packageName in $requiredPackages) {
            if (-not $packageLock.Contains("""$packageName"":")) {
                $packageName
            }
        }
    )

    if ($missingPackages.Count -gt 0) {
        throw "frontend/package-lock.json is not compatible with the Docker npm ci step. Missing package entries: $($missingPackages -join ', '). Run this from frontend/: npx npm@10.8.2 install --package-lock-only"
    }
}

if (-not $SecretKey) {
    $SecretKey = [Guid]::NewGuid().ToString("N") + [Guid]::NewGuid().ToString("N")
}
if (-not $PostgresPassword) {
    $PostgresPassword = [Guid]::NewGuid().ToString("N")
}
$JiraProjectKey = if ($env:JIRA_PROJECT_KEY) { $env:JIRA_PROJECT_KEY } else { "SUP" }

$AccountId = Invoke-Aws sts get-caller-identity --query "Account" --output text
$BucketName = "support-copilot-deploy-$AccountId-$Region"
$ObjectKey = "support-copilot-$([Guid]::NewGuid().ToString("N")).tgz"

Test-FrontendPackageLock

if (-not $OpenAIApiKey) {
    $OpenAIApiKey = Read-SecretValue "Enter OPENAI_API_KEY"
}

$WorkDir = Join-Path $env:TEMP ("support-copilot-autodeploy-" + [Guid]::NewGuid().ToString("N"))
New-Item -ItemType Directory -Path $WorkDir | Out-Null
$Archive = Join-Path $WorkDir "support-copilot.tgz"
$UserDataPath = Join-Path $WorkDir "user-data-autodeploy.sh"
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

    try {
        Invoke-Aws s3api head-bucket --bucket $BucketName | Out-Null
    } catch {
        if ($Region -eq "us-east-1") {
            Invoke-Aws s3api create-bucket --bucket $BucketName | Out-Null
        } else {
            Invoke-Aws s3api create-bucket --bucket $BucketName --create-bucket-configuration "LocationConstraint=$Region" | Out-Null
        }
        Invoke-Aws s3api put-public-access-block `
            --bucket $BucketName `
            --public-access-block-configuration "BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true" | Out-Null
    }

    Invoke-Aws s3 cp $Archive "s3://$BucketName/$ObjectKey" | Out-Null
    $PackageUrl = Invoke-Aws s3 presign "s3://$BucketName/$ObjectKey" --expires-in 172800

    if (-not $AmiId) {
        try {
            $AmiId = Invoke-Aws ssm get-parameter `
                --name "/aws/service/canonical/ubuntu/server/22.04/stable/current/amd64/hvm/ebs-gp2/ami-id" `
                --query "Parameter.Value" `
                --output text
        } catch {
            Write-Warning "Could not read the Ubuntu AMI SSM parameter. Falling back to EC2 describe-images."
            $AmiId = Invoke-Aws ec2 describe-images `
                --owners 099720109477 `
                --filters "Name=name,Values=ubuntu/images/hvm-ssd/ubuntu-jammy-22.04-amd64-server-*" "Name=architecture,Values=x86_64" "Name=virtualization-type,Values=hvm" `
                --query "sort_by(Images, &CreationDate)[-1].ImageId" `
                --output text
        }
    }

    $RootDeviceName = Invoke-Aws ec2 describe-images `
        --image-ids $AmiId `
        --query "Images[0].RootDeviceName" `
        --output text

    $VpcId = Invoke-Aws ec2 describe-vpcs --filters "Name=is-default,Values=true" --query "Vpcs[0].VpcId" --output text
    if (-not $VpcId -or $VpcId -eq "None") {
        throw "No default VPC found in region $Region."
    }
    $SubnetId = Invoke-Aws ec2 describe-subnets --filters "Name=vpc-id,Values=$VpcId" --query "Subnets[0].SubnetId" --output text

    $SgName = "$InstanceName-sg"
    $SecurityGroupId = $null
    try {
        $SecurityGroupId = Invoke-Aws ec2 describe-security-groups `
            --filters "Name=group-name,Values=$SgName" "Name=vpc-id,Values=$VpcId" `
            --query "SecurityGroups[0].GroupId" `
            --output text
    } catch {}
    if (-not $SecurityGroupId -or $SecurityGroupId -eq "None") {
        $SecurityGroupId = Invoke-Aws ec2 create-security-group `
            --group-name $SgName `
            --description "Support Copilot demo access" `
            --vpc-id $VpcId `
            --query "GroupId" `
            --output text
    }

    foreach ($rule in @(
        @{ Port = "80"; Cidr = "0.0.0.0/0" },
        @{ Port = "8000"; Cidr = "0.0.0.0/0" }
    )) {
        try {
            Invoke-Aws ec2 authorize-security-group-ingress `
                --group-id $SecurityGroupId `
                --protocol tcp `
                --port $rule.Port `
                --cidr $rule.Cidr | Out-Null
        } catch {
            if ($_.Exception.Message -notmatch "InvalidPermission.Duplicate") { throw }
        }
    }

    $Template = Get-Content -Raw -Path (Join-Path $PSScriptRoot "user-data-autodeploy.sh")
    $Template = $Template.Replace("__PACKAGE_URL__", $PackageUrl.Trim())
    $Template = $Template.Replace("__OPENAI_API_KEY__", $OpenAIApiKey)
    $Template = $Template.Replace("__SECRET_KEY__", $SecretKey)
    $Template = $Template.Replace("__POSTGRES_PASSWORD__", $PostgresPassword)
    $Template = $Template.Replace("__PUBLIC_HOST__", "PLACEHOLDER_PUBLIC_HOST")
    $Template = $Template.Replace("__JIRA_URL__", "$env:JIRA_URL")
    $Template = $Template.Replace("__JIRA_EMAIL__", "$env:JIRA_EMAIL")
    $Template = $Template.Replace("__JIRA_API_TOKEN__", "$env:JIRA_API_TOKEN")
    $Template = $Template.Replace("__JIRA_PROJECT_KEY__", $JiraProjectKey)

    $PublicHostScript = @'
TOKEN="$(curl -fsS -X PUT http://169.254.169.254/latest/api/token -H 'X-aws-ec2-metadata-token-ttl-seconds: 21600' || true)"
if [ -n "$TOKEN" ]; then
  PUBLIC_HOST="$(curl -fsS -H "X-aws-ec2-metadata-token: $TOKEN" http://169.254.169.254/latest/meta-data/public-ipv4)"
else
  PUBLIC_HOST="$(curl -fsS http://169.254.169.254/latest/meta-data/public-ipv4)"
fi
'@
    $Template = $Template.Replace('PUBLIC_HOST="PLACEHOLDER_PUBLIC_HOST"', $PublicHostScript.Trim())
    Set-Content -Path $UserDataPath -Value $Template -NoNewline

    $KeyExists = $null
    try {
        $KeyExists = Invoke-Aws ec2 describe-key-pairs --key-names $KeyName --query "KeyPairs[0].KeyName" --output text
    } catch {}
    if (-not $KeyExists -or $KeyExists -eq "None") {
        Invoke-Aws ec2 create-key-pair --key-name $KeyName --query "KeyMaterial" --output text | Out-Null
    }

    $InstanceId = Invoke-Aws ec2 run-instances `
        --image-id $AmiId `
        --instance-type $InstanceType `
        --key-name $KeyName `
        --security-group-ids $SecurityGroupId `
        --subnet-id $SubnetId `
        --associate-public-ip-address `
        --block-device-mappings "DeviceName=$RootDeviceName,Ebs={VolumeSize=$RootVolumeSizeGb,VolumeType=gp3,DeleteOnTermination=true}" `
        --user-data "file://$UserDataPath" `
        --tag-specifications "ResourceType=instance,Tags=[{Key=Name,Value=$InstanceName}]" `
        --query "Instances[0].InstanceId" `
        --output text

    Write-Host "Waiting for instance $InstanceId..."
    Invoke-Aws ec2 wait instance-running --instance-ids $InstanceId
    $PublicIp = Invoke-Aws ec2 describe-instances `
        --instance-ids $InstanceId `
        --query "Reservations[0].Instances[0].PublicIpAddress" `
        --output text

    Write-Host ""
    Write-Host "EC2 auto-deploy instance is running."
    Write-Host "InstanceId: $InstanceId"
    Write-Host "PublicIp:   $PublicIp"
    Write-Host "Frontend:   http://$PublicIp"
    Write-Host "Backend:    http://$PublicIp`:8000/health"
    Write-Host ""
    Write-Host "Deployment continues in EC2 cloud-init. Check console output if it is not ready after 10-15 minutes."
} finally {
    if ($PushedLocation) {
        Pop-Location -ErrorAction SilentlyContinue
    }
    Remove-Item -Recurse -Force $WorkDir -ErrorAction SilentlyContinue
}
