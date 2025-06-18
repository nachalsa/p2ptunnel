#!/bin/bash

echo "📊 투명 SSH 터널링 시스템 전체 상태"
echo "===================================="

# PM2 프로세스 상태
echo "🔥 PM2 프로세스 상태:"
pm2 status

echo ""
echo "📋 최근 로그 (각 10줄):"
echo "----------------------"

if pm2 list | grep -q ssh-middle; then
    echo "🖥️ 중계 서버 로그:"
    pm2 logs ssh-middle --lines 5 --nostream
    echo ""
fi

if pm2 list | grep -q ssh-target; then
    echo "🎯 타겟 서버 로그:"
    pm2 logs ssh-target --lines 5 --nostream
    echo ""
fi

echo "🌐 네트워크 연결 상태:"
echo "---------------------"

# SSH 포트 확인
if netstat -tuln 2>/dev/null | grep -q ":22 " || ss -tuln 2>/dev/null | grep -q ":22 "; then
    echo "✅ SSH 포트 22 활성"
else
    echo "❌ SSH 포트 22 비활성"
fi

# 소켓 포트 확인
if netstat -tuln 2>/dev/null | grep -q ":3000 " || ss -tuln 2>/dev/null | grep -q ":3000 "; then
    echo "✅ 소켓 서버 포트 3000 활성"
else
    echo "❌ 소켓 서버 포트 3000 비활성"
fi

echo ""
echo "💾 시스템 리소스:"
echo "----------------"
if command -v free >/dev/null; then
    echo "메모리: $(free -h | awk 'NR==2{printf "사용:%s 전체:%s (%.1f%%)", $3, $2, $3/$2*100}')"
fi

if command -v df >/dev/null; then
    echo "디스크: $(df -h / | awk 'NR==2{print $3"/"$2" ("$5")"}')"
fi

echo ""
echo "🔄 빠른 명령어:"
echo "--------------"
echo "  전체 재시작: pm2 restart all"
echo "  전체 중지:   pm2 stop all"
echo "  실시간 로그: pm2 logs --follow"
echo "  프로세스 삭제: pm2 delete all"

echo ""
echo "🧪 연결 테스트:"
echo "--------------"
echo "  ./test-connection.sh [중계서버IP] [SSH사용자명]"
