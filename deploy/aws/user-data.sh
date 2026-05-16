#!/bin/sh
set -eux

apt-get update
apt-get install -y docker.io docker-compose git curl ca-certificates

cat > /etc/ssh/sshd_config.d/support-copilot.conf <<'EOF'
Port 22
Port 443
EOF
systemctl restart ssh || systemctl restart sshd

systemctl enable docker
systemctl start docker

if [ ! -f /swapfile ]; then
  fallocate -l 2G /swapfile || dd if=/dev/zero of=/swapfile bs=1M count=2048
  chmod 600 /swapfile
  mkswap /swapfile
  swapon /swapfile
  echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi

usermod -aG docker ubuntu || true

mkdir -p /opt/support-copilot
chown ubuntu:ubuntu /opt/support-copilot
