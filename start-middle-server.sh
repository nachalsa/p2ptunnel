#!/bin/bash

echo "🚀 투명 SSH 터널링 중계 서버 시작"
echo "================================="

# 기존 SSH 서비스 중지 (포트 22 사용을 위해)
echo "📋 기존 SSH 서비스 중지..."
sudo systemctl stop ssh
sudo systemctl disable ssh

# 중계 서버 디렉토리로 이동
cd "$(dirname "$0")/middle-server"

# 환경 변수 설정
export NODE_ENV=production
export SSH_PORT=22
export SOCKET_PORT=3000

# 포트 사용 확인
if lsof -Pi :22 -sTCP:LISTEN -t >/dev/null ; then
    echo "❌ 포트 22가 이미 사용 중입니다."
    echo "🔧 사용 중인 프로세스를 확인하세요: sudo lsof -i :22"
    exit 1
fi

if lsof -Pi :3000 -sTCP:LISTEN -t >/dev/null ; then
	echo "❌ 포트 3000이 이미 사용 중입니다."
	echo "🔧 사용 중인 프로세스를 확인하세요: sudo lsof -i :3000"
	exit 1
fi

# PM2로 서버 시작
echo "🔥 중계 서버 시작 중..."
sudo pm2 start ssh-proxy-server.js \
  --name "ssh-middle" \
  --max-memory-restart 500M \
  --watch \
  --ignore-watch="node_modules" \
  --log-date-format "YYYY-MM-DD HH:mm:ss" \
  --time

# 부팅 시 자동 시작 설정
sudo pm2 startup
sudo pm2 save --force

echo ""
echo "✅ 중계 서버 시작 완료!"
echo "📊 상태 확인: pm2 status"
echo "📋 로그 확인: pm2 logs ssh-middle"
echo "🌐 외부 접속: ssh user@$(hostname -I | awk '{print $1}')"
echo "🔧 포트: SSH(22), Socket(3000)"

