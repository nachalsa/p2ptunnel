const net = require('net');
const socketIo = require('socket.io');
const http = require('http');
const crypto = require('crypto');
const P2PManager = require('./p2p-manager');

class TransparentSSHProxy {
    constructor() {
        // SSH 프록시 서버 (포트 22)
        this.sshServer = null;
        
        // 터널 에이전트와 통신용 소켓 서버
        this.httpServer = http.createServer();
        this.io = socketIo(this.httpServer);
        
        // P2P 관리자
        this.p2pManager = new P2PManager();
        
        // 연결 관리
        this.tunnelAgents = new Map();  // 사설망 PC들
        this.activeSessions = new Map(); // 활성 SSH 세션
        
        this.setupSocketHandlers();
        this.startSSHProxy();
    }

    setupSocketHandlers() {
        this.io.on('connection', (socket) => {
            console.log(`터널 에이전트 연결: ${socket.id}`);

            // 터널 에이전트 등록
            socket.on('register-agent', async (data) => {
                await this.registerTunnelAgent(socket, data);
            });

            // P2P 홀 펀칭 결과
            socket.on('p2p-result', (data) => {
                this.handleP2PResult(socket, data);
            });

            // SSH 데이터 릴레이
            socket.on('ssh-data', (data) => {
                this.relaySSHData(data);
            });

            // 연결 해제
            socket.on('disconnect', () => {
                this.handleAgentDisconnection(socket);
            });
        });
    }

    async registerTunnelAgent(socket, data) {
        const { agentId, authToken, sshPort } = data;
        
        if (!this.validateAuth(authToken)) {
            socket.emit('registration-result', { success: false, error: 'Invalid auth' });
            return;
        }

        // NAT 정보 감지
        const natInfo = await this.p2pManager.detectNAT(socket);
        
        this.tunnelAgents.set(agentId, {
            socket: socket,
            sshPort: sshPort || 22,
            natInfo: natInfo,
            lastSeen: Date.now(),
            p2pCapable: natInfo.type !== 'symmetric'
        });

        socket.agentId = agentId;
        socket.emit('registration-result', { 
            success: true, 
            natInfo: natInfo 
        });

        console.log(`터널 에이전트 등록: ${agentId} (NAT: ${natInfo.type})`);
    }

    startSSHProxy() {
        this.sshServer = net.createServer((clientSocket) => {
            console.log(`새 SSH 연결: ${clientSocket.remoteAddress}:${clientSocket.remotePort}`);
            
            // 기본 에이전트 선택 (여러 개 있으면 로드밸런싱 가능)
            const agent = this.selectAgent();
            
            if (!agent) {
                console.log('❌ 사용 가능한 터널 에이전트 없음');
                clientSocket.end();
                return;
            }

            this.handleSSHConnection(clientSocket, agent);
        });

        this.sshServer.listen(22, () => {
            console.log('🚀 투명 SSH 프록시 서버 시작 - 포트 22');
            console.log('✨ 사용법: ssh user@이서버IP');
        });

        this.sshServer.on('error', (err) => {
            if (err.code === 'EADDRINUSE') {
                console.log('⚠️ 포트 22가 사용 중입니다. 다른 포트를 사용하거나 기존 SSH 서비스를 중지하세요.');
                console.log('💡 대안: sudo systemctl stop ssh');
                process.exit(1);
            }
        });
    }

    selectAgent() {
        // 간단한 선택 (첫 번째 활성 에이전트)
        for (const agent of this.tunnelAgents.values()) {
            if (Date.now() - agent.lastSeen < 30000) { // 30초 이내 활성
                return agent;
            }
        }
        return null;
    }

    async handleSSHConnection(clientSocket, agent) {
        const sessionId = crypto.randomUUID();
        
        // 세션 등록
        this.activeSessions.set(sessionId, {
            clientSocket: clientSocket,
            agent: agent,
            mode: null, // 'p2p' 또는 'relay'
            startTime: Date.now()
        });

        // 클라이언트 NAT 정보 감지 (가능한 경우)
        const clientNAT = await this.p2pManager.detectClientNAT(clientSocket);
        
        // P2P 가능성 확인
        if (agent.p2pCapable && this.p2pManager.canAttemptP2P(clientNAT, agent.natInfo)) {
            console.log(`P2P 시도: ${sessionId}`);
            await this.attemptP2PConnection(sessionId, clientSocket, agent, clientNAT);
        } else {
            console.log(`릴레이 모드: ${sessionId}`);
            this.setupRelayConnection(sessionId, clientSocket, agent);
        }
    }

