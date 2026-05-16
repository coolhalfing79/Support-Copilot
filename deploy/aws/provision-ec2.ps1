param(
    [string]$Region = $(if ($env:AWS_REGION) { $env:AWS_REGION } else { "us-east-1" }),
    [string]$Profile = $env:AWS_PROFILE,
    [string]$InstanceName = "support-copilot",
    [string]$InstanceType = "t3.micro",
    [string]$KeyName = "support-copilot-key",
    [string]$AmiId = "",
    [int]$RootVolumeSizeGb = 20,
    [string]$SshCidr = ""
)

$ErrorActionPreference = "Stop"

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

$KeyPath = Join-Path $PSScriptRoot "$KeyName.pem"
$existingKey = $null
try {
    $existingKey = Invoke-Aws ec2 describe-key-pairs --key-names $KeyName --query "KeyPairs[0].KeyName" --output text 2>$null
} catch {}

if (-not $existingKey -or $existingKey -eq "None") {
    Write-Host "Creating EC2 key pair: $KeyName"
    Invoke-Aws ec2 create-key-pair --key-name $KeyName --query "KeyMaterial" --output text | Set-Content -NoNewline -Path $KeyPath
    icacls $KeyPath /inheritance:r /grant:r "$($env:USERNAME):(R)" | Out-Null
} elseif (-not (Test-Path $KeyPath)) {
    throw "Key pair '$KeyName' already exists in AWS, but $KeyPath is missing locally. Use a different KeyName or provide the original .pem file."
}

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
        --output text 2>$null
} catch {}

if (-not $SecurityGroupId -or $SecurityGroupId -eq "None") {
    $SecurityGroupId = Invoke-Aws ec2 create-security-group `
        --group-name $SgName `
        --description "Support Copilot demo access" `
        --vpc-id $VpcId `
        --query "GroupId" `
        --output text
}

$MyIp = $SshCidr
if (-not $MyIp) {
    $MyIp = "0.0.0.0/0"
    try {
        $DetectedIp = (Invoke-RestMethod -Uri "https://checkip.amazonaws.com" -TimeoutSec 10).Trim()
        if ($DetectedIp) { $MyIp = "$DetectedIp/32" }
    } catch {
        Write-Warning "Could not detect public IP; SSH will be open to 0.0.0.0/0."
    }
}

foreach ($rule in @(
    @{ Port = "22"; Cidr = $MyIp },
    @{ Port = "443"; Cidr = $MyIp },
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
        if ($_.Exception.Message -notmatch "InvalidPermission.Duplicate") {
            throw
        }
    }
}

$UserDataPath = Join-Path $PSScriptRoot "user-data.sh"
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
Write-Host "EC2 instance is ready."
Write-Host "InstanceId: $InstanceId"
Write-Host "PublicIp:   $PublicIp"
Write-Host "KeyPath:    $KeyPath"
Write-Host ""
Write-Host "Next:"
Write-Host "  .\deploy\aws\deploy-app.ps1 -PublicIp $PublicIp -KeyPath `"$KeyPath`" -SshPort 443"
