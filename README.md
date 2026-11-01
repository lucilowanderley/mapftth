# MapFTTH

Sistema web para planejar e documentar redes de fibra óptica FTTH: mapa da rede, diagramas de fusão das caixas,
orçamento óptico até o cliente e importação/exportação KMZ.

Feito com **Laravel 13 + MySQL** no backend e **React + Leaflet** no frontend. O React é compilado para arquivos
estáticos em `public/build`, então o servidor só precisa de PHP e MySQL (nada de Node rodando em produção).

## Funcionalidades (fase 1)

- **Contas e projetos**: cadastro/login, lista de projetos com contagem de CTOs, CEOs, clientes, metragem de cabos e % implantado.
- **Mapa da rede** (satélite, ruas ou escuro): adicionar POP, CEO, CTO, poste e cliente; desenhar cabos ponto a ponto
  ligando as caixas; régua de medição; arrastar caixas (as pontas dos cabos acompanham); busca; camadas por tipo.
- **Cabos**: catálogo (Drop 1/2FO, 6 a 144FO), tipo (backbone, distribuição, drop), status, cor, espessura,
  reserva técnica e comprimento calculado automaticamente.
- **Diagrama de fusão** de CTO/CEO e **editor do POP**: cabos com cores ABNT (e cor de tubo acima de 12 fibras),
  splitters balanceados 1:2 a 1:64 (RF, APC, UPC) e desbalanceados (1/99 a 50/50), OLT (modelos prontos ou
  personalizada) e DIO. Clique numa porta e depois em outra para fundir; auto-fusão em sequência; exportação do
  unifilar em PNG; status da caixa (em projeto, não implantado, implantado, certificado).
- **Orçamento óptico**: potência em cada saída de splitter e em cada cliente, com o percurso detalhado
  (OLT → DIO → fusões → cabos → splitters → drop). Clientes ficam coloridos no mapa conforme o sinal.
- **Análise de rede**: lista de clientes por nível de sinal e ocupação de portas das CTOs.
- **KMZ/KML**: importação (pastas/nomes com CTO, CEO, POP, poste, cliente viram caixas; linhas viram cabos e se ligam
  às caixas a até 15 m) e exportação do projeto completo para o Google Earth.

Os parâmetros de perda (fusão, conector, atenuação da fibra, potência da OLT, limites da ONU) ficam em
**Configurações** de cada projeto.

## Rodando no Laragon (Windows)

Requisitos: PHP **8.3+**, Composer, MySQL e Node 20+ (Node só é necessário se você for alterar o frontend).

```bash
cd C:\laragon\www
git clone https://github.com/lucilowanderley/mapftth.git
cd mapftth
composer install
copy .env.example .env
php artisan key:generate
```

1. Crie o banco `mapftth` no MySQL do Laragon (HeidiSQL ou `mysql -u root -e "create database mapftth"`).
2. Rode `php artisan migrate`.
3. Acesse `http://mapftth.test` (o Laragon cria o host automaticamente; se não, use `php artisan serve`).
4. Clique em **Criar conta**.

Para alterar o frontend: `npm install` e `npm run dev` (recarrega ao salvar) ou `npm run build` para gerar `public/build`.

## Publicando no CloudPanel

1. No CloudPanel, **Add Site → Create a PHP Site**, escolha o template **Laravel** e PHP **8.3** ou superior.
   O template já aponta o Nginx para a pasta `public`.
2. Em **Databases**, crie um banco (ex.: `mapftth`) e um usuário.
3. Entre por SSH com o usuário do site e clone o projeto na pasta do site (o `htdocs/<domínio>`):

   ```bash
   cd ~/htdocs/seu-dominio.com.br
   git clone https://github.com/lucilowanderley/mapftth.git .
   composer install --no-dev --optimize-autoloader
   cp .env.example .env
   php artisan key:generate
   ```

4. Edite o `.env`: `APP_ENV=production`, `APP_DEBUG=false`, `APP_URL=https://seu-dominio.com.br` e os dados
   `DB_DATABASE`, `DB_USERNAME`, `DB_PASSWORD` do banco criado.
5. Rode:

   ```bash
   php artisan migrate --force
   php artisan config:cache && php artisan route:cache && php artisan view:cache
   ```

6. Ative o SSL em **SSL/TLS → Actions → New Let's Encrypt Certificate**.

Os arquivos do frontend já vão compilados em `public/build`, então não é preciso Node no servidor.

**Atualizar depois:** `git pull && composer install --no-dev --optimize-autoloader && php artisan migrate --force && php artisan optimize`.

## Testes

```bash
php artisan test     # API, permissões, KMZ
npm test             # cálculo do orçamento óptico
npm run typecheck
```

## Estrutura

| Caminho | O que tem |
| --- | --- |
| `app/Http/Controllers/Api` | API JSON de projetos, caixas, cabos e KMZ |
| `app/Services/KmlService.php` | Importação e exportação KMZ/KML |
| `database/migrations` | Tabelas `projects`, `network_nodes` (caixas, com o diagrama em JSON) e `cables` |
| `resources/js/pages` | Telas de projetos e do mapa |
| `resources/js/components/DiagramEditor.tsx` | Editor de fusão / POP |
| `resources/js/lib/budget.ts` | Cálculo do orçamento óptico |
| `resources/js/lib/catalog.ts` | Cores ABNT, cabos, splitters e OLTs |

## Próximas fases

Dashboard com indicadores, relatórios por área (PDF/planilha), tabela de postes e camada de postes das
distribuidoras, equipes e permissões, viabilidade por endereço e OTDR.
