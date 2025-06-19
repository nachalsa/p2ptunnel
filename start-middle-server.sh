#!/bin/bash

echo "🚀 투명 SSH 터널링 중계 서버 시작"
echo "================================="


# 중계 서버 디렉토리로 이동
cd "$(dirname "$0")/middle-server"

# 환경 변수 설정
export NODE_ENV=production
export SSH_PORT=22
export SOCKET_PORT=3000

echo "🧹 기존 PM2 'ssh-middle' 프로세스 정리..."
sudo pm2 stop ssh-middle 2>/dev/null
sudo pm2 delete ssh-middle 2>/dev/null

# 포트 사용 확인
if lsof -Pi :$SSH_PORT -sTCP:LISTEN -t >/dev/null ; then
    echo "❌ 포트 $SSH_PORT가 이미 사용 중입니다."
    echo "🔧 사용 중인 프로세스를 확인하세요: sudo lsof -i :$SSH_PORT"
    if [ $SSH_PORT = 22 ]; then
        echo "📋 기존 SSH 서비스를 확인하세요 /etc/ssh/sshd_config  systemctl restart ssh"
    fi
    exit 1
fi

if lsof -Pi :$SOCKET_PORT -sTCP:LISTEN -t >/dev/null ; then
	echo "❌ 포트 $SOCKET_PORT이 이미 사용 중입니다."
	echo "🔧 사용 중인 프로세스를 확인하세요: sudo lsof -i :$SOCKET_PORT"
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
echo "🔧 포트: SSH($SSH_PORT), Socket($SOCKET_PORT)"

