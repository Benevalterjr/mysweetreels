import dotenv from 'dotenv';
dotenv.config();

const BASE_URL = (process.env.INFOPRICE_BASE_URL || 'https://api.v2.infoprice.co').replace(/\/+$/, '');
const USERNAME = process.env.INFOPRICE_USERNAME || 'databenti@gmail.com';
const PASSWORD_HASH = process.env.INFOPRICE_PASSWORD_HASH || 'f2556cdbd94e42e9dbe5ac80212e0911a9dd8dc7930c0bb9e6ae89027dee55504c81d34010748b73e239ccbfcaa87b5072d0a9ffa4a0084c31d30b3726324060';
const CLIENT_ID = Number(process.env.INFOPRICE_CLIENT_ID) || 253155;

/**
 * Normaliza e simplifica o nome do ingrediente para busca no catálogo da InfoPrice,
 * traduzindo termos genéricos de receitas para o produto canônico nas gôndolas de supermercado.
 *
 * Exemplo:
 *  - "Laranja (raspadas, suco, fatias para decoração)" -> "laranja pera"
 *  - "Ovos" -> "ovos brancos"
 *  - "Óleo" -> "oleo de soja"
 *  - "Açúcar" -> "acucar refinado"
 *  - "Limão (suco, opcional)" -> "limao taiti"
 *  - "Manjericão (folhas)" -> "manjericao folha"
 */
