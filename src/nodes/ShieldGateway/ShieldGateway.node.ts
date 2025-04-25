import {
  IExecuteFunctions,
  INodeExecutionData,
  INodeType,
  INodeTypeDescription,
  NodeOperationError,
} from 'n8n-workflow';

import { inputGuard } from '../../lib/guards/inputGuard';
import { toolGuard } from '../../lib/guards/toolGuard';
import { outputGuard } from '../../lib/guards/outputGuard';
import { logEvent } from '../../lib/logging/logger';
import { checkRemoteShieldAPI, FailoverConfig } from '../../lib/remote/shieldApi';

export class ShieldGateway implements INodeType {
  description: INodeTypeDescription = {
    displayName: 'Shield Gateway',
    name: 'shieldGateway',
    icon: 'file:shieldGateway.svg',
    group: ['security'],
    version: 1,
    subtitle: '={{$parameter["operation"]}}',
    description: 'Protege fluxos de IA contra injeções, vazamentos e uso indevido',
    defaults: {
      name: 'Shield Gateway',
    },
    inputs: ['main'],
    outputs: ['main'],
    properties: [
      {
        displayName: 'Modo de Operação',
        name: 'mode',
        type: 'options',
        options: [
          {
            name: 'Permissivo',
            value: 'permissive',
            description: 'Apenas loga ameaças, não bloqueia',
          },
          {
            name: 'Equilibrado',
            value: 'balanced',
            description: 'Bloqueia ameaças de alto risco, loga as demais',
          },
          {
            name: 'Restrito',
            value: 'strict',
            description: 'Bloqueia qualquer ameaça potencial',
          },
        ],
        default: 'balanced',
        description: 'Define o comportamento do firewall',
      },
      {
        displayName: 'Política de Segurança',
        name: 'policy',
        type: 'options',
        options: [
          {
            name: 'Padrão',
            value: 'default',
            description: 'Política balanceada para maioria dos casos',
          },
          {
            name: 'Alta Segurança',
            value: 'highSecurity',
            description: 'Foco em prevenção de vazamentos e ataques',
          },
          {
            name: 'Performance',
            value: 'performance',
            description: 'Otimiza para latência mínima',
          },
        ],
        default: 'default',
        description: 'Ajusta as verificações de segurança',
      },
      {
        displayName: 'Modo Remoto',
        name: 'remoteMode',
        type: 'boolean',
        default: false,
        description: 'Ativar modo remoto para usar ShieldAPI',
      },
      {
        displayName: 'API Key',
        name: 'apiKey',
        type: 'string',
        typeOptions: {
          password: true,
        },
        default: '',
        description: 'Chave API para ShieldAPI (somente no modo remoto)',
        displayOptions: {
          show: {
            remoteMode: [true],
          },
        },
      },
      {
        displayName: 'Configurações Avançadas',
        name: 'advancedSettings',
        type: 'boolean',
        default: false,
        description: 'Configurações avançadas para comportamento de failover e resiliência',
      },
      {
        displayName: 'Comportamento de Failover',
        name: 'failoverMode',
        type: 'options',
        options: [
          {
            name: 'Fail-Open (Permite em caso de falha)',
            value: 'open',
            description: 'Em caso de falha na conexão com ShieldAPI, permite a operação',
          },
          {
            name: 'Fail-Closed (Bloqueia em caso de falha)',
            value: 'closed',
            description: 'Em caso de falha na conexão com ShieldAPI, bloqueia a operação',
          },
        ],
        default: 'open',
        description: 'Define como o nó se comporta em caso de falha na conexão com ShieldAPI',
        displayOptions: {
          show: {
            advancedSettings: [true],
            remoteMode: [true],
          },
        },
      },
      {
        displayName: 'Número Máximo de Tentativas',
        name: 'maxRetries',
        type: 'number',
        default: 3,
        description: 'Número máximo de tentativas de conexão com ShieldAPI',
        displayOptions: {
          show: {
            advancedSettings: [true],
            remoteMode: [true],
          },
        },
      },
      {
        displayName: 'Campo de Entrada',
        name: 'inputField',
        type: 'string',
        default: 'prompt',
        description: 'Nome do campo de entrada a ser verificado',
        placeholder: 'ex: prompt, message, input',
      },
      {
        displayName: 'Campo de Saída',
        name: 'outputField',
        type: 'string',
        default: 'response',
        description: 'Nome do campo de saída a ser verificado',
        placeholder: 'ex: response, output, content',
      },
    ],
  };

  async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
    const items = this.getInputData();
    const returnData: INodeExecutionData[] = [];

    const mode = this.getNodeParameter('mode', 0) as string;
    const policy = this.getNodeParameter('policy', 0) as string;
    const remoteMode = this.getNodeParameter('remoteMode', 0) as boolean;
    const apiKey = remoteMode ? this.getNodeParameter('apiKey', 0) as string : '';
    const inputFieldName = this.getNodeParameter('inputField', 0) as string;
    const outputFieldName = this.getNodeParameter('outputField', 0) as string;
    
    // Configurações avançadas
    const advancedSettings = this.getNodeParameter('advancedSettings', 0, false) as boolean;
    
