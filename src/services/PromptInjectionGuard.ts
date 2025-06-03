import { ALL_PROMPT_INJECTION_PAYLOADS_PTBR, NORMAL_TEXT_CORPUS_PTBR } from '../data/prompt-injection-payloads-ptbr';
import pino from 'pino';

const logger = pino({
  name: 'core:prompt-injection',
  level: process.env.LOG_LEVEL || 'info',
});

export interface PromptInjectionResult {
  isInjection: boolean;
  confidence: number;
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  detectedPatterns: string[];
  category?: 'direct' | 'indirect' | 'jailbreak' | 'data_extraction' | 'system_manipulation';
  reason: string;
  processingTime: number;
}

export class PromptInjectionGuard {
  private directInjectionPatterns: RegExp[];
  private indirectInjectionPatterns: RegExp[];
  private jailbreakPatterns: RegExp[];
  private dataExtractionPatterns: RegExp[];
  private systemManipulationPatterns: RegExp[];
  private suspiciousKeywords: string[];
  
  constructor() {
    this.initializePatterns();
  }
  
  private initializePatterns() {
    // Padrões para detecção direta de prompt injection
    this.directInjectionPatterns = [
      /ignore\s+(todas?\s+as\s+)?instru[çc][õo]es\s+(anteriores?|passadas?|pr[eé]vias?)/i,
      /esque[çc]a\s+(tudo|todas?\s+as\s+regras?)/i,
      /desconsidere\s+(suas?\s+)?instru[çc][õo]es\s+iniciais?/i,
      /voc[êe]\s+agora\s+[ée]\s+(um|uma)/i,
      /modo\s+(desenvolvedor|dev|debug|manuten[çc][ãa]o)\s+ativado/i,
      /todas?\s+as\s+restri[çc][õo]es\s+foram\s+removidas/i,
      /sistema:\s*ignore/i,
      /usu[áa]rio:\s*me\s+d[êe]/i,
    ];
    
    // Padrões para detecção indireta
    this.indirectInjectionPatterns = [
      /como\s+funciona\s+(o\s+)?sistema\s+de\s+autentica[çc][ãa]o/i,
      /quais\s+seriam\s+as\s+vulnerabilidades/i,
      /simular\s+como\s+um\s+atacante/i,
      /para\s+fins\s+(educacionais?|de\s+teste)/i,
      /imagine\s+que\s+voc[êe]\s+[ée]\s+um\s+consultor/i,
      /como\s+um\s+hacker\s+tentaria/i,
      /se\s+voc[êe]\s+fosse\s+um\s+hacker/i,
    ];
    
    // Padrões para jailbreak
    this.jailbreakPatterns = [
      /dan\s*\(do\s+anything\s+now\)/i,
      /chatgpt\s+sem\s+filtros/i,
      /modo\s+de\s+manuten[çc][ãa]o/i,
      /todas?\s+as\s+pol[íi]ticas\s+de\s+uso/i,
      /sem\s+limita[çc][õo]es\s+[ée]ticas/i,
      /carnaval\s+mode/i,
      /voc[êe]\s+pode\s+fazer\s+qualquer\s+coisa/i,
      /fingir\s+que\s+est[áa]\s+em\s+modo/i,
    ];
    
    // Padrões para extração de dados
    this.dataExtractionPatterns = [
      /liste\s+todos?\s+os\s+usu[áa]rios/i,
      /mostre(-me)?\s+(o\s+)?conte[úu]do\s+do\s+arquivo/i,
      /quais\s+s[ãa]o\s+as\s+chaves\s+de\s+api/i,
      /dados\s+reais\s+de\s+clientes/i,
      /cpfs?\s+v[áa]lidos?/i,
      /n[úu]meros?\s+de\s+cart[ãa]o\s+de\s+cr[ée]dito/i,
      /senhas?\s+do\s+sistema/i,
      /vari[áa]veis\s+de\s+ambiente/i,
      /[úu]ltimos?\s+\d+\s+prompts/i,
    ];
    
    // Padrões para manipulação de sistema
    this.systemManipulationPatterns = [
      /execute\s+(o\s+)?comando/i,
      /rm\s+-rf/i,
      /cat\s+\/etc\/passwd/i,
      /acesse\s+(o\s+)?terminal/i,
      /modifique\s+as\s+permiss[õo]es/i,
      /desative\s+(temporariamente\s+)?o\s+sistema/i,
      /altere\s+seu\s+comportamento/i,
      /override\s+all\s+safety/i,
      /base64.*execute/i,
    ];
    
    // Palavras-chave suspeitas
    this.suspiciousKeywords = [
      'ignore', 'esqueça', 'desconsidere', 'override', 'bypass',
      'jailbreak', 'hack', 'exploit', 'vulnerabilidade', 'backdoor',
      'senha', 'password', 'token', 'api key', 'secret', 'confidencial',
      'sistema', ApiKeyScope.ADMIN, 'root', 'sudo', 'execute', 'comando',
      'debug', 'dev mode', 'maintenance', 'developer',
    ];
  }
  