export function cleanIngredientName(raw) {
  if (!raw || typeof raw !== 'string') return '';

  // 1. Normaliza acentos primeiro (NFD -> remove diacríticos) para regex ASCII segura
  let text = raw.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();

  // 2. Remove parênteses e seus conteúdos (ex: "(suco, opcional)", "(395g)", "(raspadas...)")
  text = text.replace(/\([^)]*\)/g, ' ');

  // 3. Remove números COM unidades de medida grudadas (ex: 200g, 400ml, 1kg, 2l, 100gr, 50g)
  text = text.replace(/\b\d+([.,/]\d+)?\s*(g|gr|gramas?|kg|quilos?|ml|litros?|l)\b/gi, ' ');

  // 4. Remove números isolados e frações (ex: 1/2, 2, 3, 1.5)
  text = text.replace(/\b\d+([.,/]\d+)?\b/g, ' ');

  // 5. Remove unidades de medida comuns em receitas culinárias
  const units = [
    'xicara', 'xicaras', 'xic', 'colher', 'colheres', 'sopa', 'cha', 'sobremesa', 'cafe',
    'lata', 'latas', 'caixa', 'caixas', 'pct', 'pacote', 'pacotes', 'vidro', 'vidros',
    'pitada', 'pitadas', 'gota', 'gotas', 'fatia', 'fatias', 'unidade', 'unidades', 'unid', 'un'
  ];
  const unitRegex = new RegExp(`\\b(${units.join('|')})\\b`, 'gi');
  text = text.replace(unitRegex, ' ');

  // 6. Detecção prévia de termos compostos cruciais antes de remover stop words
  const isManteigaSemSal = /manteiga.*sem sal/i.test(text);
  const isCremeFresco = /creme.*leite.*fresco|nata/i.test(text);
  const isBiscoitoMaisena = /biscoito.*maisena|bolacha.*maisena|maisena/i.test(text) && !/amido/i.test(text);
  const isCocoFlocos = /coco.*ralado|coco.*flocos/i.test(text);

  // 7. Remove preposições, artigos e conectivos
  const stopWords = ['de', 'da', 'do', 'das', 'dos', 'em', 'com', 'para', 'a', 'o', 'ao', 'aos', 'e', 'ou', 'sem', 'tipo'];
  const stopRegex = new RegExp(`\\b(${stopWords.join('|')})\\b`, 'gi');
  text = text.replace(stopRegex, ' ');

  // 8. Remove adjetivos ou termos culinários de preparo que não aparecem no rótulo
  const descriptors = [
    'fresco', 'frescos', 'fresca', 'frescas', 'gelado', 'gelada', 'morno', 'morna',
    'picado', 'picados', 'ralado', 'ralada', 'derretido', 'derretida', 'amolecido',
    'peneirado', 'peneirada', 'nobre', 'puro', 'cremoso', 'cremosa', 'artesanal',
    'craveja', 'cravejado', 'caseiro', 'caseira', 'pronto', 'pronta', 'extra', 'fina',
    'recheio', 'cobertura', 'massa', 'decoracao', 'decorar', 'opcional', 'gosto', 'raspas', 'raspada',
    'raspadas', 'suco', 'folhas', 'fatias', 'cubos', 'pequenos', 'grandes', 'triturado', 'triturada',
    'flocos', 'bem'
  ];
  const descRegex = new RegExp(`\\b(${descriptors.join('|')})\\b`, 'gi');
  text = text.replace(descRegex, ' ');

  // Remove caracteres especiais e normaliza espaços
  text = text.replace(/[^\w\s]/g, ' ').replace(/\s+/g, ' ').trim();

  // 9. Mapeamento Semântico Canônico
  if (isBiscoitoMaisena) return 'biscoito maisena';
  if (isManteigaSemSal) return 'manteiga sem sal';
  if (/manteiga|buttercream/i.test(text)) return 'manteiga com sal';
  if (isCocoFlocos) return 'coco ralado em flocos';
  if (isCremeFresco) return 'creme de leite fresco';
  if (/creme.*leite/i.test(text)) return 'creme de leite';
  if (/leite.*condensado/i.test(text)) return 'leite condensado';
  if (/leite.*integral|leite/i.test(text) && !/coco|condensado|creme/i.test(text)) return 'leite integral';
  if (/amido.*milho|maizena/i.test(text)) return 'amido de milho';
  if (/abacaxi/i.test(text)) return 'abacaxi perola';
  if (/\b(ovos?|gemas?|claras?)\b/i.test(text)) return 'ovos brancos';
  if (/\b(oleo|oleos)\b/i.test(text) && !/coco|oliva|azeite/i.test(text)) return 'oleo de soja';
  if (/azeite/i.test(text)) return 'azeite de oliva';
  if (/laranja/i.test(text)) return 'laranja pera';
  if (/limao/i.test(text)) return 'limao taiti';
  if (/morango/i.test(text)) return 'morango';
  if (/banana/i.test(text)) return 'banana prata';
  if (/maca/i.test(text)) return 'maca gala';
  if (/uva/i.test(text)) return 'uva sem semente';
  if (/maracuja/i.test(text)) return 'maracuja azedo';
  if (/manjericao/i.test(text)) return 'manjericao folha';
  if (/hortela/i.test(text)) return 'hortela fresca';
  if (/alecrim/i.test(text)) return 'alecrim fresco';
  if (/salsa|salsinha|cebolinha|cheiro verde/i.test(text)) return 'cheiro verde';
  if (/oregano/i.test(text)) return 'oregano';
  if (/acucar.*confeiteiro|glacucar/i.test(text)) return 'acucar de confeiteiro';
  if (/acucar.*mascavo/i.test(text)) return 'acucar mascavo';
  if (/acucar.*cristal/i.test(text)) return 'acucar cristal';
  if (/acucar/i.test(text)) return 'acucar refinado';
  if (/farinha.*trigo|trigo/i.test(text)) return 'farinha de trigo';
  if (/fermento.*biologico/i.test(text)) return 'fermento biologico';
  if (/fermento/i.test(text)) return 'fermento em po';
  if (/bicarbonato/i.test(text)) return 'bicarbonato de sodio';
  if (/polvilho.*doce/i.test(text)) return 'polvilho doce';
  if (/polvilho.*azedo/i.test(text)) return 'polvilho azedo';
  if (/doce.*leite/i.test(text)) return 'doce de leite';
  if (/leite.*po|ninho/i.test(text)) return 'leite em po';
  if (/leite.*coco/i.test(text)) return 'leite de coco';
  if (/margarina/i.test(text)) return 'margarina';
  if (/chocolate.*branco/i.test(text)) return 'chocolate branco';
  if (/chocolate.*meio amargo/i.test(text)) return 'chocolate meio amargo';
  if (/chocolate.*amargo/i.test(text)) return 'chocolate amargo';
  if (/cacau|chocolate.*po/i.test(text)) return 'cacau em po';
  if (/achocolatado|nescau|toddy/i.test(text)) return 'achocolatado em po';
  if (/baunilha/i.test(text)) return 'essencia de baunilha';
  if (/canela/i.test(text)) return 'canela em po';
  if (/noz moscada/i.test(text)) return 'noz moscada';
  if (/^sal$/i.test(text)) return 'sal refinado';
  if (/alho/i.test(text)) return 'alho';
  if (/cebola/i.test(text)) return 'cebola';
  if (/cenoura/i.test(text)) return 'cenoura';

  return text.length > 2 ? text : raw.trim();
}