    // Configuração de failover
    let failoverConfig: FailoverConfig = {
      failMode: 'open',
      retryCount: 3,
      logOnly: mode === 'permissive',
    };
    
    if (advancedSettings && remoteMode) {
      failoverConfig = {
        failMode: this.getNodeParameter('failoverMode', 0) as 'open' | 'closed',
        retryCount: this.getNodeParameter('maxRetries', 0) as number,
        logOnly: mode === 'permissive',
      };
    }

    // Processamento de cada item
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const newItem = { ...item };
      
      try {
        // Verificar campo de entrada
        if (item.json[inputFieldName]) {
          const inputText = item.json[inputFieldName] as string;
          const inputResult = await inputGuard(inputText, policy);
          
          // Verificação remota se ativada
          if (remoteMode) {
            const remoteVerdict = await checkRemoteShieldAPI(
              inputText,
              'input',
              { mode, policy },
              apiKey,
              failoverConfig,
            );
            
            // Combinar resultados locais e remotos
            inputResult.risk = Math.max(inputResult.risk, remoteVerdict.risk || 0);
            inputResult.blocked = inputResult.blocked || remoteVerdict.blocked || false;
            inputResult.reason = inputResult.reason || remoteVerdict.reason || '';
          }

          // Registrar evento
          await logEvent({
            stage: 'input',
            content: inputText.substring(0, 100),
            verdict: inputResult.blocked ? 'blocked' : 'allowed',
            risk: inputResult.risk,
            reason: inputResult.reason,
          });

          // Aplicar política conforme o modo
          if (inputResult.blocked && (mode === 'strict' || 
              (mode === 'balanced' && inputResult.risk >= 0.7))) {
            throw new NodeOperationError(
              this.getNode(),
              `Entrada bloqueada: ${inputResult.reason}`,
              { itemIndex: i },
            );
          }

          // Adicionar metadados de segurança
          newItem.json.securityVerdict = {
            input: {
              risk: inputResult.risk,
              reason: inputResult.reason,
            },
          };
        }

        // Verificar possíveis chamadas de ferramentas (se existirem)
        if (item.json.tools || item.json.functions) {
          const toolResult = await toolGuard(item.json, policy);
          
          if (remoteMode) {
            const remoteVerdict = await checkRemoteShieldAPI(
              JSON.stringify(item.json.tools || item.json.functions),
              'tool',
              { mode, policy },
              apiKey,
              failoverConfig,
            );
            
            toolResult.risk = Math.max(toolResult.risk, remoteVerdict.risk || 0);
            toolResult.blocked = toolResult.blocked || remoteVerdict.blocked || false;
            toolResult.reason = toolResult.reason || remoteVerdict.reason || '';
          }

          await logEvent({
            stage: 'tool',
            content: 'Tool validation',
            verdict: toolResult.blocked ? 'blocked' : 'allowed',
            risk: toolResult.risk,
            reason: toolResult.reason,
          });

          if (toolResult.blocked && (mode === 'strict' || 
              (mode === 'balanced' && toolResult.risk >= 0.7))) {
            throw new NodeOperationError(
              this.getNode(),
              `Ferramenta bloqueada: ${toolResult.reason}`,
              { itemIndex: i },
            );
          }

          // Atualizar metadados de segurança
          newItem.json.securityVerdict = {
            ...newItem.json.securityVerdict,
            tool: {
              risk: toolResult.risk,
              reason: toolResult.reason,
            },
          };
        }

        // Verificar campo de saída (se existir)
        if (item.json[outputFieldName]) {
          const outputText = item.json[outputFieldName] as string;
          const outputResult = await outputGuard(outputText, policy);
          
          if (remoteMode) {
            const remoteVerdict = await checkRemoteShieldAPI(
              outputText,
              'output',
              { mode, policy },
              apiKey,
              failoverConfig,
            );
            
            outputResult.risk = Math.max(outputResult.risk, remoteVerdict.risk || 0);
            outputResult.blocked = outputResult.blocked || remoteVerdict.blocked || false;
            outputResult.reason = outputResult.reason || remoteVerdict.reason || '';
          }

          await logEvent({
            stage: 'output',
            content: outputText.substring(0, 100),
            verdict: outputResult.blocked ? 'blocked' : 'allowed',
            risk: outputResult.risk,
            reason: outputResult.reason,
          });

          if (outputResult.blocked && (mode === 'strict' || 
              (mode === 'balanced' && outputResult.risk >= 0.7))) {
            throw new NodeOperationError(
              this.getNode(),
              `Saída bloqueada: ${outputResult.reason}`,
              { itemIndex: i },
            );
          }

          // Atualizar metadados de segurança
          newItem.json.securityVerdict = {
            ...newItem.json.securityVerdict,
            output: {
              risk: outputResult.risk,
              reason: outputResult.reason,
            },
          };
        }

        returnData.push(newItem);
      } catch (error) {
        if (error instanceof NodeOperationError) {
          throw error;
        }
        throw new NodeOperationError(this.getNode(), `Erro: ${(error as Error).message}`, {
          itemIndex: i,
        });
      }
    }

    return [returnData];
  }
} 