const dgram = require('dgram');
const crypto = require('crypto');

class P2PManager {
    constructor() {
        this.stunPort = 3478;
        this.holePunchingAttempts = new Map();
    }

    async detectNAT(socket) {
        try {
            // 소켓 정보에서 클라이언트 IP 추출
            const privateIP = socket.handshake.address;
            
            // 간단한 NAT 타입 추정
            let natType = 'cone'; // 기본값
            
            if (privateIP.startsWith('192.168.') || 
                privateIP.startsWith('10.') || 
                privateIP.startsWith('172.')) {
                natType = 'cone';
            } else if (privateIP === '127.0.0.1') {
                natType = 'none';
            }

            return {
                privateIP: privateIP,
                publicIP: this.getPublicIP(socket),
                publicPort: null,
                type: natType,
                timestamp: Date.now()
            };
        } catch (error) {
            return {
                privateIP: 'unknown',
                publicIP: null,
                publicPort: null,
                type: 'unknown',
                timestamp: Date.now()
            };
        }
    }

    async detectClientNAT(clientSocket) {
        // TCP 소켓에서 NAT 정보 추출
        return {
            privateIP: clientSocket.remoteAddress,
            publicIP: clientSocket.remoteAddress,
            type: this.estimateNATFromIP(clientSocket.remoteAddress)
        };
    }

    estimateNATFromIP(ip) {
        if (ip.startsWith('192.168.') || ip.startsWith('10.') || ip.startsWith('172.')) {
            return 'cone';
        } else if (ip === '127.0.0.1' || ip === '::1') {
            return 'none';
        }
        return 'unknown';
    }

    getPublicIP(socket) {
        // HTTP 헤더나 소켓 정보에서 실제 공인 IP 추출
        const forwarded = socket.handshake.headers['x-forwarded-for'];
        if (forwarded) {
            return forwarded.split(',')[0].trim();
        }
        return socket.handshake.address;
    }

    canAttemptP2P(clientNAT, serverNAT) {
        // 둘 다 Symmetric NAT이면 P2P 어려움
        if (clientNAT?.type === 'symmetric' && serverNAT?.type === 'symmetric') {
            return false;
        }
        
        // 로컬 연결이면 P2P 불필요
        if (clientNAT?.type === 'none' || serverNAT?.type === 'none') {
            return false;
        }
        
        return true;
    }

    async attemptHolePunching(clientSocket, agent, clientNAT) {
        const attemptId = crypto.randomUUID();
        
        return new Promise((resolve) => {
            // 실제 P2P 구현은 복잡하므로 여기서는 시뮬레이션
            // 실제로는 UDP 홀 펀칭, STUN/TURN 서버 등이 필요
            
            console.log(`홀 펀칭 시도: ${attemptId}`);
            
            // 간단한 성공/실패 로직
            const successRate = this.calculateSuccessRate(clientNAT, agent.natInfo);
            const success = Math.random() < successRate;
            
            setTimeout(() => {
                if (success) {
                    resolve({
                        success: true,
                        directIP: agent.natInfo.publicIP || agent.natInfo.privateIP,
                        directPort: agent.sshPort,
                        method: 'hole-punching'
                    });
                } else {
                    resolve({
                        success: false,
                        reason: 'NAT traversal failed'
                    });
                }
            }, 2000); // 2초 시뮬레이션
        });
    }

    calculateSuccessRate(clientNAT, serverNAT) {
        // NAT 타입별 P2P 성공률 추정
        if (!clientNAT || !serverNAT) return 0.1;
        
        const rates = {
            'none': 0.95,
            'cone': 0.85,
            'symmetric': 0.3,
            'unknown': 0.5
        };
        
        const clientRate = rates[clientNAT.type] || 0.5;
        const serverRate = rates[serverNAT.type] || 0.5;
        
        // 두 성공률의 평균
        return (clientRate + serverRate) / 2;
    }
}

module.exports = P2PManager;