/**
 * Validação rigorosa de produto culinário contra produtos não relacionados.
 * Evita que 'laranja' retorne Fanta/Tang, 'oleo' retorne sardinha em lata,
 * 'ovos' retorne espaguete com ovos, 'manteiga' retorne pipoca de micro-ondas,
 * e 'amido de milho' retorne creme de cabelo.
 */
export function isValidCulinaryProduct(p, cleanedTerm) {
  if (!p) return false;

  const desc = (p.descricao || '').toUpperCase();
  const cat = `${p.categoria || ''} ${p.secao || ''}`.toUpperCase();

  // 1. Rejeição de categorias gerais de Não-Alimentos e Cosméticos
  if (/LIMPEZA|HIGIENE|PERFUMARIA|COSMETICO|PET|UTENSILIO|DESCARTAVEI|LAVANDERIA|AUTOMOTIV|BRINQUEDO|PAPELARIA|CABELO/.test(cat)) {
    return false;
  }

  // 2. Validação para Manteiga: Rejeita pipoca de micro-ondas, salgadinhos, snacks e protetores labiais
  if (/manteiga/i.test(cleanedTerm)) {
    if (/PIPOCA|SALGADINHO|SNACK|APERITIVO|MILHO PARA PIPOCA|AROMA|SABOR MANTEIGA|BISCOITO|BOLACHA|BATOM|LABIAL|PROTETOR LABIAL|CACAU/.test(desc)) {
      return false;
    }
    if (/APERITIVOS E SALGADINHOS/.test(cat)) {
      return false;
    }
  }

  // 3. Validação para Amido de Milho: Rejeita cremes de cabelo (como Skala)
  if (/amido de milho/i.test(cleanedTerm)) {
    if (/SHAMPOO|CONDICIONADOR|CABELO|MASCARA CAPILAR|CREME DE PENTEAR|SKALA/.test(desc) || /CABELO/.test(cat)) {
      return false;
    }
  }

  // 4. Validação para Leite Integral: Rejeita leite de coco, leite condensado, leite de amêndoas
  if (/^leite integral$/i.test(cleanedTerm)) {
    if (/COCO|SOJA|AMENDOA|CONDENSADO|CREME/.test(desc)) {
      return false;
    }
  }

  // 5. Validação para Ovos: Rejeita massas, espaguetes e maioneses
  if (/ovos brancos|ovo/i.test(cleanedTerm)) {
    if (/MACARRAO|ESPAGUETE|SEMOLA|SOPA|PENA|PARAFUSO|MAIONESE|PORTA OVO|FARINHA LACTEA|NHOQUE|LASANHA/.test(desc)) {
      return false;
    }
    if (!/OVOS/.test(cat) && !/\b(OVO|OVOS)\b/.test(desc)) {
      return false;
    }
  }

  // 6. Validação para Óleo de Cozinha: Rejeita enlatados em conserva e cosméticos
  if (/oleo de soja|oleo/i.test(cleanedTerm)) {
    if (/SARDINHA|ATUM|CONSERVA|CORPORAL|CAPILAR|MASSAGEM|LUBRIFICANTE|MOTOR|BRONZEADOR/.test(desc)) {
      return false;
    }
  }

  // 7. Validação para Frutas Cítricas (Laranja / Limão): Rejeita refrigerantes, néctar, pós para suco e isotônicos
  if (/laranja|limao/i.test(cleanedTerm)) {
    if (/REFRIGERANTE|FANTA|SUKITA|GATORADE|ICE TEA|POWERADE|VEJA|NECTAR|REFRESCO EM PO|PO PARA REFRESCO|TANG|ISOTONICO|ENERGETICO|DESINFETANTE|DETERGENTE|AMACIANTE|SABONETE|BALA|CHICLETE/.test(desc)) {
      return false;
    }
  }

  // 8. Validação para Ervas Culinárias (Manjericão, Hortelã, Alecrim): Rejeita molhos de tomate industriais prontos
  if (/manjericao|hortela|alecrim/i.test(cleanedTerm)) {
    if (/MOLHO DE TOMATE|EXTRATO DE TOMATE|POMAROLA|HEINZ|FUGINI|QUERO|TARANTELLA|SACHÊ DE MOLHO|SAZON|MIOJO/.test(desc)) {
      return false;
    }
  }

  // 9. Validação para Açúcar: Rejeita chicletes, balas e adoçantes
  if (/acucar/i.test(cleanedTerm)) {
    if (/CHICLETE|GOMA DE MASCAR|BALA|ADOCANTE|ESFOLIANTE/.test(desc)) {
      return false;
    }
  }

  // 10. Validação para Leite e Chocolates: Rejeita cosméticos e tinturas
  if (/leite|chocolate/i.test(cleanedTerm)) {
    if (/SABONETE|HIDRATANTE|DESODORANTE|SHAMPOO|CONDICIONADOR|ESMALTE|TINTURA/.test(desc)) {
      return false;
    }
  }

  return true;
}

