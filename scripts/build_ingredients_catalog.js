import fs from 'fs';
import path from 'path';
import { infoprice } from '../lib/infoprice.js';

const SEED_INGREDIENTS = [
  {
    id: 'leite_condensado',
    name: 'Leite Condensado',
    category: 'Laticínios',
    keywords: ['leite condensado', 'leite cond', 'leite moca', 'moca'],
    search: 'leite condensado',
    defaultMeta: {
      descricao: 'LEITE CONDENSADO TRADICIONAL MOÇA LATA 395G',
      marca: 'MOÇA',
      foto: 'https://s3.amazonaws.com/infoprice-prd-imagens/gtin/07891000100103.jpg'
    }
  },
  {
    id: 'creme_de_leite',
    name: 'Creme de Leite',
    category: 'Laticínios',
    keywords: ['creme de leite', 'creme leite', 'creme leite uht'],
    search: 'creme de leite uht nestle',
    defaultMeta: {
      descricao: 'CREME DE LEITE TRADICIONAL UHT NESTLÉ 200G',
      marca: 'NESTLÉ',
      foto: 'https://s3.amazonaws.com/infoprice-prd-imagens/gtin/07891000126905.jpg'
    }
  },
  {
    id: 'creme_de_leite_fresco',
    name: 'Creme de Leite Fresco / Nata',
    category: 'Laticínios',
    keywords: ['creme de leite fresco', 'creme leite fresco', 'nata'],
    search: 'creme de leite fresco tirolez',
    defaultMeta: {
      descricao: 'CREME DE LEITE PASTEURIZADO FRESCO TIROLEZ 250G',
      marca: 'TIROLEZ',
      foto: 'https://s3.amazonaws.com/infoprice-prd-imagens/gtin/07896030522048.jpg'
    }
  },
  {
    id: 'leite_integral',
    name: 'Leite Integral',
    category: 'Laticínios',
    keywords: ['leite integral', 'leite uht integral', 'leite de vaca', 'leite'],
    search: 'leite uht integral italac 1l',
    defaultMeta: {
      descricao: 'LEITE UHT INTEGRAL ITALAC CAIXA 1L',
      marca: 'ITALAC',
      foto: 'https://s3.amazonaws.com/infoprice-prd-imagens/gtin/07898080640611.jpg'
    }
  },
  {
    id: 'manteiga_sem_sal',
    name: 'Manteiga Sem Sal',
    category: 'Laticínios',
    keywords: ['manteiga sem sal', 'manteiga extra sem sal'],
    search: 'manteiga extra sem sal aviacao',
    defaultMeta: {
      descricao: 'MANTEIGA EXTRA SEM SAL AVIAÇÃO 200G',
      marca: 'AVIAÇÃO',
      foto: 'https://s3.amazonaws.com/infoprice-prd-imagens/gtin/07896331100136.jpg'
    }
  },
  {
    id: 'manteiga_com_sal',
    name: 'Manteiga Com Sal',
    category: 'Laticínios',
    keywords: ['manteiga', 'manteiga com sal', 'manteiga derretida', 'buttercream'],
    search: 'manteiga com sal aviacao pote 200g',
    defaultMeta: {
      descricao: 'MANTEIGA COM SAL AVIAÇÃO POTE 200G',
      marca: 'AVIAÇÃO',
      foto: 'https://s3.amazonaws.com/infoprice-prd-imagens/gtin/07896331100310.jpg'
    }
  },
  {
    id: 'margarina',
    name: 'Margarina',
    category: 'Laticínios',
    keywords: ['margarina', 'qualy', 'doriana'],
    search: 'margarina qualy com sal 500g',
    defaultMeta: {
      descricao: 'MARGARINA COM SAL QUALY POTE 500G',
      marca: 'QUALY'
    }
  },
  {
    id: 'doce_de_leite',
    name: 'Doce de Leite',
    category: 'Laticínios',
    keywords: ['doce de leite', 'doce leite'],
    search: 'doce de leite pastoso aviacao',
    defaultMeta: {
      descricao: 'DOCE DE LEITE PASTOSO AVIAÇÃO 400G',
      marca: 'AVIAÇÃO'
    }
  },
  {
    id: 'leite_em_po',
    name: 'Leite em Pó',
    category: 'Laticínios',
    keywords: ['leite em po', 'leite po', 'leite ninho', 'ninho'],
    search: 'leite em po ninho integral',
    defaultMeta: {
      descricao: 'LEITE EM PÓ INTEGRAL FORTI+ NINHO LATA 380G',
      marca: 'NINHO'
    }
  },
  {
    id: 'leite_de_coco',
    name: 'Leite de Coco',
    category: 'Mercearia Doce',
    keywords: ['leite de coco', 'leite coco'],
    search: 'leite de coco sococo 200ml',
    defaultMeta: {
      descricao: 'LEITE DE COCO SOCOCO VIDRO 200ML',
      marca: 'SOCOCO'
    }
  },
  {
    id: 'coco_ralado',
    name: 'Coco Ralado em Flocos',
    category: 'Mercearia Doce',
    keywords: ['coco ralado', 'coco ralado em flocos', 'coco em flocos', 'coco desidratado'],
    search: 'coco ralado em flocos sococo 100g',
    defaultMeta: {
      descricao: 'COCO RALADO EM FLOCOS COCO RAL 100G SOCOCO',
      marca: 'SOCOCO'
    }
  },
  {
    id: 'acucar_refinado',
    name: 'Açúcar Refinado',
    category: 'Açúcar & Adoçantes',
    keywords: ['acucar', 'acucar refinado', 'acucar branco'],
    search: 'acucar refinado uniao 1kg',
    defaultMeta: {
      descricao: 'AÇÚCAR REFINADO UNIÃO 1KG',
      marca: 'UNIÃO'
    }
  },
  {
    id: 'acucar_cristal',
    name: 'Açúcar Cristal',
    category: 'Açúcar & Adoçantes',
    keywords: ['acucar cristal'],
    search: 'acucar cristal uniao 1kg',
    defaultMeta: {
      descricao: 'AÇÚCAR CRISTAL UNIÃO 1KG',
      marca: 'UNIÃO'
    }
  },
  {
    id: 'acucar_confeiteiro',
    name: 'Açúcar de Confeiteiro',
    category: 'Açúcar & Adoçantes',
    keywords: ['acucar de confeiteiro', 'acucar confeiteiro', 'glacucar'],
    search: 'acucar de confeiteiro apti',
    defaultMeta: {
      descricao: 'AÇÚCAR DE CONFEITEIRO APTI 500G',
      marca: 'APTI'
    }
  },
  {
    id: 'acucar_mascavo',
    name: 'Açúcar Mascavo',
    category: 'Açúcar & Adoçantes',
    keywords: ['acucar mascavo'],
    search: 'acucar mascavo uniao 1kg',
    defaultMeta: {
      descricao: 'AÇÚCAR MASCAVO NATURAL UNIÃO 1KG',
      marca: 'UNIÃO'
    }
  },
  {
    id: 'farinha_de_trigo',
    name: 'Farinha de Trigo',
    category: 'Farinhas & Grãos',
    keywords: ['farinha de trigo', 'farinha trigo', 'trigo'],
    search: 'farinha de trigo tradicional dona benta 1kg',
    defaultMeta: {
      descricao: 'FARINHA DE TRIGO TRADICIONAL DONA BENTA 1KG',
      marca: 'DONA BENTA'
    }
  },
  {
    id: 'amido_de_milho',
    name: 'Amido de Milho (Maisena)',
    category: 'Farinhas & Grãos',
    keywords: ['amido de milho', 'amido milho', 'maisena', 'maizena'],
    search: 'amido de milho maizena 200g',
    defaultMeta: {
      descricao: 'AMIDO DE MILHO MAIZENA 200G',
      marca: 'MAIZENA'
    }
  },
  {
    id: 'biscoito_maisena',
    name: 'Biscoito Maisena',
    category: 'Biscoitos & Confeitaria',
    keywords: [
      'biscoito maisena',
      'biscoito de maisena',
      'biscoito tipo maisena',
      'bolacha maisena',
      'bolacha de maisena',
      'bolacha tipo maisena',
      'biscoito maizena',
      'bolacha maizena'
    ],
    search: 'biscoito maisena tostines 200g',
    defaultMeta: {
      descricao: 'BISCOITO MAISENA TOSTINES 200G',
      marca: 'TOSTINES'
    }
  },
  {
    id: 'fermento_em_po',
    name: 'Fermento em Pó Químico',
    category: 'Farinhas & Fermentos',
    keywords: ['fermento em po', 'fermento quimico', 'fermento po', 'fermento bolo'],
    search: 'fermento em po quimico royal 100g',
    defaultMeta: {
      descricao: 'FERMENTO EM PÓ QUÍMICO ROYAL 100G',
      marca: 'ROYAL'
    }
  },
  {
    id: 'fermento_biologico',
    name: 'Fermento Biológico Seco',
    category: 'Farinhas & Fermentos',
    keywords: ['fermento biologico', 'fermento biologico seco', 'fermento pao'],
    search: 'fermento biologico seco fleischmann 10g',
    defaultMeta: {
      descricao: 'FERMENTO BIOLÓGICO SECO FLEISCHMANN 10G',
      marca: 'FLEISCHMANN'
    }
  },
  {
    id: 'bicarbonato_de_sodio',
    name: 'Bicarbonato de Sódio',
    category: 'Farinhas & Fermentos',
    keywords: ['bicarbonato', 'bicarbonato de sodio'],
    search: 'bicarbonato de sodio',
    defaultMeta: {
      descricao: 'BICARBONATO DE SÓDIO KITANO 80G',
      marca: 'KITANO'
    }
  },
  {
    id: 'ovos',
    name: 'Ovos Brancos de Galinha',
    category: 'Ovos & Frios',
    keywords: ['ovos', 'ovo', 'ovos brancos', 'gemas', 'claras'],
    search: 'ovos brancos 12 unidades',
    defaultMeta: {
      descricao: 'OVOS BRANCOS GRANDES BANDEJA COM 12 UNIDADES',
      marca: 'MANTIQUEIRA'
    }
  },
  {
    id: 'oleo_de_soja',
    name: 'Óleo de Soja',
    category: 'Óleos & Azeites',
    keywords: ['oleo', 'oleo de soja', 'oleo de cozinha', 'oleo vegetal'],
    search: 'oleo de soja soya garrafa 900ml',
    defaultMeta: {
      descricao: 'ÓLEO DE SOJA SOYA GARRAFA 900ML',
      marca: 'SOYA'
    }
  },
  {
    id: 'oleo_de_girassol',
    name: 'Óleo de Girassol',
    category: 'Óleos & Azeites',
    keywords: ['oleo de girassol', 'oleo girassol'],
    search: 'oleo de girassol liza 900ml',
    defaultMeta: {
      descricao: 'ÓLEO DE GIRASSOL LIZA GARRAFA 900ML',
      marca: 'LIZA'
    }
  },
  {
    id: 'azeite_de_oliva',
    name: 'Azeite de Oliva Extra Virgem',
    category: 'Óleos & Azeites',
    keywords: ['azeite', 'azeite de oliva', 'azeite extra virgem'],
    search: 'azeite de oliva extra virgem gallo 500ml',
    defaultMeta: {
      descricao: 'AZEITE DE OLIVA EXTRA VIRGEM GALLO VIDRO 500ML',
      marca: 'GALLO'
    }
  },
  {
    id: 'abacaxi',
    name: 'Abacaxi Pérola',
    category: 'Frutas',
    keywords: ['abacaxi', 'abacaxi perola', 'abacaxi picado'],
    search: 'abacaxi perola unidade',
    defaultMeta: {
      descricao: 'ABACAXI PÉROLA UNIDADE',
      marca: 'HORTIFRUTI'
    }
  },
  {
    id: 'laranja',
    name: 'Laranja Pêra',
    category: 'Frutas',
    keywords: ['laranja', 'laranja pera', 'suco de laranja', 'raspas de laranja'],
    search: 'laranja pera kg',
    defaultMeta: {
      descricao: 'LARANJA PÊRA KG',
      marca: 'HORTIFRUTI'
    }
  },
  {
    id: 'limao',
    name: 'Limão Taiti',
    category: 'Frutas',
    keywords: ['limao', 'limao taiti', 'suco de limao', 'raspas de limao'],
    search: 'limao taiti kg',
    defaultMeta: {
      descricao: 'LIMÃO TAITI KG',
      marca: 'HORTIFRUTI'
    }
  },
  {
    id: 'morango',
    name: 'Morango Fresco',
    category: 'Frutas',
    keywords: ['morango', 'morangos', 'morango fresco', 'morangos frescos'],
    search: 'morango fresco nacional caixa 250g',
    defaultMeta: {
      descricao: 'MORANGO FRESCO NACIONAL CAIXA 250G',
      marca: 'HORTIFRUTI'
    }
  },
  {
    id: 'banana',
    name: 'Banana Prata',
    category: 'Frutas',
    keywords: ['banana', 'bananas', 'banana prata', 'banana nanica'],
    search: 'banana prata kg',
    defaultMeta: {
      descricao: 'BANANA PRATA KG',
      marca: 'HORTIFRUTI'
    }
  },
  {
    id: 'maca',
    name: 'Maçã Gala',
    category: 'Frutas',
    keywords: ['maca', 'macas', 'maca gala'],
    search: 'maca gala pacote 1kg',
    defaultMeta: {
      descricao: 'MAÇÃ GALA PACOTE 1KG',
      marca: 'HORTIFRUTI'
    }
  },
  {
    id: 'physalis',
    name: 'Physalis',
    category: 'Frutas',
    keywords: ['physalis', 'fisalis'],
    search: 'physalis berry good 100g',
    defaultMeta: {
      descricao: 'PHYSALIS BERRY GOOD 100G',
      marca: 'BERRY GOOD'
    }
  },
  {
    id: 'chocolate_branco',
    name: 'Chocolate Branco em Barra',
    category: 'Chocolates & Confeitaria',
    keywords: ['chocolate branco', 'chocolate branco em barra', 'chocolate branco nobre', 'galak'],
    search: 'chocolate em barra galak nestle 80g',
    defaultMeta: {
      descricao: 'CHOCOLATE EM BARRA GALAK NESTLÉ 80G',
      marca: 'NESTLÉ'
    }
  },
  {
    id: 'chocolate_meio_amargo',
    name: 'Chocolate Meio Amargo',
    category: 'Chocolates & Confeitaria',
    keywords: ['chocolate meio amargo', 'chocolate meio amargo barra', 'chocolate amargo'],
    search: 'chocolate meio amargo nestle classic tablete 80g',
    defaultMeta: {
      descricao: 'CHOCOLATE MEIO AMARGO NESTLÉ CLASSIC TABLETE 80G',
      marca: 'NESTLÉ'
    }
  },
  {
    id: 'cacau_em_po',
    name: 'Cacau em Pó 100% / Solúvel',
    category: 'Chocolates & Confeitaria',
    keywords: ['cacau', 'cacau em po', 'cacau 100', 'cacau 50'],
    search: 'cacau em po soluvel',
    defaultMeta: {
      descricao: 'CACAU EM PÓ SOLÚVEL DOIS FRADES NESTLÉ 200G',
      marca: 'NESTLÉ'
    }
  },
  {
    id: 'achocolatado',
    name: 'Achocolatado em Pó (Nescau / Toddy)',
    category: 'Chocolates & Confeitaria',
    keywords: ['achocolatado', 'nescau', 'toddy', 'chocolate em po'],
    search: 'achocolatado em po nescau 370g',
    defaultMeta: {
      descricao: 'ACHOCOLATADO EM PÓ NESCAU 370G',
      marca: 'NESCAU'
    }
  },
  {
    id: 'essencia_de_baunilha',
    name: 'Essência de Baunilha',
    category: 'Aromas & Confeitaria',
    keywords: ['baunilha', 'essencia de baunilha', 'extrato de baunilha', 'fava de baunilha'],
    search: 'essencia de baunilha',
    defaultMeta: {
      descricao: 'ESSÊNCIA DE BAUNILHA ARRIFANA 30ML',
      marca: 'ARRIFANA'
    }
  },
  {
    id: 'canela_em_po',
    name: 'Canela em Pó',
    category: 'Especiarias',
    keywords: ['canela', 'canela em po'],
    search: 'canela em po kitano 50g',
    defaultMeta: {
      descricao: 'CANELA EM PÓ KITANO 50G',
      marca: 'KITANO'
    }
  },
  {
    id: 'manjericao',
    name: 'Manjericão Fresco',
    category: 'Ervas & Temperos',
    keywords: ['manjericao', 'manjericao fresco', 'folhas de manjericao'],
    search: 'manjericao folha chacara das folhagens un',
    defaultMeta: {
      descricao: 'MANJERICÃO CHACARA DAS FOLHAGENS UN',
      marca: 'HORTIFRUTI'
    }
  },
  {
    id: 'sal_refinado',
    name: 'Sal Refinado',
    category: 'Temperos Básicos',
    keywords: ['sal', 'sal refinado'],
    search: 'sal refinado cisne 1kg',
    defaultMeta: {
      descricao: 'SAL REFINADO CISNE 1KG',
      marca: 'CISNE'
    }
  },
  {
    id: 'cenoura',
    name: 'Cenoura',
    category: 'Hortifruti',
    keywords: ['cenoura', 'cenouras', 'cenoura ralada'],
    search: 'cenoura kg',
    defaultMeta: {
      descricao: 'CENOURA KG',
      marca: 'HORTIFRUTI'
    }
  },
  {
    id: 'chocolate_ao_leite',
    name: 'Chocolate ao Leite em Barra',
    category: 'Chocolates & Confeitaria',
    keywords: ['chocolate ao leite', 'chocolate ao leite barra', 'chocolate tablete ao leite'],
    search: 'chocolate tablete ao leite nestle',
    defaultMeta: {
      descricao: 'CHOCOLATE TABLETE AO LEITE NESTLÉ 80G',
      marca: 'NESTLÉ'
    }
  },
  {
    id: 'chocolate_granulado',
    name: 'Chocolate Granulado',
    category: 'Chocolates & Confeitaria',
    keywords: ['granulado', 'chocolate granulado', 'confeito granulado'],
    search: 'chocolate granulado dori',
    defaultMeta: {
      descricao: 'CHOCOLATE GRANULADO DORI 120G',
      marca: 'DORI'
    }
  },
  {
    id: 'gelatina_incolor',
    name: 'Gelatina Incolor sem Sabor',
    category: 'Sobremesas & Gelatinas',
    keywords: ['gelatina incolor', 'gelatina sem sabor', 'gelatina em po incolor'],
    search: 'gelatina sem sabor incolor royal',
    defaultMeta: {
      descricao: 'GELATINA SEM SABOR INCOLOR ROYAL 24G',
      marca: 'ROYAL'
    }
  }
];

