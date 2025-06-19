#!/bin/bash

echo "🔗 투명 SSH 터널링 타겟 서버 시작"
echo "================================="

# 중계 서버 IP 확인
if [ -z "$MIDDLE_SERVER_IP" ]; then
    echo "❌ 중계 서버 IP를 설정해주세요:"
    echo "   export MIDDLE_SERVER_IP=라즈베리파이IP"
    echo "   예: export MIDDLE_SERVER_IP=192.168.1.100"
    exit 1
fi

# 타겟 서버 디렉토리로 이동
cd "$(dirname "$0")/target-server"

# 환경 변수 설정
export NODE_ENV=production
export RELAY_SERVER="http://$MIDDLE_SERVER_IP:3000"
export RELAY_SERVER_IP="$MIDDLE_SERVER_IP"

echo "📍 중계 서버: $RELAY_SERVER"

# SSH 서비스 확인
if ! systemctl is-active --quiet ssh; then
    echo "⚠️ SSH 서비스가 비활성화되어 있습니다."
    echo "🔧 SSH 서비스 시작 중..."
    sudo systemctl start ssh
    sudo systemctl enable ssh
fi

# 중계 서버 연결 테스트
echo "🔍 중계 서버 연결 테스트..."
if ! nc -z $MIDDLE_SERVER_IP 3000 2>/dev/null; then
    echo "❌ 중계 서버에 연결할 수 없습니다."
    echo "🔧 중계 서버가 실행 중인지 확인하세요."
    exit 1
fi

# PM2로 에이전트 시작
echo "🔗 타겟 서버 에이전트 시작 중..."
pm2 start ssh-tunnel-agent.js \
  --name "ssh-target" \
  --max-memory-restart 200M \
  --watch \
  --ignore-watch="node_modules" \
  --log-date-format "YYYY-MM-DD HH:mm:ss" \
  --time

# 부팅 시 자동 시작 설정
pm2 startup
pm2 save

echo ""
echo "✅ 타겟 서버 에이전트 시작 완료!"
echo "📊 상태 확인: pm2 status"
echo "📋 로그 확인: pm2 logs ssh-target"
echo "🎯 SSH 터널링 준비 완료!"