/**
 * Cliente InfoPrice com renovação de token OAuth e cache em memória
 */
class InfoPriceClient {
  constructor() {
    this.accessToken = null;
    this.expiresAt = 0;
    this._tokenPromise = null;
    this._productCache = new Map(); // query -> products[]
    this._shelfCache = new Map();   // key -> { data, timestamp }
  }

  async getAccessToken() {
    const now = Date.now();
    if (this.accessToken && now < this.expiresAt - 60000) {
      return this.accessToken;
    }
    if (this._tokenPromise) {
      return this._tokenPromise;
    }

    this._tokenPromise = (async () => {
      try {
        const tokenUrl = new URL(`${BASE_URL}/portal-acesso-web/oauth/token`);
        tokenUrl.searchParams.set('grant_type', 'password');
        tokenUrl.searchParams.set('password', PASSWORD_HASH);
        tokenUrl.searchParams.set('username', USERNAME);

        const response = await fetch(tokenUrl.toString(), {
          method: 'POST',
          headers: {
            'Accept': 'application/json',
            'Authorization': 'Basic bXktdHJ1c3RlZC1jbGllbnQ6c2VjcmV0',
            'Referer': 'https://app.infoprice.co/',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
          }
        });

        if (!response.ok) {
          const errText = await response.text();
          throw new Error(`Falha no login InfoPrice (${response.status}): ${errText}`);
        }

        const data = await response.json();
        this.accessToken = data.access_token;
        this.expiresAt = Date.now() + (data.expires_in || 3600) * 1000;
        return this.accessToken;
      } finally {
        this._tokenPromise = null;
      }
    })();

    return this._tokenPromise;
  }

