# 🧁 SweetReels

> **O Pinterest dos Melhores Reels** — Curadoria inteligente de Reels do Instagram (receitas, treinos e tutoriais) com áudio transcrito por Inteligência Artificial, ingredientes deduplicados e reprodutor nativo vertical 9:16 de alta definição.

[![Netlify Status](https://api.netlify.com/api/v1/badges/your-badge/deploy-status)](https://mysweetreels.netlify.app)
[![Powered by Gemini](https://img.shields.io/badge/AI-Gemini%202.5%20Flash-4285F4?logo=google&logoColor=white)](https://aistudio.google.com/)
[![CDN Cloudinary](https://img.shields.io/badge/CDN-Cloudinary-3448C5?logo=cloudinary&logoColor=white)](https://cloudinary.com/)
[![Database Firestore](https://img.shields.io/badge/Database-Cloud%20Firestore-FFA611?logo=firebase&logoColor=white)](https://firebase.google.com/)

---

## ✨ Funcionalidades Principais

* 📱 **Reprodutor Nativo Vertical 9:16:** Streaming direto via Cloudinary CDN em tela cheia, com controles nativos de áudio/vídeo, sem cortes e **sem nenhuma barra preta** lateral.
* 🚫 **Zero Redirecionamentos:** O vídeo toca diretamente na página, contornando limitações de direitos autorais de músicas comerciais da Meta (*"Assistir no Instagram"*).
* 🤖 **Ingestão Inteligente por IA (Gemini 2.5 Flash):**
  * Transcrição integral e fidedigna do áudio falado.
  * Título atrativo e otimizado para SEO no Google.
  * Resumo prático em 2 frases.
  * **Deduplicação de Ingredientes:** Lista limpa de componentes sem repetições de itens nem títulos de seção.
  * Classificação automática em categorias padronizadas e geração de tags.
* ⚡ **Sincronização em Nuvem (Cloud Firestore):** Banco de dados em tempo real com regras de segurança ativas e fallback transparente para cache local (`reels.json`).
* 🧹 **Zero Armazenamento no Servidor / Git:** Os vídeos `.mp4` são processados temporariamente, enviados para a CDN em nuvem e apagados imediatamente do computador (0 MB no repositório).
* 📋 **Checklist Interativo:** Checkboxes interativos para marcar os ingredientes e etapas durante o preparo da receita.
* 🎨 **Grid Responsivo Estilo Pinterest:** Layout masonry moderno com 4 colunas fixas em telas desktop/tablet e 2 colunas no celular.
* 🔍 **Filtros e Busca em Tempo Real:** Pesquisa textual, filtro por criador (@autor), categorias, tags e múltiplas opções de ordenação.
* 🚀 **SEO & Schema.org JSON-LD:** Metatags sociais OpenGraph e dados estruturados Schema.org injetados dinamicamente para indexação em motores de busca.

---

## 📁 Estrutura do Projeto

```text
mysweetreels/
├── lib/                            # Módulos auxiliares do backend
│   ├── cloudinary.js               # Upload e otimização de vídeo na CDN
│   ├── downloader.py               # Extração de vídeo e capa em alta resolução
│   ├── firebase.js                 # Inicialização singleton do Firebase SDK
│   └── gemini_monitor.js           # Monitoramento de cotas, latência e rate limits
│
├── public/                         # Frontend estático servido pelo Netlify
│   ├── app.js                      # Interface, filtros, paginação e modal
│   ├── firebase-config.js          # Sincronização em tempo real com o Firestore
│   ├── index.html                  # Layout responsivo em Tailwind CSS
│   ├── data/
│   │   ├── reels.json              # Catálogo com metadados e URLs da CDN
│   │   └── gemini_usage.json       # Telemetria de requisições do Gemini
│   └── thumbnails/                 # Capas em alta resolução dos Reels
│
├── scripts/                        # Scripts de manutenção e migração
│   ├── migrate_to_firebase.js      # Sincroniza dados locais com o Firestore
│   └── sync_all_cloudinary.js      # Migra vídeos pendentes para o Cloudinary
│
├── ingest.js                       # Pipeline de ingestão de novos Reels
├── server.js                       # Servidor de desenvolvimento local (HTTP 206)
├── firestore.rules                 # Regras de segurança do Cloud Firestore
├── storage.rules                   # Regras do Cloud Storage
├── netlify.toml                    # Configuração de headers e deploy contínuo
├── .env.example                    # Modelo de variáveis de ambiente
└── package.json
```

---

## 🚀 Como Executar Localmente

### 1. Pré-requisitos
* Node.js v20+ instalado
* Python 3.10+ (com `yt-dlp` e `opencv-python`)

### 2. Instalação
Clone o repositório e instale as dependências:
```bash
git clone https://github.com/Benevalterjr/mysweetreels.git
cd mysweetreels
npm install
```

### 3. Configuração de Variáveis de Ambiente
Copie o arquivo de exemplo e insira suas credenciais:
```bash
cp .env.example .env
```
Preencha no arquivo `.env`:
* `GEMINI_API_KEY`: Sua chave do [Google AI Studio](https://aistudio.google.com/apikey).
* `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`: Credenciais da sua conta no [Cloudinary](https://cloudinary.com/).

### 4. Iniciar o Servidor
```bash
npm start
```
Abra no navegador: **`http://localhost:3000`**

---

## 📥 Ingestão de Novos Reels

Para cadastrar uma nova receita ou vídeo no catálogo, execute:

```bash
node ingest.js "https://www.instagram.com/reel/DeUWTtIxm0Q/"
```
*(Você também pode passar apenas o identificador do Reel, por exemplo: `node ingest.js DeUWTtIxm0Q`)*

### O que o script faz automaticamente:
1. Baixa o vídeo e extrai uma capa nítida com cookies do navegador.
2. Envia para o **Gemini 2.5 Flash** para análise multimodal de áudio e imagem.
3. Faz upload do vídeo otimizado para o **Cloudinary CDN**.
4. Apaga o arquivo temporário local para economizar 100% de espaço em disco.
5. Registra o Reel no arquivo `public/data/reels.json` e no **Cloud Firestore**.

---

## 🛠️ Scripts Disponíveis

* `npm start`: Inicia o servidor local na porta 3000 com suporte a streaming HTTP 206.
* `npm run ingest -- <url>`: Processa e publica um novo Reel.
* `npm run migrate:firebase`: Envia os registros locais de `reels.json` para o Firestore.
* `npm run sync:cloudinary`: Verifica vídeos sem URL na nuvem e faz o upload em lote.

---

## 📄 Licença

Distribuído sob a licença ISC. Consulte `package.json` para mais detalhes.
