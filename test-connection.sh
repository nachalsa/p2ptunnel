#!/bin/bash

echo "🧪 투명 SSH 터널 테스트"
echo "======================="

RELAY_IP=${1:-"localhost"}
SSH_USER=${2:-$(whoami)}

echo "📍 릴레이 서버: $RELAY_IP"
echo "👤 SSH 사용자: $SSH_USER"

# 1. 릴레이 서버 연결 테스트
echo "1️⃣ 릴레이 서버 연결 테스트..."
if nc -z $RELAY_IP 3000 2>/dev/null; then
    echo "✅ 릴레이 서버 응답"
else
    echo "❌ 릴레이 서버 접근 불가"
    exit 1
fi

# 2. SSH 포트 테스트
echo "2️⃣ SSH 포트 테스트..."
if nc -z $RELAY_IP 22 2>/dev/null; then
    echo "✅ SSH 포트 응답"
else
    echo "❌ SSH 포트 접근 불가"
    exit 1
fi

# 3. SSH 연결 테스트
echo "3️⃣ SSH 연결 테스트..."
ssh -o ConnectTimeout=10 -o BatchMode=yes -o StrictHostKeyChecking=no \
    $SSH_USER@$RELAY_IP "echo 'SSH 연결 성공'" 2>/dev/null

if [ $? -eq 0 ]; then
    echo "✅ SSH 연결 성공"
else
    echo "❌ SSH 연결 실패 (인증 필요할 수 있음)"
fi

echo "🎉 테스트 완료!"
echo "💡 실제 접속: ssh $SSH_USER@$RELAY_IP"