  async _fetchWithAuth(endpoint, options = {}) {
    let token = await this.getAccessToken();
    const headers = {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json; charset=utf-8',
      'Accept': 'application/json',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      ...(options.headers || {})
    };

    let response = await fetch(`${BASE_URL}${endpoint}`, {
      ...options,
      headers
    });

    if (response.status === 401) {
      this.accessToken = null;
      token = await this.getAccessToken();
      headers['Authorization'] = `Bearer ${token}`;
      response = await fetch(`${BASE_URL}${endpoint}`, {
        ...options,
        headers
      });
    }

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`InfoPrice API error [${response.status}] ${endpoint}: ${errText}`);
    }

    return await response.json();
  }

  /**
   * Busca produtos correspondentes a um termo (com cache local)
   */
  async searchProducts(query, { size = 5 } = {}) {
    const cleanQ = query.trim().toLowerCase();
    if (!cleanQ) return [];

    if (this._productCache.has(cleanQ)) {
      return this._productCache.get(cleanQ);
    }

    try {
      const payload = {
        query: cleanQ,
        field: 'produto',
        login: USERNAME,
        cliente: CLIENT_ID,
        preco: 'PRECO_PAGO',
        addNotFound: true
      };

      const results = await this._fetchWithAuth(`/cliente/v1/painel_geral/filtros/produto?size=${size}`, {
        method: 'POST',
        body: JSON.stringify(payload)
      });

      const items = Array.isArray(results) ? results : [];
      this._productCache.set(cleanQ, items);
      return items;
    } catch (err) {
      console.warn(`[InfoPrice] Falha na busca por '${query}':`, err.message);
      return [];
    }
  }

  /**
   * Consulta agregada de preços por GTINs e raio ao redor do CEP
   */
  async getAggregatedPrices({ gtins = [], cep = null, raio = 5, daysBack = 90, size = 150 }) {
    if (!gtins || gtins.length === 0) return [];

    const now = new Date();
    const dataFim = now.toISOString().split('T')[0];
    const initialDate = new Date(now.getTime() - daysBack * 24 * 60 * 60 * 1000);
    const dataInicio = initialDate.toISOString().split('T')[0];

    const cleanCep = cep ? String(cep).replace(/\D/g, '') : null;

    const payload = {
      filter: {
        data_inicio: dataInicio,
        data_fim: dataFim,
        cep: cleanCep,
        raio: cleanCep ? Number(raio) : null,
        gtin: gtins.map(String),
        canal: ['Ponto de Venda', 'Marketplace', 'Canal físico'],
        anuncios: false
      },
      group: ['LOJA', 'GTIN'],
      order: [{ by: 'DATAPOINTS', ascending: false }]
    };

    try {
      const res = await this._fetchWithAuth(`/cliente/v1/painel_geral/agregado?size=${size}&page=0`, {
        method: 'POST',
        body: JSON.stringify(payload)
      });
      return res.content || [];
    } catch (err) {
      console.warn(`[InfoPrice] Falha ao consultar preços agregados:`, err.message);
      return [];
    }
  }
}

/**
 * Serviço de enriquecimento de CNPJ usando BrasilAPI com cache
 */
class CnpjService {
  constructor() {
    this.cache = new Map();
  }