    async attemptP2PConnection(sessionId, clientSocket, agent, clientNAT) {
        try {
            // P2P 홀 펀칭 시도
            const p2pResult = await this.p2pManager.attemptHolePunching(
                clientSocket, 
                agent, 
                clientNAT
            );

            if (p2pResult.success) {
                console.log(`✅ P2P 연결 성공: ${sessionId}`);
                this.setupP2PConnection(sessionId, clientSocket, agent, p2pResult);
            } else {
                console.log(`❌ P2P 실패, 릴레이로 전환: ${sessionId}`);
                this.setupRelayConnection(sessionId, clientSocket, agent);
            }
        } catch (error) {
            console.log(`❌ P2P 오류, 릴레이로 전환: ${sessionId}`, error.message);
            this.setupRelayConnection(sessionId, clientSocket, agent);
        }
    }

    setupP2PConnection(sessionId, clientSocket, agent, p2pResult) {
        const session = this.activeSessions.get(sessionId);
        session.mode = 'p2p';
        session.p2pInfo = p2pResult;

        // P2P 직접 연결 설정
        const directSocket = net.createConnection({
            host: p2pResult.directIP,
            port: p2pResult.directPort
        });

        directSocket.on('connect', () => {
            console.log(`🎯 P2P 직접 연결 완료: ${sessionId}`);
            
            // 양방향 데이터 파이프
            clientSocket.pipe(directSocket);
            directSocket.pipe(clientSocket);
        });

        directSocket.on('error', (err) => {
            console.log(`P2P 연결 오류: ${sessionId}`, err.message);
            // 릴레이로 폴백
            this.setupRelayConnection(sessionId, clientSocket, agent);
        });

        this.setupConnectionCleanup(sessionId, clientSocket, directSocket);
    }

    setupRelayConnection(sessionId, clientSocket, agent) {
        const session = this.activeSessions.get(sessionId);
        session.mode = 'relay';

        // 터널 에이전트에 새 SSH 연결 알림
        agent.socket.emit('new-ssh-connection', {
            sessionId: sessionId,
            clientInfo: {
                address: clientSocket.remoteAddress,
                port: clientSocket.remotePort
            }
        });

        // 클라이언트 데이터 → 터널 에이전트
        clientSocket.on('data', (data) => {
            agent.socket.emit('ssh-data', {
                sessionId: sessionId,
                direction: 'client-to-server',
                data: data.toString('base64')
            });
        });

        // 연결 정리
        this.setupConnectionCleanup(sessionId, clientSocket, null);
    }

    relaySSHData(data) {
        const { sessionId, direction, data: sshData } = data;
        const session = this.activeSessions.get(sessionId);

        if (!session || session.mode !== 'relay') return;

        if (direction === 'server-to-client') {
            session.clientSocket.write(Buffer.from(sshData, 'base64'));
        }
    }

    setupConnectionCleanup(sessionId, clientSocket, directSocket) {
        const cleanup = () => {
            this.activeSessions.delete(sessionId);
            if (directSocket) directSocket.destroy();
            console.log(`🧹 세션 정리: ${sessionId}`);
        };

        clientSocket.on('close', cleanup);
        clientSocket.on('error', cleanup);
        
        if (directSocket) {
            directSocket.on('close', cleanup);
            directSocket.on('error', cleanup);
        }
    }

    handleP2PResult(socket, data) {
        // P2P 결과 처리 로직
        console.log('P2P 결과:', data);
    }

    handleAgentDisconnection(socket) {
        if (socket.agentId) {
            this.tunnelAgents.delete(socket.agentId);
            console.log(`터널 에이전트 해제: ${socket.agentId}`);
        }

        // 관련 세션들 정리
        for (const [sessionId, session] of this.activeSessions) {
            if (session.agent.socket === socket) {
                session.clientSocket.end();
                this.activeSessions.delete(sessionId);
            }
        }
    }

    validateAuth(token) {
        return token === 'transparent-ssh-secret-2024';
    }

    start(socketPort = 3000) {
        // 소켓 서버 시작 (터널 에이전트와 통신용)
        this.httpServer.listen(socketPort, () => {
            console.log(`🔗 터널 에이전트 통신 서버 - 포트 ${socketPort}`);
        });
    }
}

module.exports = TransparentSSHProxy;

// 서버 시작
if (require.main === module) {
    const proxy = new TransparentSSHProxy();
    proxy.start();
}
