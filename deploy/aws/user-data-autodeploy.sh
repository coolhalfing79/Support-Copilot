#!/bin/sh
set -eux

PACKAGE_URL="__PACKAGE_URL__"
OPENAI_API_KEY="__OPENAI_API_KEY__"
SECRET_KEY="__SECRET_KEY__"
POSTGRES_PASSWORD="__POSTGRES_PASSWORD__"
PUBLIC_HOST="__PUBLIC_HOST__"
JIRA_URL="__JIRA_URL__"
JIRA_EMAIL="__JIRA_EMAIL__"
JIRA_API_TOKEN="__JIRA_API_TOKEN__"
JIRA_PROJECT_KEY="__JIRA_PROJECT_KEY__"

apt-get update
apt-get install -y docker.io docker-compose git curl ca-certificates

systemctl enable docker
systemctl start docker

if [ ! -f /swapfile ]; then
  fallocate -l 2G /swapfile || dd if=/dev/zero of=/swapfile bs=1M count=2048
  chmod 600 /swapfile
  mkswap /swapfile
  swapon /swapfile
  echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi

mkdir -p /opt/support-copilot/app
curl -fsSL "$PACKAGE_URL" -o /tmp/support-copilot.tgz
tar -xzf /tmp/support-copilot.tgz -C /opt/support-copilot/app

cat > /opt/support-copilot/app/.env <<EOF
POSTGRES_DB=copilot
POSTGRES_USER=postgres
POSTGRES_PASSWORD=$POSTGRES_PASSWORD
PUBLIC_HOST=$PUBLIC_HOST
EOF

cat > /opt/support-copilot/app/backend/.env <<EOF
APP_NAME=AI L2 Support Copilot
APP_VERSION=1.0.0
DEBUG=false
SECRET_KEY=$SECRET_KEY
OPENAI_API_KEY=$OPENAI_API_KEY
OPENAI_MODEL=gpt-4o-mini
OPENAI_MAX_TOKENS=1024
JIRA_URL=$JIRA_URL
JIRA_EMAIL=$JIRA_EMAIL
JIRA_API_TOKEN=$JIRA_API_TOKEN
JIRA_PROJECT_KEY=$JIRA_PROJECT_KEY
EOF

cd /opt/support-copilot/app
COMPOSE="docker-compose -f docker-compose.yml -f deploy/aws/docker-compose.aws.yml"

set +e
$COMPOSE up -d --build
COMPOSE_STATUS=$?
$COMPOSE ps
$COMPOSE logs --tail=120 backend frontend
set -e

if [ "$COMPOSE_STATUS" -ne 0 ]; then
  exit "$COMPOSE_STATUS"
fi

for attempt in $(seq 1 40); do
  if curl -fsS http://localhost:8000/health >/tmp/backend-health.json && curl -fsS http://localhost/ >/dev/null; then
    echo "Application is ready."
    cat /tmp/backend-health.json
    exit 0
  fi
  echo "Waiting for application readiness... attempt ${attempt}/40"
  sleep 15
done

$COMPOSE ps
$COMPOSE logs --tail=200 backend frontend
echo "Application did not become ready in time."
exit 1