  /**
   * Analisa um texto para detectar tentativas de prompt injection
   */
  analyze(content: string): PromptInjectionResult {
    const startTime = Date.now();
    
    try {
      const detectedPatterns: string[] = [];
      let confidence = 0;
      let category: PromptInjectionResult['category'] | undefined;
      let riskLevel: PromptInjectionResult['riskLevel'] = 'low';
      
      const normalizedContent = content.toLowerCase().trim();
      
      // Verificar padrões diretos
      for (const pattern of this.directInjectionPatterns) {
        if (pattern.test(normalizedContent)) {
          detectedPatterns.push('direct_injection');
          confidence += 0.8;
          category = 'direct';
          riskLevel = 'high';
          break;
        }
      }
      
      // Verificar padrões indiretos
      for (const pattern of this.indirectInjectionPatterns) {
        if (pattern.test(normalizedContent)) {
          detectedPatterns.push('indirect_injection');
          confidence += 0.6;
          if (!category) category = 'indirect';
          if (riskLevel === 'low') riskLevel = 'medium';
          break;
        }
      }
      
      // Verificar jailbreak
      for (const pattern of this.jailbreakPatterns) {
        if (pattern.test(normalizedContent)) {
          detectedPatterns.push('jailbreak');
          confidence += 0.9;
          category = 'jailbreak';
          riskLevel = 'critical';
          break;
        }
      }
      
      // Verificar extração de dados
      for (const pattern of this.dataExtractionPatterns) {
        if (pattern.test(normalizedContent)) {
          detectedPatterns.push('data_extraction');
          confidence += 0.85;
          category = 'data_extraction';
          riskLevel = 'critical';
          break;
        }
      }
      
      // Verificar manipulação de sistema
      for (const pattern of this.systemManipulationPatterns) {
        if (pattern.test(normalizedContent)) {
          detectedPatterns.push('system_manipulation');
          confidence += 0.95;
          category = 'system_manipulation';
          riskLevel = 'critical';
          break;
        }
      }
      
      // Verificar palavras-chave suspeitas
      const suspiciousCount = this.suspiciousKeywords.filter(keyword => 
        normalizedContent.includes(keyword.toLowerCase())
      ).length;
      
      if (suspiciousCount > 0) {
        detectedPatterns.push('suspicious_keywords');
        confidence += Math.min(suspiciousCount * 0.1, 0.4);
        if (riskLevel === 'low' && suspiciousCount >= 3) {
          riskLevel = 'medium';
        }
      }
      
      // Verificar padrões de ofuscação
      if (this.detectObfuscation(normalizedContent)) {
        detectedPatterns.push('obfuscation');
        confidence += 0.3;
        if (riskLevel === 'low') riskLevel = 'medium';
      }
      
      // Verificar encoding suspeito
      if (this.detectSuspiciousEncoding(content)) {
        detectedPatterns.push('suspicious_encoding');
        confidence += 0.4;
        if (riskLevel === 'low') riskLevel = 'medium';
      }

      // Verificar obfuscação Unicode
      if (this.detectUnicodeObfuscation(content)) {
        detectedPatterns.push('unicode_obfuscation');
        confidence += 0.5;
        if (riskLevel === 'low') riskLevel = 'medium';
      }

      // Verificar distância semântica
      const semanticScore = this.calculateSemanticDistance(content);
      if (semanticScore > 0.3) {
        detectedPatterns.push('semantic_similarity');
        confidence += semanticScore;
        if (riskLevel === 'low' && semanticScore > 0.5) riskLevel = 'medium';
      }
      
      // Normalizar confidence
      confidence = Math.min(confidence, 1.0);
      
      // Determinar se é injection
      const isInjection = confidence >= 0.5 || riskLevel === 'critical';
      
      const processingTime = Date.now() - startTime;
      
      const result: PromptInjectionResult = {
        isInjection,
        confidence: Math.round(confidence * 100) / 100,
        riskLevel,
        detectedPatterns,
        category,
        reason: this.generateReason(isInjection, detectedPatterns, confidence),
        processingTime,
      };
      
      logger.debug('Prompt injection analysis completed', {
        contentLength: content.length,
        isInjection,
        confidence: result.confidence,
        riskLevel,
        detectedPatterns,
        processingTime,
      });
      
      return result;
      
    } catch (error) {
      const processingTime = Date.now() - startTime;
      
      logger.error('Prompt injection analysis failed:', error);
      
      return {
        isInjection: false,
        confidence: 0,
        riskLevel: 'low',
        detectedPatterns: [],
        reason: 'Erro na análise de prompt injection',
        processingTime,
      };
    }
  }
  