  formatStoreName(rawName) {
    if (!rawName) return 'Supermercado';
    const upper = rawName.toUpperCase();

    if (upper.includes('COMPANHIA BRASILEIRA DE DISTRIBUICAO') || upper.includes('PAO DE ACUCAR')) return 'Pão de Açúcar';
    if (upper.includes('EXTRA')) return 'Extra Hipermercado';
    if (upper.includes('CARREFOUR')) return 'Carrefour';
    if (upper.includes('SENDAS') || upper.includes('ASSAI')) return 'Assaí Atacadista';
    if (upper.includes('ATACADAO')) return 'Atacadão';
    if (upper.includes('ST MARCHE') || upper.includes('MARCHE')) return 'St. Marche';
    if (upper.includes('HIROTA')) return 'Hirota Food Supermercados';
    if (upper.includes('MAMBO')) return 'Supermercados Mambo';
    if (upper.includes('SONDA')) return 'Sonda Supermercados';
    if (upper.includes('BERGAMINI')) return 'Supermercados Bergamini';
    if (upper.includes('DIA BRASIL')) return 'Supermercados DIA';
    if (upper.includes('ZAFFARI')) return 'Zaffari Supermercados';
    if (upper.includes('MUFFATO')) return 'Super Muffato';

    let name = rawName
      .replace(/\b(LTDA|S\/A|S\.A\.|EIRELI|COMERCIO|E INDUSTRIA|SUPERMERCADOS|SUPERMERCADO|DISTRIBUICAO|ATACADISTA)\b/gi, '')
      .replace(/[^\w\s]/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    return name.length > 2
      ? name.toLowerCase().split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
      : 'Supermercado Local';
  }

  async getCnpjInfo(rawCnpj) {
    if (!rawCnpj) return null;
    const cnpj = String(rawCnpj).replace(/\D/g, '').padStart(14, '0');

    if (this.cache.has(cnpj)) {
      return this.cache.get(cnpj);
    }

    try {
      const response = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${cnpj}`, {
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        },
        signal: AbortSignal.timeout(6000)
      });

      if (!response.ok) {
        this.cache.set(cnpj, null);
        return null;
      }

      const data = await response.json();
      const nomeBruto = data.nome_fantasia || data.razao_social || `Loja ${cnpj}`;
      const nomeLimpo = this.formatStoreName(nomeBruto);

      const logradouro = data.logradouro ? `${data.descricao_tipo_de_logradouro ? data.descricao_tipo_de_logradouro + ' ' : ''}${data.logradouro}` : '';
      const numero = data.numero || 'S/N';
      const bairro = data.bairro || '';
      const cidade = data.municipio || '';
      const uf = data.uf || '';

      const enderecoPartes = [
        logradouro ? `${logradouro}, ${numero}` : null,
        bairro || null,
        cidade && uf ? `${cidade} - ${uf}` : null
      ].filter(Boolean);

      const info = {
        cnpj,
        razaoSocial: data.razao_social || 'N/D',
        nomeFantasia: nomeLimpo,
        logradouro,
        numero,
        bairro,
        cidade,
        uf,
        cep: data.cep || '',
        enderecoCompleto: enderecoPartes.length > 0 ? enderecoPartes.join(', ') : 'Endereço não disponível'
      };

      this.cache.set(cnpj, info);
      return info;
    } catch (err) {
      this.cache.set(cnpj, null);
      return null;
    }
  }

  async enrichCnpjs(cnpjList) {
    const unique = [...new Set(cnpjList.filter(Boolean))];
    const results = new Map();

    // Paralelismo controlado em lotes de 6
    for (let i = 0; i < unique.length; i += 6) {
      const batch = unique.slice(i, i + 6);
      await Promise.all(
        batch.map(async (rawCnpj) => {
          const info = await this.getCnpjInfo(rawCnpj);
          if (info) {
            results.set(rawCnpj, info);
            results.set(info.cnpj, info);
          }
        })
      );
    }

    return results;
  }
}

export const KNOWN_CHAINS = {
  '47508411': 'Pão de Açúcar',
  '61109673': 'Carrefour',
  '06057223': 'Assaí Atacadista',
  '45543915': 'Atacadão',
  '01878074': 'Sonda Supermercados',
  '43559079': 'Supermercados Bergamini',
  '03666635': 'Trimais Supermercados',
  '60701190': 'Super Muffato',
  '76430438': 'Super Muffato',
  '01366185': 'Supermercados Mambo',
  '49673023': 'Precito Supermercados',
  '03214570': 'St. Marche',
  '52773229': 'Hirota Food Supermercados',
  '00388701': 'Supermercados DIA',
  '92663214': 'Zaffari Supermercados'
};

export const infoprice = new InfoPriceClient();
export const cnpjService = new CnpjService();

// Cache SWR em memória para consultas completas de ingredientes
const memoryShelfCache = new Map();
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hora

/**
 * Função principal: recebe uma lista de ingredientes brutos da receita e o CEP do usuário,
 * pesquisa os produtos correspondentes na InfoPrice, localiza os preços e lojas próximas,
 * calcula a cesta de compras e organiza os melhores pontos de venda.
 */
export async function getRecipeIngredientsPricing({
  items = [],
  cep = '04025010',
  raio = 5
}) {
  const cleanCep = String(cep || '').replace(/\D/g, '');
  const cleanRadius = Math.min(Math.max(Number(raio) || 5, 1), 30);

  if (!cleanCep || cleanCep.length !== 8) {
    throw new Error('CEP inválido. Informe um CEP brasileiro de 8 dígitos.');
  }

  if (!Array.isArray(items) || items.length === 0) {
    return {
      success: true,
      cep: cleanCep,
      raio: cleanRadius,
      ingredientsCount: 0,
      basketSummary: null,
      stores: [],
      ingredientDetails: []
    };
  }

  // Chave de cache com versionamento
  const normalizedItems = items.map(cleanIngredientName).filter(Boolean);
  const cacheKey = `${cleanCep.slice(0, 5)}_${cleanRadius}_${normalizedItems.sort().join('|')}:v4`;

  const cached = memoryShelfCache.get(cacheKey);
  if (cached && (Date.now() - cached.timestamp < CACHE_TTL_MS)) {
    return cached.data;
  }

  // 1. Resolução de cada ingrediente para produtos/GTINs
  const ingredientDetails = [];
  const gtinToIngredientMap = new Map();
  const gtinProductMeta = new Map();

  for (const rawItem of items) {
    const cleaned = cleanIngredientName(rawItem);
    if (!cleaned) continue;

    // Busca até 10 candidatos e filtra com guardrails culinários rigorosos
    const rawCandidates = await infoprice.searchProducts(cleaned, { size: 10 });
    const products = rawCandidates.filter(p => isValidCulinaryProduct(p, cleaned)).slice(0, 3);
    const gtins = products.map(p => p.identificador).filter(Boolean);

    for (const p of products) {
      if (p.identificador) {
        gtinToIngredientMap.set(p.identificador, cleaned);
        gtinProductMeta.set(p.identificador, {
          gtin: p.identificador,
          descricao: p.descricao || cleaned.toUpperCase(),
          marca: p.marca || '',
          foto: p.foto || null,
          categoria: p.categoria || ''
        });
      }
    }

    ingredientDetails.push({
      original: rawItem,
      query: cleaned,
      found: products.length > 0,
      candidates: products.map(p => ({
        gtin: p.identificador,
        descricao: p.descricao,
        marca: p.marca,
        foto: p.foto
      }))
    });
  }

  const allGtins = Array.from(gtinProductMeta.keys());

  if (allGtins.length === 0) {
    const emptyResult = {
      success: true,
      cep: cleanCep,
      raio: cleanRadius,
      ingredientsCount: items.length,
      basketSummary: null,
      stores: [],
      ingredientDetails
    };
    return emptyResult;
  }

  // 2. Consulta de preços agregados no raio pelo CEP
  const aggregatedOffers = await infoprice.getAggregatedPrices({
    gtins: allGtins,
    cep: cleanCep,
    raio: cleanRadius,
    daysBack: 90
  });

  // 3. Enriquece os CNPJs encontrados com dados cadastrais e endereços
  const cnpjs = [...new Set(aggregatedOffers.map(o => o.cnpj).filter(Boolean))];
  const cnpjMap = await cnpjService.enrichCnpjs(cnpjs);

  // 4. Agrupa ofertas por Loja (CNPJ) para calcular a cesta
  const storeMap = new Map();
  const ingredientStats = new Map();

  for (const offer of aggregatedOffers) {
    const cnpj = offer.cnpj;
    const gtin = offer.gtin ? String(offer.gtin).replace(/^0+/, '') : '';
    const originalGtin = offer.gtin;
    const meta = gtinProductMeta.get(gtin) || gtinProductMeta.get(originalGtin) || {};
    const ingredientName = gtinToIngredientMap.get(gtin) || gtinToIngredientMap.get(originalGtin) || meta.descricao || 'Ingrediente';

    const precoMedio = Number(offer.preco_medio || offer.preco_minimo || 0);
    const precoMinimo = Number(offer.preco_minimo || precoMedio);
    const precoMaximo = Number(offer.preco_maximo || precoMedio);

    if (precoMedio <= 0) continue;

    // Atualiza estatísticas do ingrediente
    if (!ingredientStats.has(ingredientName)) {
      ingredientStats.set(ingredientName, {
        minPrice: precoMinimo,
        maxPrice: precoMaximo,
        avgSum: precoMedio,
        count: 1,
        bestOffer: {
          productName: offer.descricao || meta.descricao,
          price: precoMinimo,
          storeCnpj: cnpj,
          photo: meta.foto
        }
      });
    } else {
      const stat = ingredientStats.get(ingredientName);
      if (precoMinimo < stat.minPrice) {
        stat.minPrice = precoMinimo;
        stat.bestOffer = {
          productName: offer.descricao || meta.descricao,
          price: precoMinimo,
          storeCnpj: cnpj,
          photo: meta.foto
        };
      }
      if (precoMaximo > stat.maxPrice) stat.maxPrice = precoMaximo;
      stat.avgSum += precoMedio;
      stat.count += 1;
    }

    // Agrupa na loja
    if (!storeMap.has(cnpj)) {
      const paddedCnpj = String(cnpj).replace(/\D/g, '').padStart(14, '0');
      const storeInfo = cnpjMap.get(cnpj) || cnpjMap.get(paddedCnpj);
      const root8 = paddedCnpj.slice(0, 8);
      const fallbackName = KNOWN_CHAINS[root8] || `Supermercado (CNPJ ${root8})`;

      storeMap.set(cnpj, {
        cnpj,
        name: storeInfo?.nomeFantasia || fallbackName,
        address: storeInfo?.enderecoCompleto || 'Endereço disponível no mapa',
        bairro: storeInfo?.bairro || '',
        cidade: storeInfo?.cidade || '',
        uf: storeInfo?.uf || '',
        items: new Map() // ingredientName -> item offer
      });
    }

    const storeEntry = storeMap.get(cnpj);
    // Guarda o item de menor valor caso haja mais de um GTIN correspondente ao mesmo ingrediente na mesma loja
    if (!storeEntry.items.has(ingredientName) || storeEntry.items.get(ingredientName).price > precoMedio) {
      storeEntry.items.set(ingredientName, {
        ingredient: ingredientName,
        gtin: offer.gtin,
        productName: offer.descricao || meta.descricao,
        brand: meta.marca,
        price: precoMedio,
        minPrice: precoMinimo,
        maxPrice: precoMaximo,
        photo: meta.foto
      });
    }
  }

  // 5. Formata lista de lojas com valor da cesta
  const stores = Array.from(storeMap.values()).map(store => {
    const storeItems = Array.from(store.items.values());
    const basketPrice = storeItems.reduce((acc, it) => acc + it.price, 0);

    const mapsQuery = encodeURIComponent(`${store.name} ${store.address}`);
    const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${mapsQuery}`;

    return {
      cnpj: store.cnpj,
      name: store.name,
      address: store.address,
      bairro: store.bairro,
      cidade: store.cidade,
      uf: store.uf,
      mapsUrl,
      itemsFound: storeItems.length,
      itemsTotal: normalizedItems.length,
      basketPrice: Number(basketPrice.toFixed(2)),
      items: storeItems
    };
  });

  // Ordena lojas: 1º mais ingredientes encontrados, 2º menor preço de cesta
  stores.sort((a, b) => {
    if (b.itemsFound !== a.itemsFound) {
      return b.itemsFound - a.itemsFound;
    }
    return a.basketPrice - b.basketPrice;
  });

  // 6. Atualiza detalhes de cada ingrediente com os melhores preços e fotos
  const enrichedIngredientDetails = ingredientDetails.map(ing => {
    const stat = ingredientStats.get(ing.query);
    if (!stat) {
      return {
        ...ing,
        availableNearby: false,
        bestPrice: null
      };
    }

    const bestStoreInfo = cnpjMap.get(stat.bestOffer.storeCnpj);
    return {
      ...ing,
      availableNearby: true,
      minPrice: Number(stat.minPrice.toFixed(2)),
      avgPrice: Number((stat.avgSum / stat.count).toFixed(2)),
      maxPrice: Number(stat.maxPrice.toFixed(2)),
      bestOffer: {
        ...stat.bestOffer,
        storeName: bestStoreInfo?.nomeFantasia || 'Supermercado Próximo'
      }
    };
  });

  // 7. Resumo global da cesta
  let basketSummary = null;
  const availableItems = enrichedIngredientDetails.filter(d => d.availableNearby);
  if (availableItems.length > 0) {
    const minBasket = availableItems.reduce((acc, it) => acc + (it.minPrice || 0), 0);
    const avgBasket = availableItems.reduce((acc, it) => acc + (it.avgPrice || 0), 0);
    const maxBasket = availableItems.reduce((acc, it) => acc + (it.maxPrice || 0), 0);

    basketSummary = {
      itemsFound: availableItems.length,
      itemsTotal: normalizedItems.length,
      minTotal: Number(minBasket.toFixed(2)),
      avgTotal: Number(avgBasket.toFixed(2)),
      maxTotal: Number(maxBasket.toFixed(2))
    };
  }

  const finalResponse = {
    success: true,
    cep: cleanCep,
    raio: cleanRadius,
    ingredientsCount: normalizedItems.length,
    basketSummary,
    stores: stores.slice(0, 10), // Top 10 lojas mais completas e baratas
    ingredientDetails: enrichedIngredientDetails
  };

  // Salva no cache em memória
  memoryShelfCache.set(cacheKey, {
    timestamp: Date.now(),
    data: finalResponse
  });

  return finalResponse;
}
