const io = require('socket.io-client');
const net = require('net');

class SSHTunnelAgent {
    constructor(config) {
        this.config = config;
        this.socket = null;
        this.sshConnections = new Map();
        this.reconnectAttempts = 0;
        
        this.connect();
    }

    connect() {
        console.log('🔗 릴레이 서버 연결 중...');
        
        this.socket = io(this.config.relayServer, {
            transports: ['websocket'],
            timeout: 10000
        });

        this.setupEventHandlers();
    }

    setupEventHandlers() {
        this.socket.on('connect', () => {
            console.log('✅ 릴레이 서버 연결됨');
            this.reconnectAttempts = 0;
            this.registerAgent();
        });

        this.socket.on('registration-result', (data) => {
            if (data.success) {
                console.log('✅ 터널 에이전트 등록 성공');
                console.log(`📡 NAT 타입: ${data.natInfo.type}`);
                console.log(`🎯 SSH 서비스 준비 완료`);
                console.log(`💡 외부에서 접속: ssh user@${this.config.relayServerIP}`);
            } else {
                console.error('❌ 등록 실패:', data.error);
            }
        });

        this.socket.on('new-ssh-connection', (data) => {
            this.handleNewSSHConnection(data);
        });

        this.socket.on('ssh-data', (data) => {
            this.relaySSHData(data);
        });

        this.socket.on('disconnect', () => {
            console.log('⚠️ 릴레이 서버 연결 끊어짐');
            this.handleReconnect();
        });

        this.socket.on('connect_error', (error) => {
            console.error('❌ 연결 오류:', error.message);
            this.handleReconnect();
        });
    }

    registerAgent() {
        this.socket.emit('register-agent', {
            agentId: this.config.agentId,
            authToken: this.config.authToken,
            sshPort: this.config.sshPort
        });
    }

    handleNewSSHConnection(data) {
        const { sessionId, clientInfo } = data;
        
        console.log(`🔐 새 SSH 연결: ${sessionId} (${clientInfo.address})`);
        
        // 로컬 SSH 서버에 연결
        const sshConnection = net.createConnection(this.config.sshPort, 'localhost');
        
        sshConnection.on('connect', () => {
            console.log(`✅ SSH 서버 연결: ${sessionId}`);
            this.sshConnections.set(sessionId, sshConnection);
        });

        sshConnection.on('data', (data) => {
            // SSH 서버 → 클라이언트
            this.socket.emit('ssh-data', {
                sessionId: sessionId,
                direction: 'server-to-client',
                data: data.toString('base64')
            });
        });

        sshConnection.on('close', () => {
            console.log(`🔒 SSH 연결 종료: ${sessionId}`);
            this.sshConnections.delete(sessionId);
        });

        sshConnection.on('error', (error) => {
            console.error(`❌ SSH 연결 오류 (${sessionId}):`, error.message);
            this.sshConnections.delete(sessionId);
        });
    }

    relaySSHData(data) {
        const { sessionId, direction, data: sshData } = data;
        
        if (direction === 'client-to-server') {
            const sshConnection = this.sshConnections.get(sessionId);
            if (sshConnection) {
                sshConnection.write(Buffer.from(sshData, 'base64'));
            }
        }
    }

    handleReconnect() {
        if (this.reconnectAttempts < 10) {
            this.reconnectAttempts++;
            const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000);
            
            console.log(`🔄 ${delay/1000}초 후 재연결 시도... (${this.reconnectAttempts}/10)`);
            
            setTimeout(() => {
                this.connect();
            }, delay);
        } else {
            console.error('❌ 최대 재연결 시도 횟수 초과');
            process.exit(1);
        }
    }

    cleanup() {
        console.log('🧹 연결 정리 중...');
        
        for (const [sessionId, connection] of this.sshConnections) {
            connection.destroy();
        }
        
        if (this.socket) {
            this.socket.disconnect();
        }
    }
}

// 설정
const config = {
    relayServer: process.env.RELAY_SERVER || 'http://relay-server-ip:3000',
    relayServerIP: process.env.RELAY_SERVER_IP || 'relay-server-ip',
    agentId: 'home-ssh-agent',
    authToken: 'transparent-ssh-secret-2024',
    sshPort: 22
};

console.log('🚀 투명 SSH 터널 에이전트 시작');
console.log(`📡 릴레이 서버: ${config.relayServer}`);
console.log(`🔐 SSH 포트: ${config.sshPort}`);

const agent = new SSHTunnelAgent(config);

// 종료 처리
process.on('SIGINT', () => {
    console.log('\n🛑 터널 에이전트 종료 중...');
    agent.cleanup();
    process.exit(0);
});

process.on('SIGTERM', () => {
    agent.cleanup();
    process.exit(0);
});