  /**
   * Detecta padrões de ofuscação
   */
  private detectObfuscation(content: string): boolean {
    // Detectar hífens entre caracteres
    if (/[a-z]-[a-z]-[a-z]/i.test(content)) {
      return true;
    }
    
    // Detectar espaços excessivos
    if (/\s{3,}/.test(content)) {
      return true;
    }
    
    // Detectar caracteres especiais misturados
    if (/[a-z][^a-z\s][a-z]/i.test(content)) {
      return true;
    }
    
    return false;
  }
  
  /**
   * Detecta encoding suspeito
   */
  private detectSuspiciousEncoding(content: string): boolean {
    // Detectar Base64 suspeito
    if (/base64.*[A-Za-z0-9+\/=]{20,}/.test(content)) {
      return true;
    }

    // Detectar hex encoding
    if (/[0-9a-f]{20,}/i.test(content)) {
      return true;
    }

    // Detectar URL encoding suspeito
    if (/%[0-9a-f]{2}/i.test(content) && content.includes('%')) {
      return true;
    }

    // Detectar HTML entities
    if ((content.match(/&#\d+;/g) || []).length > 3) {
      return true;
    }

    // Detectar Unicode escape sequences
    if ((content.match(/\\u[0-9a-fA-F]{4}/g) || []).length > 2) {
      return true;
    }

    return false;
  }

  /**
   * Detecta caracteres Unicode suspeitos e homoglyphs
   */
  private detectUnicodeObfuscation(content: string): boolean {
    // Detectar zero-width characters
    if (/[\u200B\u200C\u200D\u2060\uFEFF]/.test(content)) {
      return true;
    }

    // Detectar caracteres de espaçamento não-padrão
    if (/[\u00A0\u2000-\u200A\u202F\u205F\u3000]/.test(content)) {
      return true;
    }

    // Detectar caracteres matemáticos/especiais em excesso
    const mathChars = content.match(/[\u{1D400}-\u{1D7FF}]/gu) || [];
    if (mathChars.length > 5) {
      return true;
    }

    // Detectar homoglyphs cirílicos
    if (/[а-я]/i.test(content) && /[a-z]/i.test(content)) {
      return true;
    }

    return false;
  }

  /**
   * Calcula distância semântica para detectar paráfrases
   */
  private calculateSemanticDistance(content: string): number {
    const normalizedContent = content.toLowerCase().trim();

    // Palavras-chave de alta suspeição
    const highRiskKeywords = [
      'ignore', 'esqueça', 'desconsidere', 'modo', 'ativar', 'desativar',
      'sistema', 'prompt', 'instruções', 'regras', 'limitações', 'restrições'
    ];

    // Padrões semânticos suspeitos
    const semanticPatterns = [
      /\b(você|vc)\s+(é|eh|e)\s+(agora|now)\b/i,
      /\b(modo|mode)\s+\w+\s+(ativado|ativo|on)\b/i,
      /\b(todas?|all)\s+(as\s+)?(regras?|rules?|limitações?|restrictions?)\b/i,
      /\b(ignore|esqueça|forget)\s+\w+/i,
      /\b(sem|without|no)\s+(limitações?|restrictions?|regras?|rules?)\b/i,
    ];

    let score = 0;

    // Verificar palavras-chave
    for (const keyword of highRiskKeywords) {
      if (normalizedContent.includes(keyword)) {
        score += 0.1;
      }
    }

    // Verificar padrões semânticos
    for (const pattern of semanticPatterns) {
      if (pattern.test(normalizedContent)) {
        score += 0.3;
      }
    }

    return Math.min(score, 1.0);
  }
  
  /**
   * Gera razão para o resultado
   */
  private generateReason(isInjection: boolean, patterns: string[], confidence: number): string {
    if (!isInjection) {
      return 'Conteúdo considerado seguro';
    }
    
    const reasons: string[] = [];
    
    if (patterns.includes('direct_injection')) {
      reasons.push('tentativa direta de prompt injection detectada');
    }
    if (patterns.includes('jailbreak')) {
      reasons.push('tentativa de jailbreak detectada');
    }
    if (patterns.includes('data_extraction')) {
      reasons.push('tentativa de extração de dados detectada');
    }
    if (patterns.includes('system_manipulation')) {
      reasons.push('tentativa de manipulação de sistema detectada');
    }
    if (patterns.includes('indirect_injection')) {
      reasons.push('padrões indiretos de injection detectados');
    }
    if (patterns.includes('suspicious_keywords')) {
      reasons.push('palavras-chave suspeitas encontradas');
    }
    if (patterns.includes('obfuscation')) {
      reasons.push('padrões de ofuscação detectados');
    }
    if (patterns.includes('suspicious_encoding')) {
      reasons.push('encoding suspeito detectado');
    }
    
    const baseReason = reasons.length > 0 ? reasons.join(', ') : 'padrões suspeitos detectados';
    return `${baseReason} (confiança: ${Math.round(confidence * 100)}%)`;
  }
  
  /**
   * Testa o sistema contra os payloads conhecidos
   */
  async testAgainstPayloads(): Promise<{
    totalPayloads: number;
    detected: number;
    missed: number;
    falsePositives: number;
    detectionRate: number;
    falsePositiveRate: number;
    results: Array<{
      payload: string;
      expected: boolean;
      detected: boolean;
      confidence: number;
      category?: string;
    }>;
  }> {
    const results = [];
    let detected = 0;
    let missed = 0;
    
    // Testar payloads maliciosos
    for (const payload of ALL_PROMPT_INJECTION_PAYLOADS_PTBR) {
      const result = this.analyze(payload.payload);
      const wasDetected = result.isInjection;
      
      results.push({
        payload: payload.payload,
        expected: payload.expectedDetection,
        detected: wasDetected,
        confidence: result.confidence,
        category: payload.category,
      });
      
      if (payload.expectedDetection && wasDetected) {
        detected++;
      } else if (payload.expectedDetection && !wasDetected) {
        missed++;
      }
    }
    
    // Testar corpus normal (falsos positivos)
    let falsePositives = 0;
    for (const normalText of NORMAL_TEXT_CORPUS_PTBR) {
      const result = this.analyze(normalText);
      if (result.isInjection) {
        falsePositives++;
      }
      
      results.push({
        payload: normalText,
        expected: false,
        detected: result.isInjection,
        confidence: result.confidence,
        category: 'normal',
      });
    }
    
    const totalPayloads = ALL_PROMPT_INJECTION_PAYLOADS_PTBR.length;
    const detectionRate = Math.round((detected / totalPayloads) * 100);
    const falsePositiveRate = Math.round((falsePositives / NORMAL_TEXT_CORPUS_PTBR.length) * 100);
    
    return {
      totalPayloads,
      detected,
      missed,
      falsePositives,
      detectionRate,
      falsePositiveRate,
      results,
    };
  }
}