async function generateCatalog() {
  console.log(`Construindo catálogo curado com ${SEED_INGREDIENTS.length} ingredientes...`);
  const catalog = [];

  for (const item of SEED_INGREDIENTS) {
    console.log(`Buscando GTINs oficiais para [${item.name}]...`);
    let gtins = [];
    let itemsMeta = [];

    try {
      const prods = await infoprice.searchProducts(item.search, { size: 5 });
      for (const p of prods) {
        if (p.identificador) {
          const gtinClean = String(p.identificador).replace(/^0+/, '');
          if (!gtins.includes(gtinClean)) gtins.push(gtinClean);
          if (!gtins.includes(p.identificador)) gtins.push(p.identificador);

          itemsMeta.push({
            gtin: p.identificador,
            descricao: p.descricao,
            marca: p.marca || item.defaultMeta.marca,
            foto: p.foto || item.defaultMeta.foto
          });
        }
      }
    } catch (err) {
      console.warn(`Erro na busca do seed ${item.id}:`, err.message);
    }

    catalog.push({
      id: item.id,
      name: item.name,
      category: item.category,
      keywords: item.keywords,
      search: item.search,
      gtins,
      defaultProduct: itemsMeta[0] || item.defaultMeta,
      candidates: itemsMeta
    });
  }

  const outPath = path.resolve('data/ingredients_catalog.json');
  fs.writeFileSync(outPath, JSON.stringify(catalog, null, 2), 'utf-8');
  console.log(`\n✅ Catálogo curado salvo com sucesso em: ${outPath} (${catalog.length} ingredientes)`);
}

generateCatalog().catch(console.error);
