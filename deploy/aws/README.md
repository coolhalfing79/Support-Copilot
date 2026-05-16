# Personal AWS Deployment

This path deploys the current monorepo to one EC2 instance and runs the existing
Docker Compose stack on that instance. It does not require Docker locally.

The default instance type is `t3.micro` so we can attempt to stay inside the AWS
Free Tier for a short demo. Free Tier eligibility depends on your AWS account
age, region, and existing usage. Delete/terminate the instance after testing to
avoid surprise charges.

## Prerequisites

- AWS CLI configured with credentials for your personal AWS account.
- EC2 permissions to create an instance, key pair, security group, and read the
  Ubuntu AMI SSM parameter.
- An OpenAI API key for backend LLM calls.

## 1. Configure AWS Credentials

Run this in a normal PowerShell terminal and enter your own credentials:

```powershell
& "$env:APPDATA\Python\Python314\Scripts\aws.cmd" configure
```

Recommended defaults:

```text
Default region name: us-east-1
Default output format: json
```

## 2. Provision EC2

From the repository root:

```powershell
.\deploy\aws\provision-ec2.ps1 -Region us-east-1
```

The script prints the public IP and key path.

## 3. Upload And Run The App

If your network allows SSH, use:

```powershell
.\deploy\aws\deploy-app.ps1 -PublicIp <EC2_PUBLIC_IP> -KeyPath ".\deploy\aws\support-copilot-key.pem" -SshPort 443
```

The script prompts for `OPENAI_API_KEY` if it is not already in your environment.

If your network blocks SSH, use the no-SSH auto-deploy path instead:

```powershell
.\deploy\aws\provision-autodeploy-ec2.ps1 -Region us-east-1
```

That script uploads a private package to S3, launches EC2, and EC2 deploys the
app from cloud-init without any SSH connection from your machine.

## 4. Open The Application

- Frontend: `http://<EC2_PUBLIC_IP>`
- Backend health: `http://<EC2_PUBLIC_IP>:8000/health`

## Notes

- This uses local Docker Compose on the EC2 instance.
- Security group opens ports `22`, `443`, `80`, and `8000`. SSH uses `443`
  by default because many hotspot/corporate networks block outbound SSH on 22.
- The frontend container receives runtime `API_BASE_URL` and `WS_BASE_URL`
  values pointing at the same EC2 public IP.
- `t3.micro` is small. The full stack may be slow because it runs frontend,
  backend, Postgres, Redis, and Chroma on one VM.
