import axios from 'axios';
import { checkRemoteShieldAPI } from '../src/lib/remote/shieldApi';

// Mock do axios
jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('Remote ShieldAPI Connector', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Retry e Backoff', () => {
    test('Deve tentar novamente após erro 500', async () => {
      // Mock de falha na primeira tentativa, sucesso na segunda
      mockedAxios.post
        .mockRejectedValueOnce({ 
          response: { status: 500 },
          message: 'Internal Server Error'
        })
        .mockResolvedValueOnce({ 
          status: 200, 
          data: { risk: 0.5, blocked: false, reason: 'Teste' } 
        });

      const result = await checkRemoteShieldAPI(
        'texto teste',
        'input',
        { mode: 'balanced', policy: 'default' },
        'api-key-test',
        { failMode: 'open', retryCount: 3, logOnly: false }
      );

      // Verificações
      expect(mockedAxios.post).toHaveBeenCalledTimes(2);
      expect(result.risk).toBe(0.5);
      expect(result.blocked).toBe(false);
    });

    test('Deve atingir o número máximo de tentativas configurado', async () => {
      // Mock de falha em todas as tentativas
      mockedAxios.post.mockRejectedValue({ 
        response: { status: 500 },
        message: 'Internal Server Error'
      });

      await checkRemoteShieldAPI(
        'texto teste',
        'input',
        { mode: 'balanced', policy: 'default' },
        'api-key-test',
        { failMode: 'open', retryCount: 2, logOnly: false }
      );

      // Verificações
      expect(mockedAxios.post).toHaveBeenCalledTimes(2); // Máximo de 2 tentativas
    });

    test('Não deve tentar novamente para erro 403 (não retentável)', async () => {
      // Mock de falha com erro não retentável
      mockedAxios.post.mockRejectedValueOnce({ 
        response: { status: 403 },
        message: 'Forbidden'
      });

      await checkRemoteShieldAPI(
        'texto teste',
        'input',
        { mode: 'balanced', policy: 'default' },
        'api-key-test',
        { failMode: 'open', retryCount: 3, logOnly: false }
      );

      // Verificações
      expect(mockedAxios.post).toHaveBeenCalledTimes(1); // Apenas uma tentativa
    });
  });

  describe('Comportamento de Failover', () => {
    test('Deve retornar bloqueio com fail-closed após falhas', async () => {
      // Mock de falha em todas as tentativas
      mockedAxios.post.mockRejectedValue({ 
        response: { status: 500 },
        message: 'Internal Server Error'
      });

      const result = await checkRemoteShieldAPI(
        'texto teste',
        'input',
        { mode: 'balanced', policy: 'default' },
        'api-key-test',
        { failMode: 'closed', retryCount: 2, logOnly: false }
      );

      // Verificações
      expect(result.blocked).toBe(true);
      expect(result.risk).toBe(1.0);
      expect(result.reason).toContain('Falha ao conectar');
    });

    test('Deve retornar objeto vazio com fail-open após falhas', async () => {
      // Mock de falha em todas as tentativas
      mockedAxios.post.mockRejectedValue({ 
        response: { status: 500 },
        message: 'Internal Server Error'
      });

      const result = await checkRemoteShieldAPI(
        'texto teste',
        'input',
        { mode: 'balanced', policy: 'default' },
        'api-key-test',
        { failMode: 'open', retryCount: 2, logOnly: false }
      );

      // Verificações
      expect(result.blocked).toBeUndefined();
      expect(result.risk).toBeUndefined();
      expect(Object.keys(result).length).toBe(0);
    });

    test('Deve respeitar o modo logOnly mesmo em fail-closed', async () => {
      // Mock de falha em todas as tentativas
      mockedAxios.post.mockRejectedValue({ 
        response: { status: 500 },
        message: 'Internal Server Error'
      });

      const result = await checkRemoteShieldAPI(
        'texto teste',
        'input',
        { mode: 'balanced', policy: 'default' },
        'api-key-test',
        { failMode: 'closed', retryCount: 2, logOnly: true }
      );

      // Verificações - deve retornar vazio mesmo com fail-closed por causa do logOnly
      expect(result.blocked).toBeUndefined();
      expect(Object.keys(result).length).toBe(0);
    });
  });

  test('Deve retornar objeto vazio quando apiKey não é fornecida', async () => {
    const result = await checkRemoteShieldAPI(
      'texto teste',
      'input',
      { mode: 'balanced', policy: 'default' },
      '',
      { failMode: 'closed', retryCount: 3, logOnly: false }
    );

    // Verificações
    expect(mockedAxios.post).not.toHaveBeenCalled();
    expect(Object.keys(result).length).toBe(0);
  });
}); 